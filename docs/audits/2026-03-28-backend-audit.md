# QA Backend Audit — fraud-audit

**Fecha:** 2026-03-28
**Auditor:** Claude Code (claude-sonnet-4-6)
**Alcance:** Backend completo — 17 API routes, 7 calculadores de fraude, Inngest pipeline, Supabase schema, integraciones externas
**Metodología:** Lectura exhaustiva línea a línea de todo el código backend

---

## Resumen Ejecutivo

El proyecto fraud-audit está bien arquitectado para una primera versión SaaS. El sistema de créditos usa funciones PG atómicas con idempotencia real, la autenticación Clerk está correctamente integrada, y la separación de responsabilidades (parsers → calculadores → analysis engine → Inngest) es limpia.

**Sin embargo, se detectaron 28 hallazgos** que van desde un bypass de créditos explotable por cualquier usuario autenticado (CRITICAL) hasta ausencia total de tests en un sistema de detección de fraude financiero (CRITICAL).

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL  | 4        |
| HIGH      | 9        |
| MEDIUM    | 11       |
| LOW       | 4        |

---

## 1. SEGURIDAD

---

### [SEC-01] CRITICAL — `isDemo` bypass: cualquier usuario puede saltarse el cobro de créditos

**Archivo:** `app/api/analyze/route.ts:26-63`

**Descripción:**
El flag `isDemo` se lee directamente del cuerpo del request JSON sin ninguna validación server-side de que el usuario tiene permiso para usarlo:

```ts
// línea 26-27
const { posUploadId, inventoryUploadId, posConnector, inventoryConnector, restaurantName, isDemo } = body;

// línea 54
if (!isDemo) {
  const deducted = await deductCredit(user.id, 'analysis', undefined);
  ...
}
```

Cualquier usuario autenticado puede enviar `{ "isDemo": true, ... }` en el body y obtener análisis ilimitados sin gastar créditos.

**Fix:**
Eliminar `isDemo` del body del request. Controlar el modo demo a nivel de base de datos (columna `is_demo_user` en `users`) o mediante un parámetro de query verificado contra una lista de usuarios autorizados.

```ts
// Ejemplo seguro: verificar permisos de demo contra DB
const { data: user } = await supabase.from('users')
  .select('id, organization_id, is_demo_account')
  .eq('clerk_id', userId).single();

if (!user.is_demo_account) {
  const deducted = await deductCredit(user.id, 'analysis', undefined);
  ...
}
```

---

### [SEC-02] HIGH — Sin validación de `posConnector` / `inventoryConnector` en la API

**Archivo:** `app/api/analyze/route.ts:30-35` y `app/api/upload/route.ts:29-34`

**Descripción:**
`posConnector` e `inventoryConnector` se verifican solo por presencia, no contra la lista de valores permitidos (`lastapp`, `glop`, `agora`, `revo`, `tspoonlab`, `prezo`, `gstock`). Un valor arbitrario pasa hasta el Inngest job donde `getParser()` lanza una excepción, el job falla y el reporte queda en estado `processing` para siempre — con el crédito ya deducido.

Similarmente, `sourceCategory` en `/api/upload` no se valida contra `['pos', 'inventory']`.

**Fix:**
```ts
// app/api/analyze/route.ts — después de la línea 35
const VALID_CONNECTORS = ['lastapp', 'glop', 'agora', 'revo', 'tspoonlab', 'prezo', 'gstock'];
if (!VALID_CONNECTORS.includes(posConnector)) {
  return NextResponse.json({ error: `Invalid posConnector` }, { status: 400 });
}
```

---

### [SEC-03] HIGH — Sin límite de tamaño de archivo en uploads

**Archivo:** `app/api/upload/route.ts:65`

**Descripción:**
No existe ninguna validación de tamaño antes de leer el archivo completo en memoria:

```ts
const fileContent = await file.text(); // carga TODO en memoria sin límite
```

Un usuario puede subir un archivo de 500MB, causando OOM en la función serverless y potencialmente crasheando el proceso para todos los usuarios. Tampoco se valida el MIME type real del contenido.

**Fix:**
```ts
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
if (file.size > MAX_FILE_SIZE_BYTES) {
  return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 413 });
}

// Validar que realmente es CSV antes de procesar
const sample = await file.slice(0, 512).text();
if (!sample.includes(',') && !sample.includes(';')) {
  return NextResponse.json({ error: 'File does not appear to be CSV' }, { status: 400 });
}
```

---

### [SEC-04] HIGH — Sin rate limiting en ningún endpoint

**Archivos:** Todos los API routes

**Descripción:**
No existe ningún mecanismo de rate limiting. Endpoints especialmente vulnerables:
- `/api/upload` — un actor malicioso puede subir miles de archivos
- `/api/analyze` — el check de créditos previene el fraude económico, pero permite flooding del pipeline
- `/api/reports/[reportId]/ai-insights` (POST) — cada llamada genera un request a la API de Claude/Anthropic, tiene coste directo en dinero
- `/api/feedback`, `/api/bug-report` — pueden usarse para spam

**Fix:**
Implementar rate limiting con Upstash Redis + `@upstash/ratelimit`:

```ts
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const analysisRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 h'), // 10 análisis/hora por usuario
});
```

---

### [SEC-05] MEDIUM — Stripe webhook: no se verifica `payment_status`

**Archivo:** `app/api/webhooks/stripe/route.ts:57-122`

**Descripción:**
El evento `checkout.session.completed` se dispara cuando la sesión de checkout termina, pero una sesión puede completarse con `payment_status: 'unpaid'` en ciertos escenarios (trials, métodos de pago que requieren confirmación adicional). El código otorga créditos sin verificar que el pago efectivamente se realizó:

```ts
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  // ❌ No se verifica session.payment_status
  const userId = session.metadata?.userId;
  // ... se otorgan créditos directamente
```

**Fix:**
```ts
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== 'paid') {
    console.info(`Session ${session.id} not paid (status: ${session.payment_status}), skipping`);
    return NextResponse.json({ received: true }, { status: 200 });
  }
```

---

### [SEC-06] MEDIUM — Sin headers de seguridad HTTP

**Archivo:** `next.config.js`

**Descripción:**
Ausencia de headers de seguridad estándar: `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Strict-Transport-Security`. Un informe de fraude con datos sensibles podría ser embebido en un iframe externo (clickjacking).

**Fix:**
```js
// next.config.js
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
];

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

---

### [SEC-07] MEDIUM — RLS en Storage bucket no visible/verificado

**Archivos:** `supabase/migrations/` (ausente para Storage)

**Descripción:**
Las migraciones configuran RLS en tablas de base de datos pero no en el Storage bucket `uploads`. Si el bucket está configurado como público, cualquiera con la URL puede descargar archivos de otros usuarios. El path `{user_id}/{timestamp}_{filename}` proporciona oscuridad pero no seguridad real.

**Fix:**
Verificar y establecer políticas de Storage en Supabase:

```sql
-- En Supabase Dashboard > Storage > Policies
CREATE POLICY "Users can only access their own uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Como la autenticación es Clerk (no Supabase Auth), la opción más segura es mantener el bucket privado y que siempre se acceda a los archivos mediante el `SERVICE_ROLE_KEY` server-side.

---

## 2. LÓGICA DE NEGOCIO

---

### [BIZ-01] HIGH — Umbrales inconsistentes entre `cash-discrepancy.ts` y `conclusions.ts`

**Archivos:** `lib/calculators/cash-discrepancy.ts:5-6` vs `lib/calculators/conclusions.ts:21`

**Descripción:**
El calculador de descuadres marca como **crítico** un descuadre > 500€, pero el generador de conclusiones solo genera una conclusión CRITICAL cuando supera 1000€:

```ts
// cash-discrepancy.ts:5
const CRITICAL_SHORTAGE_THRESHOLD = 500; // "ALERTA CRÍTICA" en el mensaje

// conclusions.ts:21
const CASH_CRITICAL_THRESHOLD = 1000; // genera conclusión 'critical'
```

Un local con -600€ de descuadre muestra "ALERTA CRÍTICA" en el widget de caja pero genera una conclusión de severidad `high` (no `critical`) en el resumen ejecutivo. El usuario recibe mensajes contradictorios sobre la misma situación.

**Fix:**
Centralizar los umbrales en un único archivo de constantes compartido:

```ts
// lib/constants/fraud-thresholds.ts
export const CASH_THRESHOLDS = {
  CRITICAL: 500,   // Una sola fuente de verdad
  MODERATE: 200,
  SHORTAGE: -10,
} as const;
```

---

### [BIZ-02] HIGH — Crédito deducido pero análisis no ejecutado si Inngest falla

**Archivo:** `app/api/analyze/route.ts:55-110`

**Descripción:**
La secuencia es: (1) deducir crédito → (2) crear reporte → (3) enviar evento Inngest. Si el paso 3 falla (timeout de red, Inngest no disponible), el crédito está deducido y el reporte queda en `processing` para siempre. No hay rollback.

```ts
// línea 55: crédito deducido
const deducted = await deductCredit(user.id, 'analysis', undefined);

// línea 97: si esto falla, el crédito se perdió
await inngest.send({ name: 'report/analyze', data: { ... } });
```

**Fix:**
Opción A — Deducir el crédito dentro del Inngest job (en Step 1), antes del análisis real.
Opción B — Si el `inngest.send()` falla, reembolsar el crédito inmediatamente:

```ts
try {
  await inngest.send({ name: 'report/analyze', data: { ... } });
} catch (inngestError) {
  // Reembolsar crédito ante fallo de despacho
  await awardCreditsRaw(user.id, 1, 'analysis_refund', report.id);
  await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id);
  throw inngestError;
}
```

---

### [BIZ-03] HIGH — Inngest job sin handler de fallo: reportes "zombies" en estado `processing`

**Archivo:** `lib/inngest/functions.ts`

**Descripción:**
Si cualquiera de los pasos críticos (2-5) falla con error no recuperable, Inngest agota sus reintentos y abandona el job. El reporte queda en `status: 'processing'` indefinidamente. El usuario ve el spinner de carga para siempre.

Adicionalmente, `serverTrackAnalysisFailed` está importado en la línea 5 pero **nunca se llama** en ningún escenario de error.

```ts
// línea 5: importado pero nunca usado
import { serverTrackAnalysisCompleted, serverTrackAnalysisFailed } from '...';
```

**Fix:**
Añadir `onFailure` handler al job:

```ts
export const analyzeReport = inngest.createFunction(
  {
    id: 'analyze-report',
    name: 'Analyze Report',
    onFailure: async ({ event, error }) => {
      const { reportId, userId } = event.data.event.data;
      const supabase = createServerClient();

      // Marcar reporte como fallido
      await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);

      // Reembolsar crédito
      await awardCreditsRaw(userId, 1, 'analysis_refund', reportId);

      // Trackear fallo
      serverTrackAnalysisFailed(userId, { error: error.message, report_id: reportId });
    },
  },
  ...
```

---

### [BIZ-04] MEDIUM — `waste-analysis.ts`: underreporting alert se dispara con datos vacíos

**Archivo:** `lib/calculators/waste-analysis.ts:77`

**Descripción:**
Cuando no hay datos de merma (`waste = []`), `totalWaste = 0` y `wastePercentage = 0`. Como `0 < UNDERREPORTING_THRESHOLD_PCT (1)`, la alerta se activa automáticamente:

```ts
const underreportingAlert = wastePercentage < UNDERREPORTING_THRESHOLD_PCT;
// wastePercentage = 0 cuando no hay datos → underreportingAlert = true ❌
```

Esto genera una conclusión falsa ("posible infrareporte de mermas") cuando el usuario simplemente no aportó datos de merma.

**Fix:**
```ts
// Verificar que hay datos de ventas antes de activar la alerta
const underreportingAlert = totalSales > 0 && waste.length > 0 && wastePercentage < UNDERREPORTING_THRESHOLD_PCT;
```

---

### [BIZ-05] MEDIUM — `conclusions.ts`: crash con `data.products.by_local[0]` si by_local está vacío

**Archivo:** `lib/calculators/conclusions.ts:108-113`

**Descripción:**
La función `reduce` usa `data.products.by_local[0]` como valor inicial sin verificar que el array no esté vacío. Si todas las eliminaciones de productos carecen de campo `location`, `by_local` sería vacío mientras `totalEliminated > 0`, causando `TypeError`:

```ts
// línea 108: si by_local.length === 0, by_local[0] es undefined
const worstPostBillingLocal = data.products.by_local.reduce(
  (worst, l) => l.after_billing_percentage > worst.after_billing_percentage ? l : worst,
  data.products.by_local[0] // ← puede ser undefined
);
```

**Fix:**
```ts
const worstPostBillingLocal = data.products.by_local.length > 0
  ? data.products.by_local.reduce(
      (worst, l) => l.after_billing_percentage > worst.after_billing_percentage ? l : worst
    )
  : null;

if (worstPostBillingLocal) {
  immediateActions.push(`Auditar eliminaciones post-facturación en ${worstPostBillingLocal.location}`);
}
```

---

### [BIZ-06] MEDIUM — `correlation.ts`: inventory score es constante para todas las ubicaciones

**Archivo:** `lib/calculators/correlation.ts:138-139`

**Descripción:**
El componente de inventario en el `combinedScore` es idéntico para todas las ubicaciones porque `inventoryDeviationMax` es un valor global, no per-location:

```ts
// línea 138-139: mismo valor para TODOS los locales — no aporta diferenciación
const inventoryScore = normalizeToScale(inventoryDeviationMax, 0, maxInventory) * 0.2;
```

Esto significa que el 20% del peso del "risk score" es una constante que no discrimina. Dos locales con perfiles de riesgo muy diferentes recibirían el mismo componente de inventario. El propio código reconoce la limitación en un comentario (línea 42-47) pero no ajusta la ponderación.

**Fix:**
Reducir el peso de inventario a 0 cuando no hay datos per-location, o distribuir el peso entre los dos indicadores que sí tienen datos per-location:

```ts
// Sin datos de inventario por local, peso redistribuido al 50/50
const cashScore = normalizeToScale(cashVal, 0, maxCash) * 0.5;
const invoiceScore = normalizeToScale(invoiceVal, 0, maxInvoice) * 0.5;
const combinedScore = Math.round(cashScore + invoiceScore);
```

---

### [BIZ-07] MEDIUM — `feedback/route.ts`: `accuracy_rating` sin validación de rango

**Archivo:** `app/api/feedback/route.ts:36-41`

**Descripción:**
Se verifica que `accuracy_rating` no sea `undefined/null`, pero no se valida que esté en el rango 1-5. El constraint de la DB (`CHECK (accuracy_rating BETWEEN 1 AND 5)`) bloqueará valores fuera de rango, pero devuelve un 500 genérico en lugar de un 400 con mensaje claro. Peor: con `accuracy_rating = 0` o `accuracy_rating = 999`, el insert falla y el usuario pierde su feedback.

**Fix:**
```ts
if (typeof accuracy_rating !== 'number' || accuracy_rating < 1 || accuracy_rating > 5 || !Number.isInteger(accuracy_rating)) {
  return NextResponse.json({ error: 'accuracy_rating must be an integer between 1 and 5' }, { status: 400 });
}
```

---

### [BIZ-08] MEDIUM — `alerts/route.ts`: race condition en límite de 10 reglas

**Archivo:** `app/api/alerts/route.ts:122-132`

**Descripción:**
El check de máximo de alertas es un patrón check-then-act sin transacción:

```ts
const { count } = await supabase.from('alert_rules')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id);

if ((count ?? 0) >= MAX_ALERT_RULES_PER_USER) { ... }

// Aquí puede entrar otra petición concurrente con count=9
await supabase.from('alert_rules').insert({ ... });
```

Dos peticiones simultáneas con `count = 9` podrían crear 11 reglas.

**Fix:**
Añadir un constraint `UNIQUE` a nivel DB o usar una DB function atómica. Alternativa más simple: añadir un índice partial para hacer imposible el overshoot a nivel DB:

```sql
-- No es directamente un unique index, pero se puede usar un trigger
CREATE OR REPLACE FUNCTION check_alert_rules_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM alert_rules WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 alert rules per user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### [BIZ-09] LOW — `inventory-deviation.ts`: absolute values ocultan dirección de la desviación

**Archivo:** `lib/calculators/inventory-deviation.ts:26,52`

**Descripción:**
```ts
entry.totalDeviation += Math.abs(d.deviation); // siempre positivo
```

Al usar siempre `Math.abs()`, un producto con +500 (sobreinventario) y otro con -500 (faltante) contribuyen igual al mismo "total deviation". La diferencia entre sobreinventario (posible obsolescencia) y faltante (posible sustracción) tiene implicaciones de fraude muy distintas que se pierden.

**Fix:**
Separar desviaciones positivas (exceso) y negativas (faltante) en el resultado, o al menos reportar el signo neto junto con el valor absoluto.

---

## 3. BASE DE DATOS

---

### [DB-01] HIGH — `reports.status` sin CHECK constraint

**Archivo:** `supabase/migrations/20240101000000_init.sql:57-73`

**Descripción:**
El campo `reports.status` es `TEXT DEFAULT 'processing'` sin restricción de valores. Si un bug introduce un valor desconocido (e.g., `'error'`, `'done'`), la aplicación puede comportarse de forma impredecible. Todos los checks de `report.status !== 'completed'` en la API fallarían silenciosamente.

**Fix:**
```sql
ALTER TABLE reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('processing', 'completed', 'failed'));
```

---

### [DB-02] MEDIUM — Índices faltantes críticos

**Archivo:** `supabase/migrations/20240101000000_init.sql:122-130`

**Descripción:**
Faltan índices en columnas que se consultan frecuentemente:

1. **`alert_rules.user_id`** — El paso 7 de Inngest hace `WHERE user_id = ? AND is_active = true` en cada análisis. Sin índice, escanea toda la tabla.

2. **`feedback.(user_id, report_id)` compuesto** — La API de feedback hace `WHERE user_id = ? AND report_id = ?` para detectar feedback duplicado.

3. **`credit_transactions.(user_id, reason)` compuesto** — `canEarnReward()` filtra por ambas columnas para verificar límites de recompensas. El índice existente solo cubre `user_id`.

4. **`reports.status`** — Potencialmente útil para queries de monitorización.

**Fix:**
```sql
CREATE INDEX idx_alert_rules_user ON alert_rules(user_id);
CREATE INDEX idx_alert_rules_user_active ON alert_rules(user_id) WHERE is_active = true;
CREATE INDEX idx_feedback_user_report ON feedback(user_id, report_id);
CREATE INDEX idx_credit_tx_user_reason ON credit_transactions(user_id, reason);
```

---

### [DB-03] MEDIUM — Dashboard carga `report_data` JSONB completo para la lista

**Archivo:** `app/api/dashboard/route.ts` (query sin línea exacta visible)

**Descripción:**
La query del dashboard incluye `report_data` en el SELECT, que es el JSONB completo con toda la data de análisis (puede ser 50-200KB por reporte). Para un usuario con 20 reportes, se cargan hasta 4MB de datos solo para mostrar la lista del dashboard, donde únicamente se usa `report_data.summary`.

**Fix:**
Usar selección de sub-campo JSONB de Supabase:

```ts
.select('id, slug, status, pos_connector, analysis_window_from, analysis_window_to, locations_analyzed, created_at, report_data->summary')
// o mejor: añadir columnas desnormalizadas
```

Mejor solución a largo plazo: añadir columnas `overall_risk_level TEXT`, `locations_count INT`, `key_findings TEXT[]` en la tabla `reports` y eliminar `report_data` del SELECT del dashboard.

---

### [DB-04] LOW — `award_credits` PG function sin SERIALIZABLE isolation

**Archivo:** `supabase/migrations/20240108000000_atomic_credit_functions.sql:60-70`

**Descripción:**
La función `award_credits` hace un SELECT de idempotencia seguido de UPDATE + INSERT. Esto es un patrón check-then-act. En teoría, dos transacciones concurrentes con el mismo `reference_id` podrían pasar ambas el SELECT (v_existing = NOT FOUND) antes de que cualquiera haga el INSERT.

En la práctica, el índice único `idx_credit_tx_idempotent` actúa como safety net y la segunda transacción fallará con `23505`. La aplicación maneja este error correctamente (credits.ts:128). No es un bug explotable, pero la función debería documentar explícitamente que la seguridad de idempotencia descansa en el unique index, no en el isolation level.

**Fix:**
Añadir `SECURITY DEFINER` y comentario explícito, o re-escribir como `INSERT ... ON CONFLICT DO NOTHING` para hacer la idempotencia declarativa.

---

## 4. INNGEST PIPELINE

---

### [INN-01] HIGH — Sin `onFailure` handler: créditos perdidos y reportes zombies

*(Ver también BIZ-03 — mismo issue desde perspectiva del pipeline)*

**Archivo:** `lib/inngest/functions.ts:7-269`

**Descripción:**
No existe callback de `onFailure`. Cuando el job falla definitivamente (max retries agotados):
- El reporte permanece en `status: 'processing'`
- El crédito deducido no se reembolsa
- No se envía email de error al usuario
- `serverTrackAnalysisFailed` importado en línea 5 nunca se invoca

**Fix:** Ver BIZ-03.

---

### [INN-02] MEDIUM — Paso 7 (alerts): N queries secuenciales para actualizar `last_triggered_at`

**Archivo:** `lib/inngest/functions.ts:183-189`

**Descripción:**
```ts
for (const t of triggered) {
  await supabase
    .from('alert_rules')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', t.ruleId);  // una query por alerta disparada
}
```

Si se disparan 5 alertas, son 5 queries secuenciales. En un Inngest step, el tiempo de ejecución importa.

**Fix:**
```ts
const triggeredIds = triggered.map(t => t.ruleId);
await supabase
  .from('alert_rules')
  .update({ last_triggered_at: new Date().toISOString() })
  .in('id', triggeredIds);
```

---

### [INN-03] MEDIUM — Paso 5 (complete): analytics dentro del step puede causar doble marcado

**Archivo:** `lib/inngest/functions.ts:93-104`

**Descripción:**
```ts
await step.run('update-status-completed', async () => {
  await supabase.from('reports').update({ status: 'completed' }).eq('id', reportId);

  // Si esto falla, Inngest reintenta el step completo
  serverTrackAnalysisCompleted(userId, { ... });
});
```

Si `serverTrackAnalysisCompleted` lanza una excepción (PostHog no disponible), Inngest reintenta el step, ejecutando de nuevo el `UPDATE status = 'completed'` (idempotente) pero también enviando un doble evento de analytics.

**Fix:**
Mover el tracking de analytics fuera del step o envolverlo en try-catch:

```ts
await step.run('update-status-completed', async () => {
  await supabase.from('reports').update({ status: 'completed' }).eq('id', reportId);
});

// Analytics fuera del step — fallo no retryable
try {
  serverTrackAnalysisCompleted(userId, { report_slug: slug });
} catch { /* no crítico */ }
```

---

### [INN-04] LOW — Paso 1 (update-status-processing) redundante

**Archivo:** `lib/inngest/functions.ts:26-31`

**Descripción:**
El reporte se crea con `status: 'processing'` en la API (`analyze/route.ts:75`). El paso 1 del Inngest job actualiza de nuevo a `'processing'`. Es una escritura DB sin efecto.

**Fix:**
Eliminar el paso 1 (`update-status-processing`). Solo mantener el paso de marcar como `completed` o `failed`.

---

## 5. INTEGRACIONES

---

### [INT-01] HIGH — Claude API: truncación de JSON produce payload inválido

**Archivo:** `lib/ai-insights-generator.ts:64-68`

**Descripción:**
Cuando `report_data` es demasiado grande, el código trunca el JSON en el medio del string:

```ts
serialized = serialized.slice(0, MAX_PAYLOAD_CHARS) + '\n... [truncado por tamaño]'
```

Esto produce un JSON inválido (truncado a mitad de una string o estructura) seguido de texto libre. Claude recibe datos malformados y puede generar análisis incorrectos o simplemente fallar al interpretar el contexto. En el mejor caso, Claude ignora los datos truncados; en el peor, genera "insights" basados en datos corruptos.

**Fix:**
Truncar a nivel semántico, no de caracteres. Reducir la profundidad del JSON antes de serializar:

```ts
function summarizeForAI(data: ReportData): object {
  return {
    summary: data.summary,
    cash_discrepancy: {
      worst_local: data.cash_discrepancy.worst_local,
      alert_message: data.cash_discrepancy.alert_message,
      locals_count: data.cash_discrepancy.locals.length,
      top_locals: data.cash_discrepancy.locals.slice(0, 5),
    },
    // ... reducir cada sección a sus campos más relevantes
    conclusions: data.conclusions, // mantener completo — es lo más importante
  };
}
```

---

### [INT-02] MEDIUM — Claude API: sin timeout configurado

**Archivo:** `lib/ai-insights-generator.ts:77-87`

**Descripción:**
```ts
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  // ❌ Sin timeout
  messages: [...]
});
```

Si la API de Anthropic experimenta latencia alta, el Inngest step 8 puede bloquearse hasta el timeout por defecto del SDK (varios minutos). Esto retrasa la finalización del job y puede consumir recursos del worker de Inngest innecesariamente.

**Fix:**
```ts
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  messages: [...],
}, {
  timeout: 30_000, // 30 segundos máximo
});
```

---

### [INT-03] MEDIUM — Resend: FROM address es el dominio sandbox de Resend

**Archivo:** `lib/email.ts` (inferido del contexto)

**Descripción:**
El FROM es `FraudAudit <onboarding@resend.dev>` usando el dominio sandbox de Resend. En producción:
- Los emails pueden aterrizar en spam
- Los usuarios pueden no reconocer el dominio
- Para un servicio de auditoría de fraude, la credibilidad del email es crítica

**Fix:**
Verificar un dominio propio en Resend (e.g., `noreply@fraudaudit.io`) y actualizar la constante FROM.

---

### [INT-04] LOW — Stripe webhook: `listLineItems` llamado antes del check de duplicados

**Archivo:** `app/api/webhooks/stripe/route.ts:65-88`

**Descripción:**
```ts
// línea 65: API call a Stripe
const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });

// ... procesamiento ...

// línea 85: solo aquí se detectan duplicados
if (newBalance === -1) {
  console.info(`Duplicate Stripe webhook for session ${session.id}, ignoring`);
```

Para webhooks duplicados (Stripe puede re-intentar), se hace una API call innecesaria a Stripe antes de detectar que ya fue procesado. Ineficiente y añade latencia.

**Fix:**
Verificar en DB si el `session.id` ya existe como `reference_id` antes de llamar a Stripe API.

---

## 6. PERFORMANCE

---

### [PERF-01] HIGH — Upload: archivo completo en memoria sin límite (OOM risk)

*(Ver también SEC-03 — mismo issue desde perspectiva de performance)*

**Archivo:** `app/api/upload/route.ts:65`

**Descripción:**
Para archivos CSV grandes (un restaurante con 5 locales y 2 años de datos puede generar fácilmente 5MB+), el `await file.text()` carga el archivo completo en memoria de la función serverless antes de cualquier validación de tamaño. Vercel tiene límite de 250MB de memoria por función, pero un ataque coordinado con múltiples uploads simultáneos grandes puede causar problemas.

---

### [PERF-02] MEDIUM — Volume detection: PapaParse sin límite de filas

**Archivo:** `lib/volume-detector.ts:93-96`

**Descripción:**
```ts
const parsed = Papa.parse<Record<string, string>>(fileContent, {
  header: true,
  skipEmptyLines: true,
  // ❌ Sin límite de filas
});
```

Para el volume detection solo se necesitan las fechas y locations, no todas las filas. Para un CSV de 500K filas, PapaParse parsea todo el archivo cuando bastaría con samplear las primeras/últimas filas.

**Fix:**
Usar la opción `preview` de PapaParse para limitar el número de filas parseadas:

```ts
// Para detectar headers y fechas, parsear primeras 1000 + últimas 100 filas
const firstRows = Papa.parse(fileContent.split('\n').slice(0, 1001).join('\n'), { header: true });
const lastRows  = Papa.parse(fileContent.split('\n').slice(-100).join('\n'), { header: true });
```

---

### [PERF-03] MEDIUM — `canEarnReward` hace query completa sin LIMIT

**Archivo:** `lib/credits.ts:207-215`

**Descripción:**
```ts
const { data: existing, error } = await supabase
  .from('credit_transactions')
  .select('id, reference_id')
  .eq('user_id', userId)
  .eq('reason', rewardType);
  // ❌ Sin LIMIT — carga TODOS los registros del tipo
```

Para verificar si un usuario ha superado el límite de `bug_report` (3 máximo), se cargan todos sus bug_reports (potencialmente cientos en el futuro). Solo se necesita el COUNT.

**Fix:**
```ts
const { count } = await supabase
  .from('credit_transactions')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('reason', rewardType);
```

---

## 7. MANEJO DE ERRORES

---

### [ERR-01] HIGH — Múltiples routes no destructuran el error de Supabase

**Archivos:** `app/api/reports/[reportId]/ai-insights/route.ts:22`, `app/api/compare/route.ts:39`, y otros

**Descripción:**
En varios routes, los errores de Supabase se ignoran silenciosamente:

```ts
// ai-insights/route.ts línea 22 — error descartado
const { data: user } = await supabase.from('users').select('id')...
// Si la query falla (DB timeout, etc.), user = undefined → devuelve 404 en vez de 500
```

El usuario ve "User not found" cuando realmente hay un error de infraestructura, ocultando problemas reales de la BD.

**Fix:**
Siempre destructurar y chequear el error:

```ts
const { data: user, error: userError } = await supabase.from('users').select('id')...
if (userError) {
  console.error('DB error fetching user:', userError.message);
  return NextResponse.json({ error: 'Database error' }, { status: 500 });
}
if (!user) {
  return NextResponse.json({ error: 'User not found' }, { status: 404 });
}
```

---

### [ERR-02] MEDIUM — `feedback/route.ts`: feedback guardado pero respuesta es 500 si el crédito falla

**Archivo:** `app/api/feedback/route.ts:91-96`

**Descripción:**
```ts
// línea 71: feedback guardado exitosamente en DB
const { error: feedbackError } = await supabase.from('feedback').insert({...});

// línea 92: si awardCredit lanza excepción...
creditAwarded = await awardCredit(user.id, 'feedback', reportId);
// ...el outer try-catch devuelve 500
```

El feedback se guardó en BD pero el usuario recibe un error 500. Si reintenta, envía feedback duplicado (la segunda inserción tendrá `isFirstFeedback = false`, sin crédito, pero el registro duplicado sí se guarda).

**Fix:**
Envolver el credit award en try-catch independiente del feedback:

```ts
let creditAwarded = false;
if (isFirstFeedback) {
  try {
    creditAwarded = await awardCredit(user.id, 'feedback', reportId);
  } catch (creditErr) {
    console.error('Failed to award feedback credit:', creditErr);
    // No fallar — el feedback se guardó correctamente
  }
}
return NextResponse.json({ success: true, creditAwarded }, { status: 200 });
```

---

### [ERR-03] MEDIUM — Logging con `console.log`/`console.error` en producción

**Archivos:** Múltiples archivos backend

**Descripción:**
Todo el logging usa `console.log` y `console.error`. En producción (Vercel), estos logs no tienen:
- Nivel de severidad estructurado
- Correlation IDs para trazar requests
- Alertas automáticas en errores críticos
- Contexto de usuario o report ID en el mensaje

Ejemplo real: `console.error('Failed to create report:', reportError?.message)` — ¿qué usuario? ¿qué timestamp? ¿cuántas veces pasó?

**Fix:**
Adoptar un logger estructurado como `pino` o integrar con un servicio como Axiom/Datadog:

```ts
import pino from 'pino';
const logger = pino({ level: 'info' });

logger.error({ userId, reportId, error: reportError?.message }, 'Failed to create report');
```

---

### [ERR-04] LOW — `bug-report/route.ts`: silencia errores de crédito sin logging

**Archivo:** `app/api/bug-report/route.ts` (inferido)

**Descripción:**
El código envuelve el award de crédito por bug report en try-catch para no bloquear la respuesta, pero la cláusula `catch` no tiene logging:

```ts
try {
  creditAwarded = await awardCredit(user.id, 'bug_report', bugReportId);
} catch {
  // ❌ Error silencioso — no hay log, no hay alerta
}
```

Si la función de créditos falla sistemáticamente, no habría forma de detectarlo.

**Fix:**
```ts
} catch (creditErr) {
  console.error('[BugReport] Failed to award credit:', creditErr);
}
```

---

## 8. TESTS

---

### [TEST-01] CRITICAL — Cero tests en un sistema de detección de fraude financiero

**Archivos:** Todo el proyecto (ausencia de `*.test.ts`, `*.spec.ts`, `__tests__/`)

**Descripción:**
Vitest está configurado en `package.json` pero no existe ningún archivo de test. Un sistema que detecta fraude financiero y emite alertas de auditoría con consecuencias legales y laborales tiene **cobertura de tests de 0%**.

Los bugs en los calculadores de fraude pueden:
- Generar conclusiones de "fraude crítico" falsas → empleados despedidos injustamente
- Perderse fraude real → pérdidas económicas no detectadas
- Producir reportes incorrectos presentados a gerencia o autoridades

**Tests mínimos críticos que deben existir:**

```ts
// lib/calculators/cash-discrepancy.test.ts
describe('calculateCashDiscrepancy', () => {
  it('handles empty array without crash');
  it('identifies critical shortage correctly (> 500€)');
  it('does not trigger alert when discrepancies < 10€');
  it('sorts locals with most negative first');
});

// lib/calculators/conclusions.test.ts
describe('generateConclusions', () => {
  it('does not crash when by_local is empty in deleted products');
  it('generates critical conclusion for cash discrepancy > 1000€');
  it('generates low conclusion when no anomalies detected');
});
```

---

### [TEST-02] CRITICAL — Sin tests para el sistema de créditos (dinero real)

**Archivo:** `lib/credits.ts` y `supabase/migrations/20240108000000_atomic_credit_functions.sql`

**Descripción:**
El sistema de créditos maneja dinero real (vinculado a pagos de Stripe). No hay tests para:
- Deducción con balance exactamente 0 → ¿devuelve false o crash?
- Award con `reference_id` duplicado → ¿idempotencia funciona?
- Concurrencia: dos requests simultáneos de análisis con balance=1 → solo uno debe ejecutarse
- `canEarnReward` con cada tipo de recompensa y sus límites

---

### [TEST-03] HIGH — Sin tests para la fórmula de Spearman

**Archivo:** `lib/calculators/correlation.ts:86-97`

**Descripción:**
La implementación del coeficiente de Spearman es código matemático manual que puede tener bugs sutiles. Un error en esta fórmula produce correlaciones incorrectas que se reportan como "patrón de fraude sistemático detectado":

```ts
// Esta fórmula debe estar unit-testeada con casos conocidos
const rho = 1 - (6 * sumDSquared) / (n * (n * n - 1));
```

Tests mínimos:
- `n=2` con datos perfectamente correlados → `rho = 1.0`
- `n=2` con datos inversamente correlados → `rho = -1.0`
- `n=3` con datos sin correlación → `rho ≈ 0`
- `n=1` → debe manejarse sin dividir por cero (actualmente prevenido por el check `>= 2`, pero debería testearse)

---

### [TEST-04] HIGH — Sin tests de integración para el pipeline Inngest

**Archivo:** `lib/inngest/functions.ts`

**Descripción:**
El flujo de 8 pasos del Inngest job no tiene ningún test. Los scenarios críticos sin tests:
- Parser retorna datos vacíos → ¿el análisis genera un reporte coherente?
- Fallo en paso 4 (generate-report) → ¿el reporte queda como failed o processing?
- Paso 7 (alerts) con 0 reglas activas → ¿continúa sin crash?
- Paso 8 (AI) sin `ANTHROPIC_API_KEY` → ¿el job completa sin fallar?

---

## Apéndice: Resumen de hallazgos por archivo

| Archivo | Hallazgos |
|---------|-----------|
| `app/api/analyze/route.ts` | SEC-01, SEC-02, BIZ-02 |
| `app/api/upload/route.ts` | SEC-02, SEC-03, PERF-01, PERF-02 |
| `app/api/webhooks/stripe/route.ts` | SEC-05, INT-04 |
| `app/api/feedback/route.ts` | BIZ-07, ERR-02 |
| `app/api/alerts/route.ts` | BIZ-08 |
| `app/api/reports/[reportId]/ai-insights/route.ts` | ERR-01 |
| `app/api/compare/route.ts` | ERR-01 |
| `lib/inngest/functions.ts` | BIZ-03, INN-01, INN-02, INN-03, INN-04 |
| `lib/calculators/cash-discrepancy.ts` | BIZ-01 |
| `lib/calculators/conclusions.ts` | BIZ-01, BIZ-05, TEST-03 |
| `lib/calculators/waste-analysis.ts` | BIZ-04 |
| `lib/calculators/correlation.ts` | BIZ-06, TEST-03 |
| `lib/calculators/inventory-deviation.ts` | BIZ-09 |
| `lib/credits.ts` | PERF-03, TEST-02 |
| `lib/ai-insights-generator.ts` | INT-01, INT-02 |
| `lib/volume-detector.ts` | PERF-02 |
| `supabase/migrations/20240101000000_init.sql` | DB-01, DB-02 |
| `supabase/migrations/20240108000000_atomic_credit_functions.sql` | DB-04 |
| `supabase/migrations/20240109000000_enable_rls_policies.sql` | SEC-07 |
| `middleware.ts` | SEC-04, SEC-06 |
| `next.config.js` | SEC-06 |
| `lib/email.ts` | INT-03 |

---

## Prioridad de Fix Recomendada

### Sprint 1 — Crítico (antes de ir a producción con usuarios reales)

1. **SEC-01** — Eliminar isDemo del body (30 min)
2. **INN-01 / BIZ-03** — Añadir onFailure handler + actualizar status a 'failed' (2h)
3. **INT-01** — Fix truncación de JSON para Claude API (1h)
4. **SEC-03** — Añadir límite de tamaño de archivo (30 min)
5. **TEST-01** — Tests para los 7 calculadores (8h)

### Sprint 2 — Alto (primera semana post-lanzamiento)

6. **SEC-02** — Validar connectors en API (30 min)
7. **BIZ-01** — Sincronizar umbrales de cash discrepancy (1h)
8. **BIZ-02** — Reembolso de crédito si Inngest.send() falla (2h)
9. **SEC-04** — Rate limiting con Upstash (3h)
10. **DB-02** — Añadir índices faltantes (1h)

### Sprint 3 — Medio (optimizaciones continuas)

11. **DB-03** — Optimizar SELECT del dashboard (2h)
12. **SEC-05** — Verificar payment_status en Stripe webhook (30 min)
13. **BIZ-07** — Validar accuracy_rating 1-5 (15 min)
14. **ERR-03** — Migrar a logger estructurado (4h)
15. **INT-02** — Añadir timeout a Claude API (15 min)
