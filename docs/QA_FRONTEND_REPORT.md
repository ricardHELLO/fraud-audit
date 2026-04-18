# QA Frontend Report — FraudAudit
**Fecha:** 2026-03-28
**Auditor:** Claude Sonnet 4.6 (revisión exhaustiva de código estático)
**Scope:** Frontend completo — React, Next.js 14, Clerk, Stripe, Recharts, PDF

---

## Resumen Ejecutivo

| Severidad | Count |
|-----------|-------|
| CRITICAL  | 4     |
| HIGH      | 9     |
| MEDIUM    | 14    |
| LOW       | 9     |
| **Total** | **36**|

El proyecto está bien estructurado y tiene una base sólida. Los issues más graves se concentran en tres áreas: (1) lógica de créditos que puede engañar al usuario o ser abusada, (2) loops de polling que pueden quedar zombies, y (3) guards de datos faltantes en componentes de visualización.

---

## CRITICAL

### C-01 — Demo mode sin rate limiting ni autenticación de origen

**Archivo:** `app/api/analyze/route.ts:54-63`
**Área:** Stripe / Créditos

```ts
// Actual
if (!isDemo) {
  const deducted = await deductCredit(user.id, 'analysis', undefined)
  if (!deducted) { return ... 402 }
}
```

**Descripción:** El flag `isDemo: true` viene del body JSON del cliente (`app/dashboard/upload/page.tsx:217`). Cualquier usuario autenticado puede hacer `POST /api/analyze` con `isDemo: true` en el body y ejecutar análisis ilimitados sin gastar créditos. No hay validación server-side de que el archivo sea realmente el demo de ejemplo, ni un rate limit, ni un máximo de análisis demo por usuario.

**Propuesta de fix:**
```ts
// Opción A: Máximo 1 análisis demo por usuario
const { data: demoUsed } = await supabase
  .from('reports')
  .select('id')
  .eq('user_id', user.id)
  .eq('is_demo', true)
  .limit(1)
if (isDemo && demoUsed?.length > 0) return 402

// Opción B: Ignorar el flag del cliente completamente
// y derivar isDemo del hash del archivo server-side
```

---

### C-02 — Fallback engañoso a 100 créditos en error de red

**Archivo:** `app/dashboard/upload/page.tsx:83-96`
**Área:** UX / Créditos

```ts
// Actual
} catch {
  setUserCredits(100)  // ENGAÑOSO — usuario ve que tiene créditos cuando puede que no
}
```

**Descripción:** Si la llamada a `/api/dashboard` falla (red caída, servidor lento), el estado local se establece a 100 créditos. El usuario ve que "tiene créditos suficientes", pasa por toda la UI de validación, sube el archivo y hace click en "Analizar". El servidor rechaza con 402 en `/api/analyze` porque el crédito real es 0. La UX es confusa y la lógica de créditos del frontend es inútil.

**Propuesta de fix:**
```ts
} catch {
  setUserCredits(null)  // null = desconocido
  // Mostrar banner: "No pudimos verificar tus créditos. El análisis puede fallar."
}
```

---

### C-03 — Race condition en primer poll vs. asignación de `intervalId`

**Archivo:** `app/dashboard/processing/[reportId]/page.tsx:168-178`
**Área:** Estado / Polling

```ts
// Actual
const timeoutId = setTimeout(() => {
  pollStatus()                               // (1) llamada async inmediata
  intervalId = setInterval(pollStatus, 3000) // (2) asignación DESPUÉS
}, 1500)
```

**Descripción:** Si `pollStatus()` resuelve antes de que se asigne `intervalId` (reporte ya completado en DB), llama `clearInterval(undefined)` que es un no-op. La línea siguiente asigna el intervalo real, que nunca se limpia. Resultado: continúa haciendo polls cada 3 segundos indefinidamente aunque `isCompleted = true` (memory leak + requests innecesarios).

**Propuesta de fix:**
```ts
const timeoutId = setTimeout(async () => {
  intervalId = setInterval(pollStatus, 3000)  // asignar PRIMERO
  await pollStatus()                          // luego ejecutar
}, 1500)
```

---

### C-04 — Polling infinito cuando status es `'unavailable'` en AIInsightsTab

**Archivo:** `components/report/AIInsightsTab.tsx:167-208`
**Área:** Estado / Memory Leak

```ts
// La condición de early-return NO incluye 'unavailable'
useEffect(() => {
  if (initialData || !reportId || status === 'ready') return
  // 'unavailable' no está aquí → el efecto se re-ejecuta creando nuevo intervalo
  const interval = setInterval(async () => { ... }, 3000)
  return () => clearInterval(interval)
}, [initialData, reportId, status])
```

**Descripción:** Cuando el polling devuelve `status: 'unavailable'`, se llama `setStatus('unavailable')` y `clearInterval(interval)`. React re-ejecuta el efecto porque `status` cambió. Como `status === 'unavailable'` no hace early-return, se crea un nuevo intervalo infinito que seguirá llamando a la API eternamente.

**Propuesta de fix:**
```ts
if (initialData || !reportId || status === 'ready' || status === 'unavailable') return
```

---

## HIGH

### H-01 — CashTab, InventoryTab y CorrelationTab sin empty state

**Archivos:** `components/report/CashTab.tsx:31`, `components/report/InventoryTab.tsx:27`, `components/report/CorrelationTab.tsx:126`
**Área:** Visualización / Robustez

**Descripción:** Si `data.locals` (CashTab), `data.by_month` (InventoryTab) o `data.scatter_data` (CorrelationTab) son arrays vacíos, los charts renderizan ejes sin datos sin ningún mensaje. El usuario no entiende si no hay datos porque su CSV no los tenía o porque algo falló.

**Propuesta de fix:**
```tsx
if (data.locals.length === 0) {
  return <p className="text-stone-500">No se detectaron datos de caja en el archivo.</p>
}
```

---

### H-02 — XLSX aceptado en dropzone pero no parseado por PapaParse

**Archivo:** `components/upload/FileDropZone.tsx:108`, `app/dashboard/upload/page.tsx:343`
**Área:** Upload / Validación

```tsx
accept=".csv,.xlsx,.xls"  // UI acepta xlsx
// Pero detectVolume usa Papa.parse que solo procesa texto CSV
```

**Descripción:** Si el usuario sube un Excel binario, `file.text()` produce caracteres binarios que PapaParse no puede parsear. El error se captura silenciosamente. La confusión es mayor porque el UI dijo explícitamente que Excel era aceptado.

**Propuesta de fix:** Cambiar el `accept` a solo `.csv` hasta que se implemente parsing real de XLSX:
```tsx
accept=".csv"
```

---

### H-03 — Vista del propietario incrementa el contador de vistas externas

**Archivo:** `app/informe/[slug]/page.tsx:93-100`
**Área:** Lógica de negocio / Analytics

**Descripción:** El contador `external_views` se incrementa en cada visita antes de verificar si el visitante es el propietario. El propietario distorsiona sus propias métricas. Además, el evento PostHog siempre envía `is_owner: false` (línea 105), haciendo imposible distinguir vistas propias de externas en analytics.

**Propuesta de fix:** Verificar auth primero, luego incrementar solo si no es owner, y pasar el valor real de `is_owner` al tracking.

---

### H-04 — Timeout de AI insights basado en `created_at`, no en `completed_at`

**Archivo:** `app/api/reports/[reportId]/ai-insights/route.ts:57-64`
**Área:** Estado / Polling

```ts
const createdAt = new Date(report.created_at).getTime()
const elapsed = Date.now() - createdAt
const TIMEOUT_MS = 60_000 // 1 minuto
```

**Descripción:** Si un informe tarda 3-4 minutos en procesarse, el timer de 1 minuto ya habrá expirado cuando el usuario abra el tab de IA. La API devuelve `status: 'unavailable'` inmediatamente, sin haber dado oportunidad al step de Inngest de terminar. Los insights fallan para todos los informes que tardan más de 1 minuto en generarse.

**Propuesta de fix:** Usar `updated_at` del report o una columna `completed_at` como referencia temporal.

---

### H-05 — Processing page sin límite de tiempo máximo

**Archivo:** `app/dashboard/processing/[reportId]/page.tsx:120-179`
**Área:** UX / Estado infinito

**Descripción:** Si el job de Inngest falla silenciosamente sin actualizar el status a `'failed'`, la página hace polling indefinidamente cada 3 segundos. El usuario queda atrapado sin mensaje de timeout ni acción posible.

**Propuesta de fix:**
```ts
const MAX_POLLS = 100 // ~5 minutos
if (pollCount.current >= MAX_POLLS) {
  setError('El análisis está tardando demasiado. Contacta con soporte o intenta de nuevo.')
  clearInterval(intervalId)
}
```

---

### H-06 — Tooltip de CorrelationTab label semánticamente incorrecto

**Archivo:** `components/report/CorrelationTab.tsx:31-33`
**Área:** Visualización / Datos

```ts
// El label dice "Facturas eliminadas" cuando muestra un importe monetario
<p>Facturas eliminadas: {formatCurrency(point.x)}</p>
```

**Descripción:** El eje X representa el monto en euros de facturas eliminadas, pero el label lo llama simplemente "Facturas eliminadas" como si fuera un conteo. Puede llevar a malinterpretación del dato en un informe de fraude.

**Propuesta de fix:** Cambiar el label a "Importe facturas eliminadas:" para claridad.

---

### H-07 — `canAnalyze` no bloquea con balance 0 y `creditsRequired = 0`

**Archivo:** `app/dashboard/upload/page.tsx:180-186`
**Área:** Validación

**Descripción:** Si el archivo CSV está vacío (0 filas), `detectVolume` devuelve `creditsRequired: 1`. Pero hay un edge case: si `monthsCovered = 0` (fechas no detectadas), `creditsRequired = 1 * 1 = 1`. Sin embargo, si el volumen detector falla y `setPosVolume(null)`, `canAnalyze` será `false` porque requiere `posVolume !== null`. El issue real es que el servidor puede recibir `creditsRequired = 0` en casos edge y no hay guard adicional.

**Propuesta de fix:** Añadir `(userCredits ?? 0) > 0` como guard explícito en `canAnalyze`.

---

### H-08 — Race condition en "Probar con datos de ejemplo" (setTimeout 50ms)

**Archivo:** `app/dashboard/upload/page.tsx:362-373`
**Área:** UX / Estado

```ts
setPosConnector('lastapp')
setTimeout(() => handlePosFileSelect(demoFile), 50)
// handlePosFileSelect usa posConnector del closure
```

**Descripción:** El `setTimeout` de 50ms asume que React habrá re-renderizado con el nuevo `posConnector` dentro de ese tiempo. En dispositivos lentos, `handlePosFileSelect` podría llamarse con `posConnector = ''`, causando que el volume detection y tracking de PostHog usen conector vacío.

**Propuesta de fix:** Pasar el connector explícitamente a la función, sin depender de state asíncrono.

---

### H-09 — PDF download sin `rel="noopener noreferrer"`

**Archivo:** `components/report/ReportLayout.tsx:123`
**Área:** Seguridad

```ts
onClick={() => window.open(`/api/reports/${reportId}/pdf`, '_blank')}
```

**Descripción:** Abrir ventanas con `_blank` sin `noopener` expone al contexto de la página padre. Aunque el target es el mismo origen, es una mala práctica documentada por OWASP.

**Propuesta de fix:**
```ts
window.open(`/api/reports/${reportId}/pdf`, '_blank', 'noopener,noreferrer')
```

---

## MEDIUM

### M-01 — Sin validación de tipo de archivo en drag-and-drop

**Archivo:** `components/upload/FileDropZone.tsx:53-65`
**Área:** Validación / Upload

**Descripción:** El atributo `accept` en el `<input>` solo filtra el diálogo del sistema operativo, no los drops. Al hacer drag-and-drop, cualquier archivo puede ser soltado. No hay validación de extensión ni MIME type en el handler `handleDrop`.

**Propuesta de fix:** Validar extensión en `handleDrop`:
```ts
const allowedExts = ['.csv', '.xlsx', '.xls']
const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
if (!allowedExts.includes(ext)) { /* mostrar error */ return }
```

---

### M-02 — Sin límite de tamaño de archivo en cliente

**Archivos:** `components/upload/FileDropZone.tsx`, `app/dashboard/upload/page.tsx`
**Área:** Validación / UX

**Descripción:** No hay validación de tamaño de archivo. Un CSV de 500MB bloquearía el hilo principal al hacer `file.text()` para el volume detection y agotaría la memoria del navegador.

**Propuesta de fix:** Añadir en `handleFile`:
```ts
const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
if (file.size > MAX_SIZE) {
  // mostrar error: "El archivo es demasiado grande. Máximo 50 MB."
  return
}
```

---

### M-03 — Input de nombre de restaurante sin `maxLength`

**Archivo:** `app/dashboard/upload/page.tsx:314-320`
**Área:** Validación / UX

**Descripción:** El campo de nombre de restaurante acepta texto de longitud ilimitada. Un nombre extremadamente largo rompería el layout del header del informe y podría causar problemas en la DB.

**Propuesta de fix:** Añadir `maxLength={100}` al input.

---

### M-04 — Filas de tabla clickeables sin semántica accesible

**Archivo:** `components/dashboard/ReportsList.tsx:120-161`
**Área:** Accesibilidad

**Descripción:** Las filas de la tabla tienen `onClick` pero son elementos `<tr>` sin `role="button"` ni `tabIndex`. Usuarios de teclado no pueden navegar con Tab + Enter. La fila también contiene un `<a>` interno, creando doble acción.

**Propuesta de fix:** Eliminar el `onClick` del `<tr>` y hacer que solo el `<a>` "Ver informe" sea la acción clickeable, o usar `<a>` envolviendo toda la fila.

---

### M-05 — YAxis de CashTab usa `(v / 1)` como no-op

**Archivo:** `components/report/CashTab.tsx:63`
**Área:** Visualización / Calidad de código

```ts
tickFormatter={(v: number) => `${(v / 1).toLocaleString('es-ES', ...)}`}
```

**Descripción:** `v / 1` no hace nada. Es código muerto que probablemente era `v / 1000` en algún momento. Confunde a quien lee el código.

**Propuesta de fix:**
```ts
tickFormatter={(v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
```

---

### M-06 — Banner de compra exitosa sin botón de cierre

**Archivo:** `app/dashboard/page.tsx:113-122`
**Área:** UX

**Descripción:** El banner de éxito de compra se muestra permanentemente. No hay botón de cierre ni auto-dismiss. Ocupa espacio visual indefinidamente hasta que el usuario navega fuera.

**Propuesta de fix:** Añadir botón de cierre o auto-dismiss con `setTimeout(() => setShowPurchaseSuccess(false), 5000)`.

---

### M-07 — `key={i}` usando índice de array en listas renderizadas

**Archivos:** `components/report/AIInsightsTab.tsx:267`, `lib/pdf/report-pdf.tsx:267,334,427`, `components/report/SummaryTab.tsx:133`
**Área:** React / Performance

**Descripción:** Usar el índice del array como `key` causa problemas de reconciliación si el orden de items cambia. Los insights de IA podrían reordenarse y React no reconciliaría correctamente.

**Propuesta de fix:** Usar identificadores semánticos únicos como `key={rec.title}` o `key={anomaly.title}`.

---

### M-08 — Estado null de créditos no visible en VolumePreview

**Archivo:** `app/dashboard/upload/page.tsx:347-350`
**Área:** UX / Estados de carga

**Descripción:** Mientras se carga el balance (`userCredits === null`), si el usuario sube un archivo, `VolumePreview` no aparece sin ningún skeleton o indicador de "cargando créditos". La UI parece rota.

**Propuesta de fix:** Mostrar un skeleton de VolumePreview mientras `userCredits === null`.

---

### M-09 — Sin error boundary alrededor de charts de Recharts

**Archivos:** `components/report/CashTab.tsx`, `InventoryTab.tsx`, `CorrelationTab.tsx`
**Área:** Robustez / UX

**Descripción:** Si Recharts lanza una excepción (datos malformados, bug de librería), toda la pestaña cae con "Application error". No hay ningún mecanismo de contención.

**Propuesta de fix:** Envolver cada chart en un `<ErrorBoundary>` con fallback.

---

### M-10 — Fechas en VolumePreview en formato ISO no localizado

**Archivo:** `components/upload/VolumePreview.tsx:46-49`
**Área:** Internacionalización

```tsx
`${dateFrom} - ${dateTo}`
// Muestra: "2024-01-01 - 2024-12-31" en lugar de "01/01/2024 - 31/12/2024"
```

**Descripción:** Las fechas se muestran en formato ISO cuando el usuario español esperaría `DD/MM/YYYY`.

**Propuesta de fix:** Añadir una función de formateo:
```ts
const toDisplayDate = (iso: string) => iso.split('-').reverse().join('/')
```

---

### M-11 — Stripe API version obsoleta

**Archivos:** `app/api/checkout/route.ts:65`, `app/api/webhooks/stripe/route.ts:25`
**Área:** Stripe / Mantenibilidad

```ts
{ apiVersion: '2023-10-16' }
```

**Descripción:** Versión antigua. Stripe recomienda actualizar a la versión más reciente para compatibilidad futura.

**Propuesta de fix:** Actualizar a la última versión estable y revisar el changelog.

---

### M-12 — Strings hardcodeados con acentos faltantes

**Archivos:** Múltiples componentes
**Área:** Internacionalización / UX

Strings con errores tipográficos detectados:
- `app/dashboard/page.tsx:88`: `'+1 ejecucion ganada'` → debería ser `ejecución`
- `app/dashboard/page.tsx:119`: `'creditos'`, `'anadido'` → `créditos`, `añadido`
- `components/upload/VolumePreview.tsx:125-126`: `'ejecucion'` → `ejecución`
- `components/dashboard/GamificationChecklist.tsx:315`: `'ejecucion'` → `ejecución`
- `app/dashboard/upload/page.tsx:498`: `'Que pasa con tus datos?'` → `¿Qué pasa con tus datos?`

---

### M-13 — Informe en estado `processing` visible públicamente sin contexto

**Archivo:** `app/informe/[slug]/page.tsx:109-148`
**Área:** UX / Auth

**Descripción:** Un slug de informe en proceso es accesible públicamente y muestra una pantalla de spinner con el slug expuesto en el footer (`p` tag, línea 144). Un visitante externo no sabe qué está viendo. No es un fallo de seguridad pero sí de UX.

**Propuesta de fix:** Para estado `processing`, mostrar "Informe no disponible aún. Vuelve más tarde." sin exponer el slug.

---

### M-14 — Balance de créditos puede estar stale en `handlePosFileSelect`

**Archivo:** `app/dashboard/upload/page.tsx:120`
**Área:** Estado / React

**Descripción:** El `useCallback` usa `userCredits` del closure. Si el usuario tiene la página abierta mucho tiempo y consume créditos desde otra pestaña, la validación de créditos en el frontend usará el valor antiguo. El servidor rechazará con 402 al hacer análisis.

**Propuesta de fix:** Re-fetch del balance justo antes del submit en `handleAnalyze`, con actualización del estado antes de permitir continuar.

---

## LOW

### L-01 — Sin sistema de internacionalización (i18n)

**Área:** Internacionalización
**Descripción:** Todos los textos están hardcodeados en español. Imposibilita futuras expansiones y dificulta auditorías de contenido. Considerar `next-intl` o similar.

---

### L-02 — Sin lazy loading de tabs del informe

**Archivo:** `components/report/ReportLayout.tsx`
**Área:** Performance

**Descripción:** Todos los componentes de tabs se importan estáticamente. Usar `React.lazy` + `Suspense` para tabs no activos reduciría el bundle inicial de la página de informe.

---

### L-03 — PDF no incluye visualizaciones gráficas

**Archivo:** `lib/pdf/report-pdf.tsx`
**Área:** Funcionalidad / UX

**Descripción:** El PDF generado tiene tablas de datos pero ninguno de los gráficos visuales que hacen el informe comprensible. Es considerablemente menos útil que la versión web.

**Sugerencia:** Generar los charts como imágenes base64 (con `canvas` / `chart.js`) e incrustarlos con el componente `<Image>` de react-pdf.

---

### L-04 — Footer del PDF con `<Text>` anidado puede tener rendering issues

**Archivo:** `lib/pdf/report-pdf.tsx:311-313`
**Área:** PDF / Rendering

**Descripción:** El `styles.footer` tiene `position: 'absolute'` aplicado a un `<Text>` que contiene otro `<Text>`. En `@react-pdf/renderer`, el posicionamiento de Text anidado con absolute puede ser inconsistente entre versiones.

**Propuesta de fix:** Usar `<View fixed style={styles.footer}><Text>...</Text></View>` para footers.

---

### L-05 — No hay indicador de progreso durante upload del archivo

**Archivo:** `app/dashboard/upload/page.tsx:160-177`
**Área:** UX / Feedback

**Descripción:** El upload de archivos usa `fetch` sin indicador de progreso. Para archivos grandes, el usuario solo ve el spinner general de "Analizando" sin saber cuánto ha subido. `fetch` no soporta `onprogress` nativamente; requeriría `XMLHttpRequest`.

---

### L-06 — Checklist de gamificación no actualiza estado `completed` tras ejecutar acción

**Archivo:** `components/dashboard/GamificationChecklist.tsx`
**Área:** UX / Estado

**Descripción:** Las acciones de "share" y "referral" no marcan el item como completado tras ejecutarse. El usuario copia el enlace pero el checklist sigue mostrando la acción como pendiente, dando sensación de bug.

---

### L-07 — Narrativa de IA renderizada como párrafos sin Markdown

**Archivo:** `components/report/AIInsightsTab.tsx:266-270`
**Área:** UX / Contenido

**Descripción:** El contenido de `insights.narrative` se renderiza spliteando por `\n`, pero si el modelo genera listas o negritas con Markdown (`**texto**`, `- item`), aparecerán como texto plano con asteriscos literales. El contenido visual es subóptimo.

**Propuesta de fix:** Usar `react-markdown` con una allowlist de elementos seguros (p, ul, li, strong, em) para renderizar la narrativa.

---

### L-08 — Accesibilidad: tabs del informe sin `aria-selected`

**Archivo:** `components/report/ReportLayout.tsx:150-163`
**Área:** Accesibilidad

```tsx
<button
  onClick={() => { ... setActiveTab(tab.key) }}
  className={cn('...', activeTab === tab.key ? 'border-blue-600...' : '...')}
>
```

**Descripción:** Los botones de tab no tienen `role="tab"`, `aria-selected`, ni están contenidos en un `role="tablist"`. Screen readers no pueden anunciar el tab activo ni navegar correctamente por la tablist.

**Propuesta de fix:**
```tsx
<nav role="tablist" aria-label="Secciones del informe">
  <button role="tab" aria-selected={activeTab === tab.key} ... >
```

---

### L-09 — Stripe API: no se valida `payment_status` en webhook

**Archivo:** `app/api/webhooks/stripe/route.ts:57-63`
**Área:** Stripe / Seguridad

```ts
case 'checkout.session.completed': {
  const session = event.data.object
  // No verifica session.payment_status === 'paid'
```

**Descripción:** El evento `checkout.session.completed` puede dispararse para sesiones con `payment_status: 'unpaid'` en ciertos flujos de Stripe (ej: modo setup, suscripciones con trial). Aunque en modo `payment` esto es poco probable, es una buena práctica validarlo.

**Propuesta de fix:**
```ts
if (session.payment_status !== 'paid') {
  return NextResponse.json({ received: true, skipped: 'not_paid' })
}
```

---

## Resumen de Prioridades de Corrección

### Sprint 1 — Críticos (esta semana)
1. **C-01** — Rate limit demo mode (seguridad económica)
2. **C-02** — Fallback de créditos engañoso (UX bloqueante)
3. **C-03** — Race condition en processing page (memory leak)
4. **C-04** — Polling infinito en AIInsightsTab (memory leak)

### Sprint 2 — Altos (próximas 2 semanas)
5. **H-01** — Empty states en charts de Recharts
6. **H-02** — XLSX aceptado pero no parseado
7. **H-05** — Processing page sin timeout máximo
8. **H-03** — Contador de vistas externas incorrecto para owner
9. **H-04** — Timeout AI insights basado en `created_at`

### Sprint 3 — Medios (próximo mes)
10. **M-01, M-02** — Validación de archivos (tipo + tamaño)
11. **M-06** — Banner de compra sin cierre
12. **M-09** — Error boundaries en charts
13. **M-10** — Fechas localizadas
14. **M-12** — Strings con tildes faltantes

---

## Notas Metodológicas

Este informe fue generado por análisis estático de código fuente. No se ejecutó el proyecto, no se realizaron pruebas de integración, y no se verificó el comportamiento de Inngest, Supabase RLS, o la configuración de producción de Clerk/Stripe. Se recomienda complementar este análisis con:

1. Pruebas E2E automatizadas (Playwright/Cypress) del flujo completo upload → análisis → informe
2. Auditoría de Supabase Row Level Security (RLS policies)
3. Test de carga del endpoint `/api/upload` con archivos de diferentes tamaños
4. Revisión manual de accesibilidad con VoiceOver / NVDA
5. Lighthouse audit en producción para Web Vitals

---

*Informe generado el 2026-03-28 — FraudAudit QA Frontend v1.0*
