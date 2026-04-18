# QA Backend Report — FraudAudit
**Fecha:** 2026-03-28
**Auditor:** Claude Code (QA profundo — solo lectura, sin cambios en código)
**Versión analizada:** commit `21dede1` (branch `main`)
**Alcance:** Todo el backend — API routes, calculadores, parsers, Inngest, integraciones, DB, tests

---

## Resumen ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| 🔴 CRITICAL | 5 |
| 🟠 HIGH | 10 |
| 🟡 MEDIUM | 14 |
| 🟢 LOW | 4 |
| **TOTAL** | **33** |

Los hallazgos más graves son:
1. **Sin tests** — cobertura 0% en toda la lógica de negocio crítica
2. **Supabase service role sin RLS** — cualquier bug de filtro expone todos los datos de todos los usuarios
3. **Race condition financiera** — crédito deducido antes de confirmar el pipeline completo, sin rollback
4. **`isDemo` flag no autenticado** — cualquier usuario puede evitar el cobro de créditos
5. **Bug de división por cero en correlación Spearman** cuando no hay locales

---

## 1. SEGURIDAD

### [SEC-01] 🔴 CRITICAL — Supabase service role bypasea toda RLS
**Archivo:** `lib/supabase.ts:12`
**Descripción:**
`createServerClient()` usa `SUPABASE_SERVICE_ROLE_KEY`, que bypasea **todas** las políticas de Row Level Security de Supabase. El sistema depende exclusivamente de filtros a nivel de aplicación (`.eq('user_id', user.id)`). Si algún route olvida ese filtro — o si se añade uno nuevo sin él — cualquier usuario autenticado podría leer o modificar datos de otro usuario.

```ts
// lib/supabase.ts — actualmente
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!  // bypasea RLS completamente
  )
}
```

**Fix propuesto:**
Activar RLS en todas las tablas (`reports`, `users`, `uploads`, `alert_rules`, `feedback`, `credit_transactions`, `alert_history`). Para operaciones admin (webhook de Clerk/Stripe, Inngest), usar el service role solo donde sea estrictamente necesario y documentarlo. Para el resto de rutas, usar el JWT de Clerk + cliente de Supabase con anon key o service role con RLS activado como defensa en profundidad.

---

### [SEC-02] 🔴 CRITICAL — `isDemo` flag controlado por el usuario evita cobro de créditos
**Archivo:** `app/api/analyze/route.ts:54`
**Descripción:**
El campo `isDemo` viene del body de la petición y no se valida de ninguna manera. Cualquier usuario puede pasar `{ isDemo: true }` en la petición POST a `/api/analyze` para saltarse la deducción de créditos y ejecutar análisis ilimitados gratis.

```ts
// analyze/route.ts:54 — vulnerable
if (!isDemo) {
  const deducted = await deductCredit(user.id, 'analysis', undefined);
  // ...
}
// isDemo viene de body.isDemo sin validación
```

**Fix propuesto:**
- Eliminar el flag `isDemo` del body del cliente completamente. El estado "demo" debe determinarse en el servidor, consultando si el `posUploadId` corresponde a un dataset de demo pre-cargado con una bandera en DB.
- Alternativamente, verificar que `posUploadId` pertenece al usuario antes de aceptarlo.

---

### [SEC-03] 🟠 HIGH — Sin rate limiting en ningún endpoint
**Archivos:** Todos los routes en `app/api/`
**Descripción:**
No existe ningún middleware de rate limiting. Los endpoints más expuestos son:
- `POST /api/upload` — un atacante puede subir GBs de CSVs maliciosos
- `POST /api/analyze` — aún con créditos, pueden enviarse peticiones concurrentes para explotar la race condition SEC-05
- `POST /api/reports/[id]/ai-insights` — puede agotar la cuota de Anthropic API con peticiones masivas
- `POST /api/feedback` y `POST /api/bug-report` — pueden inflar créditos aunque haya anti-abuse checks

**Fix propuesto:**
Añadir rate limiting con `@upstash/ratelimit` + Redis, o usar Vercel's Edge Rate Limiting. Como mínimo, proteger `/api/upload`, `/api/analyze`, y `/api/reports/[id]/ai-insights`.

---

### [SEC-04] 🟠 HIGH — Sin validación de tamaño ni tipo de archivo en upload
**Archivo:** `app/api/upload/route.ts:18,65`
**Descripción:**
El endpoint `/api/upload` acepta cualquier archivo sin límite de tamaño. `file.text()` carga el archivo completo en memoria. Un CSV de 100 MB causaría un OOM en el serverless function. Además, `connectorType` no se valida contra la lista de valores permitidos antes de usarse.

```ts
// upload/route.ts:65 — sin límite de tamaño
const fileContent = await file.text();  // podría ser GB de datos
```

**Fix propuesto:**
```ts
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 });
}

const VALID_CONNECTORS = ['lastapp', 'glop', 'agora', 'revo', 'tspoonlab', 'prezo', 'gstock'];
if (!VALID_CONNECTORS.includes(connectorType)) {
  return NextResponse.json({ error: 'Invalid connectorType' }, { status: 400 });
}
```

---

### [SEC-05] 🟠 HIGH — Race condition financiera: crédito deducido sin transacción atómica end-to-end
**Archivo:** `app/api/analyze/route.ts:54-110`
**Descripción:**
El flujo actual es: `deductCredit()` → `INSERT report` → `inngest.send()`. Si el INSERT falla, el crédito ya se dedujo y no hay rollback. Si `inngest.send()` falla, el report queda en estado `processing` para siempre y el crédito está perdido. No hay ningún mecanismo de compensación.

```ts
// 1. Se deduce el crédito
const deducted = await deductCredit(user.id, 'analysis', undefined);  // crédito -1

// 2. Si esto falla, crédito perdido
const { data: report, error: reportError } = await supabase.from('reports').insert(...).single();
if (reportError || !report) {
  // 🔴 Crédito ya gastado, nunca se devuelve
  return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
}

// 3. Si esto falla, report en 'processing' para siempre
await inngest.send({ name: 'report/analyze', data: { ... } });
// No hay try/catch aquí — si falla, cae al catch externo
```

**Fix propuesto:**
Usar el `reportId` como `referenceId` en `deductCredit` para idempotencia. Si `inngest.send()` falla, hacer refund del crédito. O bien, no deducir el crédito en el route sino en el Inngest step 1 (dentro del pipeline), y si el pipeline falla, el crédito no se gasta.

---

### [SEC-06] 🟠 HIGH — `feedback/route.ts` no valida ownership del reporte
**Archivo:** `app/api/feedback/route.ts:29,71`
**Descripción:**
El endpoint acepta cualquier `reportId` sin verificar que el reporte pertenezca al usuario autenticado. Un atacante podría enviar feedback (y recibir créditos) para reportes de otros usuarios, o inflar el contador de feedback de reportes ajenos.

```ts
// feedback/route.ts:71 — sin verificar que reportId pertenece al usuario
const { error: feedbackError } = await supabase.from('feedback').insert({
  user_id: user.id,
  report_id: reportId,  // no verificado
  ...
});
```

**Fix propuesto:**
Antes de insertar feedback, verificar que el reporte existe y pertenece al usuario:
```ts
const { data: report } = await supabase
  .from('reports')
  .select('id')
  .eq('id', reportId)
  .eq('user_id', user.id)
  .single();
if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
```

---

### [SEC-07] 🟡 MEDIUM — `restaurantName` sin sanitización ni límite de longitud
**Archivo:** `app/api/analyze/route.ts:107`
**Descripción:**
`restaurantName` se guarda en DB y se incluye en emails sin ninguna validación de longitud ni sanitización. Aunque Next.js escapa HTML por defecto en el frontend, los templates de email en `email-templates.ts` usan interpolación directa en HTML, lo que podría permitir inyección de HTML en emails.

**Fix propuesto:**
Añadir `restaurantName.trim().slice(0, 200)` y escapar caracteres HTML en los templates de email (`<`, `>`, `&`, `"`, `'`).

---

### [SEC-08] 🟡 MEDIUM — Sin cabeceras de seguridad HTTP
**Archivo:** `next.config.js`
**Descripción:**
El `next.config.js` está prácticamente vacío. No se configuran cabeceras de seguridad como `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, o `Permissions-Policy`.

**Fix propuesto:**
```js
// next.config.js
const nextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
```

---

### [SEC-09] 🟡 MEDIUM — Inngest client sin configuración explícita de signing key
**Archivo:** `lib/inngest/client.ts:3`
**Descripción:**
```ts
export const inngest = new Inngest({ id: 'fraud-audit' });
```
No se pasa el `signingKey` explícitamente. Aunque Inngest lo lee del env, si `INNGEST_SIGNING_KEY` no está presente en runtime, los eventos se procesarán sin verificación de firma — cualquiera podría enviar eventos a `/api/inngest`.

**Fix propuesto:**
```ts
export const inngest = new Inngest({
  id: 'fraud-audit',
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
```

---

### [SEC-10] 🟢 LOW — `connectorType` no se valida en `/api/analyze`
**Archivo:** `app/api/analyze/route.ts:22-35`
**Descripción:**
`posConnector` e `inventoryConnector` se pasan a `inngest.send()` sin validar que sean valores permitidos. Si un atacante pasa un valor inventado, el Inngest step fallará con "No parser found for connector" y el crédito se pierde (ver SEC-05).

---

## 2. LÓGICA DE NEGOCIO

### [BIZ-01] 🔴 CRITICAL — División por cero en Spearman cuando hay 0 locales
**Archivo:** `lib/calculators/correlation.ts:94`
**Descripción:**
La fórmula Spearman `rho = 1 - (6 * sumDSquared) / (n * (n * n - 1))` se ejecuta solo si `scatterData.length >= 2` (correcto). Pero si `allLocations` es el conjunto vacío (no hay locales en cash ni en invoices — datasets completamente vacíos), `scatterData` sería `[]` y la función retorna sin calcular. Sin embargo, si hay exactamente **1 local**, el guard `>= 2` evita la división por cero pero la función no tiene ningún valor de correlación calculado. Esto está correcto.

El problema real es distinto: cuando `cashByLocal.values()` es vacío, `Math.max(...[].map(Math.abs), 1)` es `Math.max(1)` = 1, lo cual está bien. Pero cuando el conjunto es vacío:

```ts
const maxCash = Math.max(...[...cashByLocal.values()].map(Math.abs), 1);
```

Si `cashByLocal` tiene valores negativos muy grandes, `Math.abs` los convierte en positivos antes del `Math.max`, lo cual es correcto. Sin embargo, la función **siempre entra en el bucle `allLocations`** que itera sobre locales del conjunto vacío — si `allLocations` es vacío, `patternsByLocal` será `[]` y el return es válido.

**Bug real confirmado:** En `correlation.ts:139`, `inventoryScore` usa `inventoryDeviationMax` (valor global) en lugar de un valor por local. Esto hace que **todos los locales reciban exactamente la misma puntuación de inventario**, ignorando qué local tiene peores desviaciones. La puntuación de riesgo combinada no es local-específica en el componente de inventario.

```ts
// Siempre usa el máximo global, no el valor de este local concreto
const inventoryScore =
  normalizeToScale(inventoryDeviationMax, 0, maxInventory) * 0.2;
// Resultado: siempre 20 (100% * 0.2) cuando hay alguna desviación, 0 si no hay
// TODOS los locales reciben el mismo score de inventario
```

**Fix propuesto:**
Propagar la desviación de inventario por local desde el calculator de inventory-deviation, o usar un proxy diferente (ej: peso relativo del local en el dataset de ventas).

---

### [BIZ-02] 🟠 HIGH — `waste-analysis`: false positive cuando no hay datos de merma
**Archivo:** `lib/calculators/waste-analysis.ts:77`
**Descripción:**
Si el dataset no tiene datos de merma (array vacío), `totalWaste = 0` y `wastePercentage = 0`. Como `0 < UNDERREPORTING_THRESHOLD_PCT (1)`, `underreportingAlert = true`. Cualquier reporte sin módulo de inventario recibe falsa alarma de "posible infra-reporte de mermas".

```ts
const underreportingAlert = wastePercentage < UNDERREPORTING_THRESHOLD_PCT;
// Si no hay datos de merma: 0 < 1 = true → ALARMA FALSA
```

**Fix propuesto:**
```ts
const underreportingAlert = waste.length > 0 && wastePercentage < UNDERREPORTING_THRESHOLD_PCT;
```

---

### [BIZ-03] 🟠 HIGH — `lastapp.ts`: `idCounter` es estado global compartido entre peticiones
**Archivo:** `lib/parsers/lastapp.ts:173`
**Descripción:**
```ts
let idCounter = 0; // Estado de módulo — compartido entre todas las invocaciones
```
En un proceso serverless warm-started, `idCounter` no se reinicia entre invocaciones. El reset en línea 181 solo funciona dentro de `parseLastApp`, pero dos peticiones concurrentes podrían generar IDs solapados o no-deterministas. Aunque los IDs solo se usan como identificadores locales dentro del dataset parseado (no en BD), esto puede causar confusión en el debugging y inconsistencias si los IDs se exponen.

**Fix propuesto:**
Convertir a variable local dentro de la función `parseLastApp`:
```ts
export function parseLastApp(csvContent: string): Partial<NormalizedDataset> {
  let idCounter = 0;  // local, no compartido
  // ...
}
```

---

### [BIZ-04] 🟠 HIGH — `cash-discrepancy.ts`: NaN se propaga silenciosamente
**Archivo:** `lib/calculators/cash-discrepancy.ts:24`
**Descripción:**
Si `sale.cash_discrepancy` es `NaN` (posible cuando el parser recibe un campo numérico vacío y el parseNumber falla silenciosamente), la acumulación `entry.totalDiscrepancy += NaN` resulta en `NaN`. Esto nunca dispara alertas ya que ninguna comparación con `NaN` es true.

```ts
entry.totalDiscrepancy += sale.cash_discrepancy;
// Si cash_discrepancy es NaN, totalDiscrepancy = NaN
// NaN < -CRITICAL_SHORTAGE_THRESHOLD → false (silencioso)
```

**Fix propuesto:**
Añadir guard en el accumulador:
```ts
const discrepancy = Number.isFinite(sale.cash_discrepancy) ? sale.cash_discrepancy : 0;
entry.totalDiscrepancy += discrepancy;
```

---

### [BIZ-05] 🟡 MEDIUM — `deleted-products.ts`: fase por defecto es `after_billing` para datos desconocidos
**Archivo:** `lib/parsers/lastapp.ts:121` y `lib/calculators/deleted-products.ts`
**Descripción:**
Cuando la fase de eliminación es desconocida o no está en el CSV, se mapea a `'after_billing'` — la fase más grave. Esto puede inflar el contador de eliminaciones post-facturación y generar falsas alertas CRÍTICAS para datos de mala calidad.

```ts
// lastapp.ts:121
return 'after_billing';  // Default — la más grave
```

**Fix propuesto:**
Default a `'before_kitchen'` (la menos grave) o añadir un valor `'unknown'` al enum para filtrar estas entradas en los calculadores.

---

### [BIZ-06] 🟡 MEDIUM — `volume-detector.ts`: heurística de fecha DD/MM vs MM/DD es incorrecta
**Archivo:** `lib/volume-detector.ts:55`
**Descripción:**
```ts
if (day > 12 || month <= 12) {
  // Asume DD/MM/YYYY
}
```
La condición `month <= 12` es SIEMPRE true para fechas válidas. Esto significa que todos los formatos ambiguos (donde día y mes son <= 12) siempre se interpretan como DD/MM/YYYY. Los archivos exportados en formato americano (MM/DD/YYYY) serán mal interpretados.

---

### [BIZ-07] 🟡 MEDIUM — `conclusions.ts`: el peor local en `data.cash.locals` usa `.reduce` pero presupone orden
**Archivo:** `lib/calculators/conclusions.ts:33`
**Descripción:**
```ts
const worstCashLocal = data.cash.locals.length > 0
  ? data.cash.locals.reduce((worst, l) =>
      l.total_discrepancy < worst.total_discrepancy ? l : worst
    )
  : null;
```
El calculador `cash-discrepancy.ts` ya ordena `locals` por `total_discrepancy` ascendente, por lo que `locals[0]` ya sería el peor. La re-reducción es redundante pero no incorrecta. Sin embargo, si `locals` es `[]`, el `reduce` sin valor inicial lanzará `TypeError: Reduce of empty array with no initial value`. La guarda `data.cash.locals.length > 0` protege este caso... pero solo si es comprobada correctamente. **Confirmado seguro** pero frágil.

---

### [BIZ-08] 🟡 MEDIUM — `mergeDatasets`: metadata puede tener fechas vacías
**Archivo:** `lib/parsers/index.ts:41-53`
**Descripción:**
Si el parser POS no detecta fechas (por columna mal nombrada), `date_from` y `date_to` serán `''`. El report resultante tendrá `analysis_period: ' - '` como texto de periodo — visible en el frontend. No se valida ni se advierte que el periodo es inválido.

---

### [BIZ-09] 🟡 MEDIUM — `correlation.ts`: `CONCENTRATION_THRESHOLD` duplicado entre calculadores
**Archivos:** `lib/calculators/deleted-invoices.ts:8` y `lib/calculators/conclusions.ts:22`
**Descripción:**
`CONCENTRATION_THRESHOLD = 0.4` está definido en `deleted-invoices.ts` y `INVOICE_CONCENTRATION_THRESHOLD = 0.4` está definido en `conclusions.ts`. Si se modifica uno sin el otro, las conclusiones y los datos del reporte tendrán umbrales distintos, causando inconsistencias donde el cálculo dice "no hay concentración anómala" pero la conclusión dice "sí hay".

---

## 3. BASE DE DATOS

### [DB-01] 🔴 CRITICAL — Sin Row Level Security activa
**Descripción:**
Como se detalla en SEC-01, las tablas no tienen RLS. A diferencia de un bug de código, esto es una vulnerabilidad de configuración de base de datos. Si las políticas RLS estuvieran activas, un bug en el código de filtrado resultaría en un error 403, no en una fuga de datos.

**Fix propuesto:**
Activar RLS en todas las tablas y crear políticas mínimas:
```sql
-- Ejemplo para reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only see own reports"
  ON reports FOR ALL
  USING (user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()));
```

---

### [DB-02] 🟠 HIGH — `dashboard/route.ts` carga `report_data` completo para todos los reportes
**Archivo:** `app/api/dashboard/route.ts:28-33`
**Descripción:**
```ts
.select('id, slug, status, created_at, ..., report_data')  // JSON completo
```
`report_data` es un JSONB que puede pesar varios KB por reporte. Para un usuario con 50 reportes, esto transfiere potencialmente 500KB+ solo para mostrar el dashboard. Solo se usa un campo: `report_data.summary.organization_name`.

**Fix propuesto:**
Usar extracción de JSONB en la query de Supabase:
```ts
.select('..., report_data->summary->>organization_name as organization_name')
```
O mejor: añadir una columna `organization_name` separada en la tabla `reports`.

---

### [DB-03] 🟠 HIGH — N+1 queries en evaluación de alertas
**Archivo:** `lib/inngest/functions.ts:184-189`
**Descripción:**
```ts
for (const t of triggered) {
  await supabase
    .from('alert_rules')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', t.ruleId);  // N queries individuales
}
```
Si se disparan 10 alertas, se ejecutan 10 UPDATE separados en lugar de un único `UPDATE ... WHERE id IN (...)`.

**Fix propuesto:**
```ts
const ruleIds = triggered.map((t) => t.ruleId);
await supabase
  .from('alert_rules')
  .update({ last_triggered_at: new Date().toISOString() })
  .in('id', ruleIds);
```

---

### [DB-04] 🟡 MEDIUM — `getTransactionHistory` sin límite de resultados
**Archivo:** `lib/credits.ts:182`
**Descripción:**
```ts
const { data, error } = await supabase
  .from('credit_transactions')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  // Sin .limit()
```
Un usuario activo con miles de transacciones recibirá el payload completo. Aunque `settings/route.ts` añade `.limit(50)` en su propia query, el export de `getTransactionHistory` no tiene límite.

---

### [DB-05] 🟡 MEDIUM — Race condition en feedback: check-then-act
**Archivo:** `app/api/feedback/route.ts:60-93`
**Descripción:**
```ts
// 1. Check si ya existe feedback
const { data: existingFeedback } = await supabase.from('feedback')...
const isFirstFeedback = !existingFeedback || existingFeedback.length === 0;

// 2. Insertar feedback (sin transacción)
await supabase.from('feedback').insert(...)

// 3. Si era primero, award crédito
if (isFirstFeedback) {
  creditAwarded = await awardCredit(user.id, 'feedback', reportId);
}
```
Dos peticiones concurrentes podrán pasar ambas el check y ambas intentar el award. La función `awardCredit` usa la referencia `reportId` para idempotencia, así que el crédito no se duplicará, pero sí se insertarán dos registros de feedback para el mismo reporte.

**Fix propuesto:**
Añadir una restricción UNIQUE en la tabla `feedback` sobre `(user_id, report_id)` y manejar el error de duplicate key.

---

### [DB-06] 🟡 MEDIUM — Índices potencialmente faltantes
**Descripción:**
Sin acceso directo al schema de Supabase, se infieren estas queries frecuentes sin índices confirmados:
- `reports` filtrado por `user_id` (múltiples routes)
- `credit_transactions` filtrado por `user_id` + `reason` (canEarnReward)
- `uploads` filtrado por `user_id`
- `alert_rules` filtrado por `user_id` + `is_active`

**Fix propuesto:**
```sql
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_reason ON credit_transactions(user_id, reason);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user_active ON alert_rules(user_id, is_active);
```

---

## 4. INNGEST PIPELINE

### [INN-01] 🔴 CRITICAL — Reporte queda en estado `processing` para siempre si el pipeline falla
**Archivo:** `lib/inngest/functions.ts`
**Descripción:**
Si los steps 2-4 (`parse-pos-data`, `parse-inventory-data`, `generate-report`) fallan y agotan los reintentos de Inngest, el reporte queda con `status = 'processing'` en la DB permanentemente. No hay ningún paso de cleanup ni notificación al usuario.

```
Steps 1-4: ningun try/catch — si fallan tras max retries → report queda en 'processing'
Step 5 (update-status-completed): solo se ejecuta si steps 1-4 tienen éxito
```

**Fix propuesto:**
Añadir una función de `onFailure` en Inngest:
```ts
export const analyzeReport = inngest.createFunction(
  {
    id: 'analyze-report',
    onFailure: async ({ event, error }) => {
      const supabase = createServerClient();
      await supabase.from('reports')
        .update({ status: 'failed', error_message: error.message })
        .eq('id', event.data.reportId);
      // Opcional: refund del crédito
    },
  },
  ...
)
```

---

### [INN-02] 🟠 HIGH — `inngest.send()` falla silenciosamente en `/api/analyze`
**Archivo:** `app/api/analyze/route.ts:97`
**Descripción:**
```ts
await inngest.send({
  name: 'report/analyze',
  data: { ... },
});
// Si esto lanza, cae al catch externo que devuelve 500
// Pero el crédito ya fue deducido y el report ya fue creado con status 'processing'
```
Si `inngest.send()` falla (red, configuración, etc.), el usuario recibe un error 500, pero en la DB hay un reporte `processing` y le falta un crédito.

**Fix propuesto:**
Capturar el error específico de `inngest.send()` y hacer compensación:
```ts
try {
  await inngest.send({ name: 'report/analyze', data: { ... } });
} catch (inngestErr) {
  // Rollback: marcar reporte como 'failed' y devolver crédito
  await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id);
  await awardCreditsRaw(user.id, 1, 'refund_inngest_send_failure', report.id);
  throw inngestErr; // propagar para 500
}
```

---

### [INN-03] 🟠 HIGH — Datos del usuario se fetchen dos veces en la misma ejecución Inngest
**Archivo:** `lib/inngest/functions.ts:109,192`
**Descripción:**
La query `SELECT email, name FROM users WHERE id = userId` se ejecuta en el step 6 (email del reporte) y otra vez en el step 7 (alertas). Como son steps separados, no se puede reutilizar el resultado.

**Fix propuesto:**
Añadir un step 0 explícito que fetchee los datos del usuario y los retorne para uso posterior, o fusionar los steps 6 y 7.

---

### [INN-04] 🟡 MEDIUM — Sin límite de concurrencia ni timeout para el step de Claude API
**Archivo:** `lib/inngest/functions.ts:235`
**Descripción:**
La llamada a Claude API (step `generate-ai-insights`) no tiene timeout explícito. Si la API de Anthropic tarda más de 30s (límite habitual de Vercel serverless), la función expira silenciosamente. Inngest reintentará el step, causando posibles llamadas duplicadas a Claude.

Además, no hay límite de concurrencia para la función entera, lo que podría llevar a múltiples análisis concurrentes que agoten el contexto de memoria.

**Fix propuesto:**
```ts
export const analyzeReport = inngest.createFunction(
  {
    id: 'analyze-report',
    concurrency: { limit: 5 },  // máximo 5 análisis simultáneos
    retries: 3,
  },
  ...
)
```
Y añadir un timeout `AbortSignal` en la llamada a `generateAIInsights`.

---

### [INN-05] 🟡 MEDIUM — `step.run('update-status-processing')` es redundante
**Archivo:** `lib/inngest/functions.ts:26-31`
**Descripción:**
El reporte ya se crea con `status = 'processing'` en `/api/analyze/route.ts:75`. El step 1 del pipeline vuelve a hacer el mismo UPDATE. Esto es una query innecesaria y puede causar conflictos si el step se reintenta.

---

## 5. INTEGRACIONES

### [INT-01] 🟠 HIGH — Nombre de modelo Claude hardcodeado y potencialmente deprecado
**Archivo:** `lib/ai-insights-generator.ts:78`
**Descripción:**
```ts
model: 'claude-sonnet-4-20250514',
```
Este model ID hardcodeado puede quedar deprecado. Cuando Anthropic retire este modelo, todas las llamadas fallarán silenciosamente (la función retorna `null` en caso de error). Los reportes generarán sin insights de IA sin ninguna alerta.

**Fix propuesto:**
```ts
model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
```

---

### [INT-02] 🟠 HIGH — Truncado de JSON antes de enviarlo a Claude produce JSON inválido
**Archivo:** `lib/ai-insights-generator.ts:67-69`
**Descripción:**
```ts
serialized = serialized.slice(0, MAX_PAYLOAD_CHARS) + '\n... [truncado por tamaño]'
// El resultado: JSON truncado a mitad de un objeto + texto literal
```
Este string no es JSON válido. Claude recibe algo como:
```
{ "summary": { "organization_name": "Mi Restaur... [truncado por tamaño]
```
Esto puede provocar que Claude genere insights incorrectos o que falle la validación post-proceso.

**Fix propuesto:**
Truncar de forma inteligente — eliminar secciones menos críticas del report data (scatter_data, transacciones individuales) antes de serializar, en lugar de truncar el string JSON.

---

### [INT-03] 🟠 HIGH — Bug en Stripe webhook: `return` dentro del bucle de line items
**Archivo:** `app/api/webhooks/stripe/route.ts:88`
**Descripción:**
```ts
for (const item of lineItems.data) {
  // ...
  if (newBalance === -1) {
    // ⚠️ Return DENTRO del for — si el primer item es duplicado,
    // los siguientes items nunca se procesan
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }
  totalCreditsAwarded += totalCredits;
}
```
Si un checkout session tiene múltiples line items (por ejemplo, pack de 5 + pack de 15) y el primer item ya fue procesado (duplicado), los créditos del segundo item nunca se conceden.

**Fix propuesto:**
Convertir el `return` en `continue` y llevar un contador de ítems ya procesados:
```ts
let anyDuplicate = false;
for (const item of lineItems.data) {
  const newBalance = await awardCreditsRaw(...);
  if (newBalance === -1) { anyDuplicate = true; continue; }
  totalCreditsAwarded += totalCredits;
}
if (anyDuplicate && totalCreditsAwarded === 0) {
  return NextResponse.json({ received: true, duplicate: true });
}
```

---

### [INT-04] 🟡 MEDIUM — Email de bienvenida enviado sin `await` — errores no capturados
**Archivo:** `app/api/webhooks/clerk/route.ts:104`
**Descripción:**
```ts
// Sin await — la promesa se "olvida"
sendEmail({ to: email, subject: welcomeTemplate.subject, html: welcomeTemplate.html });
```
Si `sendEmail` lanza una excepción no capturada (que no debería porque tiene try/catch interno), podría crear un unhandled promise rejection. Más importante: no hay forma de saber si el email de bienvenida se envió o no.

---

### [INT-05] 🟡 MEDIUM — Archivos CSV se almacenan como texto UTF-8 en Supabase Storage
**Archivo:** `app/api/upload/route.ts:70`
**Descripción:**
```ts
const fileContent = await file.text();  // Decodifica a UTF-8
await supabase.storage.from('uploads').upload(storagePath, fileContent, {
  contentType: file.type || 'text/csv',
});
```
Los CSVs exportados por aplicaciones de TPV españolas (Agora, Glop, etc.) frecuentemente usan Windows-1252 o Latin-1. `file.text()` los decodifica como UTF-8, corrompiendo caracteres especiales (`€`, `ñ`, `á`, etc.) que son críticos para identificar locales y empleados. El archivo almacenado en Storage tendrá los caracteres ya corrompidos.

**Fix propuesto:**
Almacenar el archivo como `ArrayBuffer` (binario) y decodificar con el charset correcto al parsear:
```ts
const buffer = await file.arrayBuffer();
// Almacenar como binario
await supabase.storage.from('uploads').upload(storagePath, buffer, {
  contentType: file.type || 'text/csv',
});
// Al leer: detectar charset con 'chardet' o forzar Latin-1 para TPVs españoles
```

---

## 6. PERFORMANCE

### [PERF-01] 🟠 HIGH — Análisis completo es CPU-síncrono y bloqueante
**Archivo:** `lib/analysis-engine.ts:90`
**Descripción:**
```ts
export function runAnalysis(dataset: NormalizedDataset): ReportData {
  const cashDiscrepancy = calculateCashDiscrepancy(dataset.daily_sales)  // síncrono
  const deletedInvoices = calculateDeletedInvoices(dataset.invoices)      // síncrono
  // ... 5 calculadores más
}
```
Para un dataset con 100k filas de ventas diarias y 50k facturas, `runAnalysis` puede bloquear el event loop de Node.js durante segundos. En Vercel, esto puede causar timeouts o degradar otras peticiones concurrentes.

**Fix propuesto:**
Aunque los calculadores son CPU-bound (no se pueden hacer async nativamente), se pueden paralelizar con `Promise.all` si se mueven a worker threads, o al menos estructurar el Inngest step para cada calculador individualmente, permitiendo que Inngest gestione el tiempo.

---

### [PERF-02] 🟡 MEDIUM — Generación de PDF carga `report_data` completo en memoria
**Archivo:** `app/api/reports/[reportId]/pdf/route.ts:64-70`
**Descripción:**
`renderToBuffer` de `@react-pdf/renderer` es CPU-intensivo. Para reportes grandes, puede consumir 200-500MB de RAM en el serverless function. No hay límite de tamaño ni timeout.

---

### [PERF-03] 🟡 MEDIUM — Múltiples lookups del mismo usuario en el mismo request
**Descripción:**
El patrón Clerk userId → Supabase user ID se repite en cada request con una query individual. Para endpoints que hacen 5+ queries a la BD, el lookup del usuario es overhead constante. En un sistema con alta concurrencia, esto suma.

**Fix propuesto:**
Cachear el mapping clerk_id → user_id en memoria (Map con TTL corto) o usar un campo en el JWT.

---

## 7. MANEJO DE ERRORES

### [ERR-01] 🟠 HIGH — Errores de parsing de CSV completamente silenciosos
**Archivos:** `lib/parsers/lastapp.ts:324,427`
**Descripción:**
```ts
} catch {
  // Skip malformed row and continue — sin logging
  continue;
}
```
Los errores de parsing se ignoran silenciosamente. Si un archivo CSV tiene un formato diferente al esperado, el parser produce un dataset vacío o parcial sin ninguna advertencia. El usuario recibe un reporte con todos los indicadores en 0 sin saber por qué.

**Fix propuesto:**
Acumular errores de parsing y retornarlos como warnings:
```ts
const parseWarnings: string[] = [];
// En el catch:
parseWarnings.push(`Row ${rowIndex}: ${err.message}`);
// Incluir warnings en el dataset retornado
```

---

### [ERR-02] 🟠 HIGH — `generateReport` puede fallar pero el crédito ya fue deducido
**Descrito en:** SEC-05 / INN-01
**Archivo:** `lib/inngest/functions.ts:79-90`
**Descripción:**
`generateReport` hace un UPDATE a la BD. Si falla (timeout, conexión caída), Inngest reintenta el step completo. Pero `generateReport` primero llama `runAnalysis` (CPU) y luego hace el UPDATE. En el reintento, `runAnalysis` se ejecuta de nuevo correctamente, pero si el UPDATE sigue fallando, el informe nunca se completa y el usuario pierde el crédito.

---

### [ERR-03] 🟡 MEDIUM — Logging de errores inconsistente: `console.error` vs nada
**Descripción:**
Algunos errores se loggean con `console.error`, otros son silenciosos, y algunos usan `console.warn`. No hay sistema de logging estructurado (nivel, contexto, trace ID). En producción, es difícil correlacionar errores de Inngest con la request original.

**Fix propuesto:**
Adoptar un logger estructurado (ej: `pino`) con campos: `{ level, traceId, userId, reportId, message, error }`.

---

### [ERR-04] 🟡 MEDIUM — `analytics` calls (`serverTrackCreditSpent`) con datos incorrectos
**Archivo:** `app/api/analyze/route.ts:113`
**Descripción:**
```ts
serverTrackCreditSpent(user.id, 'analysis', -1); // Will update with real balance later
```
El balance enviado a PostHog es `-1`, un valor placeholder que nunca se actualiza. Los dashboards de analytics mostrarán balances incorrectos para el evento `credit_spent`.

---

## 8. TESTS

### [TEST-01] 🔴 CRITICAL — Cobertura de tests: 0%
**Descripción:**
El proyecto no tiene **ningún test** propio. Solo existen tests de `node_modules/zod`. No hay:
- Tests unitarios para los 7 calculadores de fraude
- Tests de integración para los parsers de CSV
- Tests de API routes
- Tests para la lógica de créditos y anti-abuse
- Tests para el pipeline de Inngest

**Impacto:**
Cualquier cambio en la lógica de análisis puede romper silenciosamente los cálculos de fraude sin detección. El dashboard de riesgo que usan los clientes se basa en cálculos no verificados.

**Tests críticos a implementar (prioridad):**

```
1. lib/calculators/cash-discrepancy.test.ts
   - Empty sales array
   - NaN/undefined values
   - Single location
   - All positive discrepancies (no shortage)

2. lib/calculators/correlation.test.ts
   - n=0 locations (empty dataset)
   - n=1 location (no correlation possible)
   - n=2 with perfect correlation
   - n=2 with zero correlation

3. lib/calculators/waste-analysis.test.ts
   - Empty waste array (false positive alert)
   - Zero total_sales (division by zero guard)
   - 100% waste percentage

4. lib/parsers/lastapp.test.ts
   - Empty CSV
   - CSV with unknown headers
   - Spanish locale numbers (1.234,56)
   - Mixed date formats

5. lib/credits.test.ts
   - deductCredit when balance = 0
   - awardCredit with duplicate referenceId (idempotency)
   - canEarnReward limits

6. app/api/analyze/route.test.ts
   - isDemo bypass vulnerability
   - Missing posUploadId
   - User not found

7. app/api/webhooks/stripe/route.test.ts
   - Valid webhook signature
   - Invalid signature
   - Duplicate webhook (idempotency)
   - Multi-item checkout with one duplicate
```

**Stack recomendado:** `vitest` + `@testing-library/react` para componentes, `msw` para mock de APIs externas.

---

### [TEST-02] 🟠 HIGH — Sin tests de regresión para los parsers de CSV
**Descripción:**
Los parsers son el código más crítico: si fallan, todo el análisis produce ceros. Deberían tener fixtures de CSVs reales para cada conector (lastapp, glop, agora, revo, etc.) y verificar que el output normalizado es correcto.

---

## 9. HALLAZGOS ADICIONALES (LOW)

### [LOW-01] — `env.ts` no se importa en todas las rutas
`lib/env.ts` valida las variables de entorno, pero solo si alguien lo importa. No se importa en `app/api/inngest/route.ts`. Si faltan variables de Inngest, el error se producirá en runtime en lugar de en startup.

### [LOW-02] — `Stripe` se instancia en cada request, no en module level
`app/api/checkout/route.ts:64` instancia `new Stripe(...)` dentro del handler. Aunque Stripe no es costoso de inicializar, el patrón correcto es inicializarlo una vez al nivel del módulo (con dynamic import si necesario).

### [LOW-03] — `referral/route.ts` POST devuelve `referralCount: 0` cuando el código ya existe
Cuando el usuario ya tiene un código de referido, el POST devuelve `referralCount: 0` en lugar de hacer la misma query que el GET para obtener el count real.

### [LOW-04] — `app/api/alerts/[alertId]/route.ts` no analizado completamente
No se auditó el route de alertas individuales (DELETE, PATCH). Debería verificarse que incluye el filtro `user_id` en las operaciones de modificación.

---

## Resumen de Fixes por Prioridad

### Inmediato (antes de producción real)
1. **[SEC-02]** Eliminar `isDemo` flag del cliente
2. **[SEC-01] + [DB-01]** Activar RLS en Supabase
3. **[INN-01]** Añadir `onFailure` handler en Inngest
4. **[SEC-05]** Implementar rollback en el flujo de créditos
5. **[TEST-01]** Añadir tests para los 7 calculadores
6. **[BIZ-02]** Fix del false positive en waste underreporting

### Próximos sprints
7. **[SEC-03]** Rate limiting
8. **[SEC-04]** Validación de tamaño de archivo
9. **[INT-03]** Fix del bug de `return` en Stripe webhook
10. **[INT-05]** Fix de encoding para CSVs no-UTF8
11. **[INT-01]** Externalizar nombre del modelo de Claude
12. **[PERF-01]** Reducir DB queries en dashboard
13. **[DB-03]** Fix N+1 en alertas

### Deuda técnica
14. **[BIZ-03]** `idCounter` global en lastapp parser
15. **[ERR-01]** Warnings en parsing de CSV
16. **[ERR-03]** Logger estructurado
17. **[DB-06]** Revisar y añadir índices en Supabase

---

*Informe generado por auditoría estática del código. No se modificó ningún archivo. Para consultas sobre hallazgos específicos, referirse al archivo y línea indicados.*
