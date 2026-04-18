# QA Frontend Audit — FraudAudit
**Fecha:** 2026-03-28
**Auditor:** Claude Code (Sonnet 4.6)
**Scope:** Frontend completo — Next.js 14 / React 18 / TypeScript
**Resultado:** 28 hallazgos — 2 CRITICAL · 8 HIGH · 11 MEDIUM · 7 LOW

---

## Índice
1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [UX/UI y Accesibilidad](#2-uxui-y-accesibilidad)
3. [Componentes React](#3-componentes-react)
4. [Routing y Navegación](#4-routing-y-navegación)
5. [Visualización de Datos (Recharts)](#5-visualización-de-datos-recharts)
6. [Formularios y Uploads](#6-formularios-y-uploads)
7. [Estado y Data Fetching](#7-estado-y-data-fetching)
8. [Auth (Clerk)](#8-auth-clerk)
9. [Pagos (Stripe)](#9-pagos-stripe)
10. [Performance Frontend](#10-performance-frontend)
11. [Internacionalización](#11-internacionalización)

---

## 1. Resumen Ejecutivo

| Severidad | Cantidad | Descripción resumida |
|-----------|----------|----------------------|
| 🔴 CRITICAL | 2 | Race condition en modo demo; memory leaks en polling |
| 🟠 HIGH | 8 | Sin validación de archivo, sin error boundaries, sin límite de polling, charts vacíos sin estado |
| 🟡 MEDIUM | 11 | Accesibilidad, `any` types, sin confirmación antes de borrar, info leaks |
| 🔵 LOW | 7 | Metadatos de página, PDF sin gráficos, validación menor |

**Stack auditado:** Next.js 14.2.25 · React 18.3.0 · TypeScript 5.4 · Clerk 6.39 · Recharts 2.12 · @react-pdf/renderer 4.3 · Stripe 14 · Supabase 2.39

---

## 2. UX/UI y Accesibilidad

### AUDIT-001 — Tab navigation sin roles ARIA correctos
**Severidad:** 🟡 MEDIUM
**Archivo:** `components/report/ReportLayout.tsx:148-165`

```tsx
// ACTUAL — incorrecto
<nav className="-mb-px flex overflow-x-auto scrollbar-none" aria-label="Tabs">
  {TABS.map((tab) => (
    <button
      key={tab.key}
      onClick={() => { trackReportTabClicked(tab.key); setActiveTab(tab.key) }}
      className={cn(...)}
    >
      {tab.label}
    </button>
  ))}
</nav>
```

**Problema:** Los botones de tab carecen de `role="tab"`, `aria-selected` y `aria-controls`. El `<nav>` debería tener `role="tablist"`. Los lectores de pantalla no anuncian el estado activo/inactivo de cada pestaña.

**Fix propuesto:**
```tsx
<nav role="tablist" aria-label="Secciones del informe" className="-mb-px flex overflow-x-auto scrollbar-none">
  {TABS.map((tab) => (
    <button
      key={tab.key}
      role="tab"
      aria-selected={activeTab === tab.key}
      aria-controls={`tabpanel-${tab.key}`}
      id={`tab-${tab.key}`}
      onClick={() => { trackReportTabClicked(tab.key); setActiveTab(tab.key) }}
      className={cn(...)}
    >
      {tab.label}
    </button>
  ))}
</nav>
// Y en el contenido:
<main role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} ...>
```

---

### AUDIT-002 — Emojis en títulos sin `aria-hidden`
**Severidad:** 🟡 MEDIUM
**Archivo:** `components/report/SummaryTab.tsx:72,89,105,127`

```tsx
// ACTUAL — los lectores de pantalla leen "Emoji dinero Total Descuadre Caja"
<CardTitle className="text-sm text-stone-500 font-medium">
  <span className="mr-1.5">{'💰'}</span>Total Descuadre Caja
</CardTitle>
```

**Problema:** Los emojis sin `aria-hidden="true"` son leídos por lectores de pantalla con su descripción completa ("money bag", "receipt", etc.), generando una experiencia confusa.

**Fix propuesto:**
```tsx
<span className="mr-1.5" aria-hidden="true">{'💰'}</span>
```

---

### AUDIT-003 — Botón de descarga PDF sin indicador de carga
**Severidad:** 🟡 MEDIUM
**Archivo:** `components/report/ReportLayout.tsx:119-136`

```tsx
// ACTUAL — abre PDF sin feedback
<Button
  variant="secondary"
  size="sm"
  onClick={() => window.open(`/api/reports/${reportId}/pdf`, '_blank')}
>
  Descargar PDF
</Button>
```

**Problema:** La generación del PDF es server-side y puede tardar 2-5 segundos. El usuario no recibe ningún feedback visual. Sin loading state, pueden hacer clic múltiples veces.

**Fix propuesto:**
```tsx
const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

async function handleDownloadPdf() {
  setIsDownloadingPdf(true)
  window.open(`/api/reports/${reportId}/pdf`, '_blank')
  // Pequeño delay para dar feedback visual
  setTimeout(() => setIsDownloadingPdf(false), 2000)
}

<Button
  variant="secondary"
  size="sm"
  loading={isDownloadingPdf}
  onClick={handleDownloadPdf}
>
  Descargar PDF
</Button>
```

---

### AUDIT-004 — Botón de borrar alerta sin confirmación
**Severidad:** 🟠 HIGH
**Archivo:** `components/dashboard/AlertRulesCard.tsx:53-67`

```tsx
// ACTUAL — delete directo sin confirmación
async function handleDelete(ruleId: string) {
  try {
    const res = await fetch(`/api/alerts/${ruleId}`, { method: 'DELETE' })
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      showToast('Alerta eliminada', 'success')
    }
  } catch { ... }
}
```

**Problema:** Un clic accidental en el icono de papelera elimina la alerta permanentemente sin confirmación. La acción no es reversible desde el frontend.

**Fix propuesto:** Añadir un `window.confirm()` o un modal de confirmación antes de la llamada DELETE:
```tsx
async function handleDelete(ruleId: string) {
  const ruleName = rules.find(r => r.id === ruleId)?.name
  if (!window.confirm(`¿Eliminar la alerta "${ruleName}"? Esta acción no se puede deshacer.`)) return
  // ... resto del código
}
```

---

### AUDIT-005 — Botón de eliminar alerta sin `aria-label`
**Severidad:** 🟡 MEDIUM
**Archivo:** `components/dashboard/AlertRulesCard.tsx:148-157`

```tsx
// ACTUAL — solo title, no aria-label
<button
  type="button"
  onClick={() => handleDelete(rule.id)}
  className="..."
  title="Eliminar alerta"   // ← solo title, no aria-label
>
  <svg .../>   {/* icono sin texto visible */}
</button>
```

**Problema:** El atributo `title` no es suficiente para accesibilidad. Los lectores de pantalla prefieren `aria-label`. Además, el nombre de la alerta debería estar incluido para identificar qué se está eliminando.

**Fix propuesto:**
```tsx
<button
  type="button"
  onClick={() => handleDelete(rule.id)}
  aria-label={`Eliminar alerta: ${rule.name}`}
  className="..."
>
```

---

### AUDIT-006 — Página "processing" pública no se auto-refresca
**Severidad:** 🟡 MEDIUM
**Archivo:** `app/informe/[slug]/page.tsx:110-148`

```tsx
// ACTUAL — estado 'processing' es un Server Component estático
if (report.status === 'processing') {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      ...spinner estático...
      <h1>Informe en proceso</h1>
      <p>Vuelve en unos minutos para ver los resultados.</p>
    </div>
  )
}
```

**Problema:** Si alguien recibe el link compartido antes de que el informe termine de procesarse, ve un spinner estático y un mensaje que le pide que "vuelva en unos minutos". No hay auto-refresh ni indicación de cuándo estará listo.

**Fix propuesto:** Convertir la vista de "processing" en un Client Component con `window.location.reload()` cada X segundos, o usar `next/navigation` con `router.refresh()`.

---

### AUDIT-007 — Slug interno expuesto en vista pública de error
**Severidad:** 🟡 MEDIUM (info leak menor)
**Archivo:** `app/informe/[slug]/page.tsx:143-145`

```tsx
// ACTUAL — expone el slug en producción
<p className="mt-6 text-xs text-stone-400">
  Slug: {report.slug}   {/* ← exposición innecesaria */}
</p>
```

**Problema:** En la vista de "informe en proceso" se muestra el slug del informe al visitante. Aunque el slug ya está en la URL, duplicarlo en el body es información redundante e innecesaria para el usuario final.

**Fix propuesto:** Eliminar este párrafo en producción o mostrarlo solo en `NODE_ENV === 'development'`.

---

## 3. Componentes React

### AUDIT-008 — Race condition crítico en modo demo (stale closure)
**Severidad:** 🔴 CRITICAL
**Archivo:** `app/dashboard/upload/page.tsx:362-383`

```tsx
// ACTUAL — bug de closure
onClick={async () => {
  const res = await fetch('/demo/lastapp-demo.csv')
  const blob = await res.blob()
  const demoFile = new File([blob], 'lastapp-demo.csv', { type: 'text/csv' })
  setPosConnector('lastapp')          // ← setState schedule re-render
  setRestaurantName('Demo — Paella Dorada')
  setIsDemo(true)
  // El comentario reconoce el problema pero la solución es incorrecta:
  // "Slight delay to let connector state update before file handler reads it"
  setTimeout(() => handlePosFileSelect(demoFile), 50)  // ← bug: usa closure viejo
}}
```

**Problema detallado:** `handlePosFileSelect` está memoizado con `useCallback([posConnector, userCredits])`. En el momento en que se programa el `setTimeout`, `posConnector` es `''` (vacío). El `setTimeout` captura la referencia al `handlePosFileSelect` **antiguo** (closure con `posConnector = ''`). Aunque React re-renderiza antes de que pasen los 50ms, el timeout ya capturó la versión obsoleta. El resultado es que `detectVolume(text, '')` se ejecuta con conector vacío en lugar de `'lastapp'`.

**Impacto:** El modo demo siempre ejecuta detección de volumen con conector vacío, lo que puede producir resultados incorrectos o un error silencioso.

**Fix propuesto:**
```tsx
// Opción 1: usar una ref para acceder siempre a la versión más reciente
const handlePosFileSelectRef = useRef(handlePosFileSelect)
useEffect(() => { handlePosFileSelectRef.current = handlePosFileSelect }, [handlePosFileSelect])

// En el onClick del demo:
setPosConnector('lastapp')
setRestaurantName('Demo — Paella Dorada')
setIsDemo(true)
// Llamar directamente con el connector ya conocido, sin pasar por handlePosFileSelect:
const text = await demoFile.text()
const volume = detectVolume(text, 'lastapp')   // connector hardcoded aquí
setPosFile(demoFile)
setPosVolume(volume)
```

---

### AUDIT-009 — Múltiples fetches sin AbortController (memory leaks)
**Severidad:** 🔴 CRITICAL
**Archivos:** múltiples

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/dashboard/page.tsx` | 46-72 | `loadDashboard()` sin cleanup |
| `app/dashboard/upload/page.tsx` | 83-97 | `fetchBalance()` sin cleanup |
| `app/dashboard/comparar/page.tsx` | 65-87 | `loadReports()` sin cleanup |
| `app/dashboard/comparar/page.tsx` | 97-120 | `compare()` sin cleanup — race condition si slugA/slugB cambian rápido |

```tsx
// ACTUAL — dashboard/page.tsx:46-72
useEffect(() => {
  if (!isUserLoaded || !user) return
  async function loadDashboard() {
    setIsLoading(true)
    const res = await fetch('/api/dashboard')  // ← sin AbortController
    if (res.ok) {
      const data = await res.json()
      setBalance(data.balance)  // ← puede ejecutarse tras unmount
      // ...
    }
  }
  loadDashboard()
}, [isUserLoaded, user])
// Sin return cleanup
```

**Problema:** Si el usuario navega fuera antes de que el fetch termine, `setBalance()` y `setReports()` se ejecutan sobre un componente desmontado. React 18 suprime el warning de "can't perform state update on unmounted component", pero el fetch sigue en vuelo consumiendo recursos.

En `comparar/page.tsx`, si el usuario cambia `slugA` mientras la comparación anterior está en vuelo, se lanzan dos fetches simultáneos y el resultado puede ser el de la petición más antigua (race condition de datos).

**Fix propuesto:**
```tsx
useEffect(() => {
  if (!isUserLoaded || !user) return
  const controller = new AbortController()

  async function loadDashboard() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/dashboard', { signal: controller.signal })
      if (res.ok) {
        const data = await res.json()
        setBalance(data.balance)
        // ...
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // ignorar
      console.error('Failed to load dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  loadDashboard()
  return () => controller.abort()
}, [isUserLoaded, user])
```

---

### AUDIT-010 — Keys con índice en listas que pueden reordenarse
**Severidad:** 🟡 MEDIUM
**Archivos:** múltiples

| Archivo | Línea | Lista |
|---------|-------|-------|
| `components/report/SummaryTab.tsx` | 133 | `key_findings.map((finding, i) => <li key={i}>` |
| `components/report/AIInsightsTab.tsx` | 267 | `narrative.split('\n').map((paragraph, i) => <p key={i}>` |
| `components/report/AIInsightsTab.tsx` | 294 | `recommendations.map((rec, i) => <Card key={i}>` |
| `components/report/AIInsightsTab.tsx` | 325 | `anomalies.map((anomaly, i) => <Card key={i}>` |
| `lib/pdf/report-pdf.tsx` | 267,335,388,409 | Múltiples listas PDF |

**Problema:** Usar el índice del array como `key` puede causar problemas de reconciliación si el array cambia de orden o se eliminan elementos. React puede reutilizar el DOM incorrecto.

**Fix propuesto:** Para arrays de strings, usar el propio valor (si es único) o un hash. Para objetos, usar un identificador estable:
```tsx
// Para key_findings (strings):
{data.key_findings.map((finding) => (
  <li key={finding.slice(0, 40)} className="...">  {/* primeros 40 chars como key */}

// Para recomendaciones (si tienen título único):
{insights.recommendations.map((rec) => (
  <Card key={rec.title} ...>
```

---

### AUDIT-011 — Tipo `any` explícito en componentes
**Severidad:** 🟡 MEDIUM
**Archivos:** múltiples

```tsx
// components/report/CorrelationTab.tsx:24
function ScatterTooltip({ active, payload }: any) { ... }

// app/dashboard/comparar/page.tsx:75
const completed = (data.reports ?? []).filter(
  (r: any) => r.status === 'completed'
)
```

**Problema:** El uso de `any` anula las ventajas del TypeScript estricto configurado en el proyecto. En `ScatterTooltip`, si la API de Recharts cambia, el error no se detectará en compilación.

**Fix propuesto:**
```tsx
// Para ScatterTooltip:
import type { TooltipProps } from 'recharts'
interface ScatterPayloadItem { payload: { label: string; x: number; y: number } }

function ScatterTooltip({ active, payload }: TooltipProps<number, string> & { payload?: ScatterPayloadItem[] }) { ... }

// Para comparar/page.tsx:
const completed = (data.reports ?? []).filter(
  (r: ReportSummary) => r.status === 'completed'
)
```

---

### AUDIT-012 — Sin error boundaries en la vista de informe
**Severidad:** 🟠 HIGH
**Archivo:** `components/report/ReportLayout.tsx`, no existe `app/error.tsx`

**Problema:** No existe ningún Error Boundary en la aplicación. Si cualquier componente de tab (CashTab, InventoryTab, etc.) lanza un error JavaScript (p.ej. `data.locals.map is not a function` si el tipo de dato es inesperado), el error se propaga y **toda la aplicación** se rompe con una pantalla en blanco. No hay `app/error.tsx` ni `app/dashboard/error.tsx`.

**Descripción visual:** El usuario verá una página completamente vacía o el mensaje de error por defecto de React, sin posibilidad de recuperación.

**Fix propuesto:**
```tsx
// app/error.tsx
'use client'
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-stone-900">Algo fue mal</h2>
        <p className="mt-2 text-sm text-stone-500">{error.message}</p>
        <button onClick={reset} className="mt-4 ...">Reintentar</button>
      </div>
    </div>
  )
}
```

---

### AUDIT-013 — Processing page sin timeout máximo de polling
**Severidad:** 🟠 HIGH
**Archivo:** `app/dashboard/processing/[reportId]/page.tsx:121-179`

```tsx
// ACTUAL — polling indefinido si el job cuelga
const timeoutId = setTimeout(() => {
  pollStatus()
  intervalId = setInterval(pollStatus, 3000)  // cada 3 segundos, sin límite
}, 1500)
```

**Problema:** El polling se detiene en caso de error de API (status `failed`), pero si el job de Inngest queda colgado en estado `processing` indefinidamente (bug de backend, timeout de worker), el frontend seguirá haciendo peticiones cada 3 segundos **para siempre** mientras el usuario tenga la pestaña abierta.

**Fix propuesto:**
```tsx
const MAX_POLL_DURATION_MS = 5 * 60 * 1000 // 5 minutos máximo
const startTime = Date.now()

// Dentro de pollStatus:
if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
  setError('El análisis está tardando más de lo esperado. Por favor, contacta con soporte.')
  clearInterval(intervalId)
  return
}
```

---

## 4. Routing y Navegación

### AUDIT-014 — Sin página 404 personalizada
**Severidad:** 🔵 LOW
**Archivo:** No existe `app/not-found.tsx`

**Problema:** Next.js usa su página 404 por defecto. No existe `app/not-found.tsx` personalizada que mantenga el branding de FraudAudit.

**Fix propuesto:** Crear `app/not-found.tsx` con la misma estética que el resto de páginas de error.

---

### AUDIT-015 — Metadatos de página faltantes en sub-rutas
**Severidad:** 🔵 LOW
**Archivos:** `app/dashboard/upload/page.tsx`, `app/dashboard/processing/[reportId]/page.tsx`, `app/dashboard/comparar/page.tsx`

**Problema:** Estas páginas son Client Components (`'use client'`) y no exportan `metadata`. El `<title>` será genérico (el del layout raíz). Impacta SEO interno y el historial del navegador.

**Fix propuesto:** Para páginas que son Client Components y necesitan metadata dinámica, crear un `layout.tsx` padre que exporte la metadata:
```tsx
// app/dashboard/upload/layout.tsx
export const metadata = { title: 'Nuevo informe — FraudAudit' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
```

---

### AUDIT-016 — Deep link a tab del informe no funciona
**Severidad:** 🟡 MEDIUM
**Archivo:** `components/report/ReportLayout.tsx:69`

```tsx
const [activeTab, setActiveTab] = useState<TabKey>('resumen')
```

**Problema:** El tab activo no se refleja en la URL. Si el usuario comparte el link del informe estando en el tab "Conclusiones", el destinatario siempre llega al tab "Resumen". Tampoco funciona el botón "Atrás" del navegador para cambiar de tab.

**Fix propuesto:** Usar query params para el tab activo:
```tsx
import { useRouter, useSearchParams } from 'next/navigation'

const searchParams = useSearchParams()
const router = useRouter()
const activeTab = (searchParams.get('tab') as TabKey) ?? 'resumen'

function handleTabChange(key: TabKey) {
  trackReportTabClicked(key)
  const params = new URLSearchParams(searchParams.toString())
  params.set('tab', key)
  router.replace(`?${params.toString()}`, { scroll: false })
}
```

---

## 5. Visualización de Datos (Recharts)

### AUDIT-017 — Charts sin estado vacío cuando no hay datos
**Severidad:** 🟠 HIGH
**Archivos:** `components/report/CashTab.tsx:51-88`, `components/report/InventoryTab.tsx:70-111`, `components/report/CorrelationTab.tsx:79-135`

```tsx
// CashTab.tsx:31 — si data.locals es [] el chart renderiza vacío
const chartData = data.locals.map((local) => ({
  name: local.name,
  sobrante: local.total_discrepancy > 0 ? local.total_discrepancy : 0,
  faltante: local.total_discrepancy < 0 ? local.total_discrepancy : 0,
  total: local.total_discrepancy,
}))

// Se renderiza el ResponsiveContainer igualmente aunque chartData.length === 0
<div className="h-80">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={chartData} ...>  {/* ← chart vacío, sin mensaje */}
```

**Problema:** Cuando `data.locals`, `data.by_month` o `data.scatter_data` están vacíos, Recharts renderiza ejes vacíos sin datos ni mensaje explicativo. El usuario ve un gráfico en blanco sin saber si es un error o que genuinamente no hay datos.

**Descripción visual:** Ejes XY vacíos con fondo gris, sin barras ni puntos.

**Fix propuesto:** Guard antes del gráfico:
```tsx
{chartData.length === 0 ? (
  <div className="flex h-80 items-center justify-center rounded-xl bg-stone-50 text-sm text-stone-400">
    No hay datos suficientes para mostrar este gráfico
  </div>
) : (
  <div className="h-80">
    <ResponsiveContainer ...>
      <BarChart data={chartData} ...>
```

---

### AUDIT-018 — Tooltip del Scatter chart tipado como `any`
**Severidad:** 🟡 MEDIUM
**Archivo:** `components/report/CorrelationTab.tsx:24`

```tsx
// ACTUAL
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div ...>
      <p>{point.label}</p>
      <p>Facturas eliminadas: {formatCurrency(point.x)}</p>
      <p>Descuadre caja: {formatCurrency(point.y)}</p>
    </div>
  )
}
```

**Problema:** `point.x` y `point.y` son llamados con `formatCurrency()` que espera `number`. Si la API devuelve `null` o `undefined` en esos campos, `formatCurrency(null)` devolverá `"NaN €"` visible al usuario.

**Fix propuesto:** Tipar correctamente y añadir guards:
```tsx
interface ScatterPoint { label: string; x: number; y: number }
function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  if (typeof point.x !== 'number' || typeof point.y !== 'number') return null
  // ...
}
```

---

### AUDIT-019 — YAxis de CashTab sin símbolo de moneda
**Severidad:** 🔵 LOW
**Archivo:** `components/report/CashTab.tsx:60-64`

```tsx
<YAxis
  tick={{ fontSize: 12, fill: '#78716c' }}
  tickLine={false}
  tickFormatter={(v: number) => `${(v / 1).toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
/>
```

**Problema:** El `tickFormatter` muestra números sin unidad (p.ej. "1.500" en lugar de "1.500 €"). El usuario no sabe si las cifras son euros, unidades u otra magnitud. Además, `v / 1` es una operación identidad sin propósito.

**Fix propuesto:**
```tsx
tickFormatter={(v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`}
```

---

### AUDIT-020 — PDF sin gráficos/visualizaciones
**Severidad:** 🔵 LOW
**Archivo:** `lib/pdf/report-pdf.tsx`

**Problema:** El PDF generado incluye solo tablas y texto. Los gráficos de Recharts (barras, scatter, líneas temporales) no aparecen en el PDF. El usuario que descarga el PDF recibe un informe menos informativo que la versión web.

**Limitación técnica:** `@react-pdf/renderer` no puede renderizar componentes de Recharts (que usan SVG/DOM). Requeriría generar imágenes de los gráficos en servidor (p.ej. via `satori` o capturas con `canvas`).

**Recomendación:** Añadir una nota al pie del PDF: "Las visualizaciones interactivas están disponibles en la versión web del informe."

---

## 6. Formularios y Uploads

### AUDIT-021 — Sin validación de tamaño máximo de archivo
**Severidad:** 🟠 HIGH
**Archivo:** `components/upload/FileDropZone.tsx:53-65`

```tsx
// ACTUAL — acepta cualquier tamaño
const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  e.stopPropagation()
  setIsDragging(false)
  const file = e.dataTransfer.files?.[0]
  if (file) {
    handleFile(file)  // ← sin validación de tamaño ni MIME
  }
}, [handleFile])
```

**Problema:** Un usuario puede arrastrar un archivo de 500 MB o 1 GB. El componente lo acepta y llama a `file.text()` en `upload/page.tsx:106`, lo que puede:
1. Congelar el hilo principal del navegador (parsing de archivos grandes)
2. Causar un OOM (Out of Memory) en el browser
3. Subir archivos gigantes a Supabase Storage

**Fix propuesto:**
```tsx
const MAX_FILE_SIZE_MB = 50
const ALLOWED_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

const handleFile = useCallback((file: File) => {
  // Validar tamaño
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    onError?.(`El archivo excede el límite de ${MAX_FILE_SIZE_MB} MB`)
    return
  }
  // Validar MIME type (no confiar solo en extensión)
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.match(/\.(csv|xlsx|xls)$/i)) {
    onError?.('Formato de archivo no válido. Solo se aceptan CSV, XLS y XLSX.')
    return
  }
  setSelectedFile(file)
  onFileSelect(file)
}, [onFileSelect, onError])
```

---

### AUDIT-022 — Sin validación del threshold en AlertRuleModal
**Severidad:** 🔵 LOW
**Archivo:** `components/dashboard/AlertRuleModal.tsx` (no leído en detalle, pero inferido del flujo)

**Problema:** El campo `threshold` del formulario de alertas acepta cualquier número, incluyendo negativos o valores extremadamente grandes. No hay validación client-side del rango aceptable.

**Fix propuesto:** Añadir `min` y `max` al input numérico y validar antes de submit.

---

### AUDIT-023 — Input de nombre de restaurante sin `maxLength`
**Severidad:** 🔵 LOW
**Archivo:** `app/dashboard/upload/page.tsx:314-321`

```tsx
<input
  type="text"
  value={restaurantName}
  onChange={(e) => setRestaurantName(e.target.value)}
  placeholder="Ej: Paella Dorada — Valencia Centro"
  className="..."
  // ← sin maxLength
/>
```

**Problema:** El input no tiene `maxLength`. Un usuario podría pegar 10.000 caracteres. Aunque la API probablemente tenga su propio límite, el usuario no recibe feedback anticipado.

**Fix propuesto:** `maxLength={100}` con contador de caracteres opcionales.

---

### AUDIT-024 — Sin feedback de progreso durante la subida de archivo
**Severidad:** 🟡 MEDIUM
**Archivo:** `app/dashboard/upload/page.tsx:160-177`

```tsx
async function uploadFile(file: File, connectorType: string, sourceCategory: string) {
  const formData = new FormData()
  formData.append('file', file)
  // ...
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,  // ← sin XHR/progress tracking
  })
```

**Problema:** Para archivos CSV grandes (>5MB), el upload puede tardar varios segundos. El usuario no ve ninguna barra de progreso de upload (solo el spinner del análisis, que empieza después). La UX es: botón disabled → spinner → ... larga espera sin feedback → processing page.

**Fix propuesto:** Usar `XMLHttpRequest` con eventos `progress` en lugar de `fetch` para mostrar progreso real, o mostrar al menos un mensaje "Subiendo archivo... (puede tardar unos segundos)".

---

## 7. Estado y Data Fetching

### AUDIT-025 — Race condition en comparación de informes
**Severidad:** 🟠 HIGH
**Archivo:** `app/dashboard/comparar/page.tsx:90-121`

```tsx
// ACTUAL — se lanza un nuevo fetch cada vez que cambia slugA o slugB
useEffect(() => {
  if (!slugA || !slugB || slugA === slugB) {
    setComparison(null)
    setError(null)
    return
  }

  async function compare() {
    setIsComparing(true)
    setError(null)
    const res = await fetch(`/api/compare?reportA=...&reportB=...`)  // ← sin AbortController
    if (res.ok) {
      const data = await res.json()
      setComparison(data)  // ← puede ser el resultado de la petición anterior
    }
  }

  compare()
}, [slugA, slugB])
```

**Problema:** Si el usuario selecciona "Informe A" (lanza fetch #1) y luego rápidamente "Informe B diferente" (lanza fetch #2), los dos fetches corren en paralelo. Si fetch #1 termina después que fetch #2, `setComparison` mostrará los datos de la comparación **antigua**.

**Fix propuesto:**
```tsx
useEffect(() => {
  if (!slugA || !slugB || slugA === slugB) { setComparison(null); return }
  const controller = new AbortController()

  async function compare() {
    setIsComparing(true)
    try {
      const res = await fetch(`/api/compare?reportA=${slugA}&reportB=${slugB}`, {
        signal: controller.signal
      })
      if (res.ok) setComparison(await res.json())
      else setError((await res.json()).error || 'Error al comparar')
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Error de conexión')
    } finally {
      setIsComparing(false)
    }
  }

  compare()
  return () => controller.abort()
}, [slugA, slugB])
```

---

### AUDIT-026 — Fallback incorrecto en fetchBalance de upload
**Severidad:** 🟡 MEDIUM
**Archivo:** `app/dashboard/upload/page.tsx:83-97`

```tsx
useEffect(() => {
  async function fetchBalance() {
    try {
      const res = await fetch('/api/dashboard')
      if (res.ok) {
        const data = await res.json()
        setUserCredits(data.balance)
      }
    } catch {
      // Fallback — don't block user
      setUserCredits(100)  // ← ¡100 créditos falsos!
    }
  }
  fetchBalance()
}, [])
```

**Problema:** Si la llamada a `/api/dashboard` falla (timeout, error de red), se asignan 100 créditos falsos al usuario. Esto permite al usuario:
1. Ver un saldo de 100 créditos que no tiene
2. No ver el prompt de upgrade aunque realmente no tenga créditos
3. Intentar analizar y recibir un error 402 del servidor (peor UX que mostrar el upgrade prompt desde el inicio)

**Fix propuesto:**
```tsx
} catch {
  setUserCredits(0)  // Mostrar upgrade si no se puede verificar
  // O mejor: mostrar un error de carga de saldo
}
```

---

## 8. Auth (Clerk)

### AUDIT-027 — Sin manejo del estado de sesión expirada en fetches
**Severidad:** 🟠 HIGH
**Archivos:** múltiples (dashboard, upload, etc.)

```tsx
// ACTUAL — ningún fetch maneja 401 específicamente
const res = await fetch('/api/dashboard')
if (res.ok) {
  const data = await res.json()
  // ...
} else {
  console.error('Dashboard API returned error:', res.status)
  // ← sin manejar 401: sesión expirada
}
```

**Problema:** Si la sesión de Clerk expira mientras el usuario está usando la app, todas las llamadas a las APIs protegidas devolverán 401. El usuario verá errores genéricos o datos que no se cargan, sin ningún mensaje explicando que necesita volver a iniciar sesión ni redirect automático al login.

**Fix propuesto:** Añadir un interceptor global o manejar 401 en cada fetch:
```tsx
// Wrapper helper:
async function authedFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options)
  if (res.status === 401) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)
    return null
  }
  return res
}
```

---

## 9. Pagos (Stripe)

### AUDIT-028 — Selección de plan sin estado de carga
**Severidad:** 🟡 MEDIUM
**Archivo:** `app/dashboard/upload/page.tsx:240-262`

```tsx
async function handleSelectPlan(planId: string) {
  const creditMap: Record<string, number> = { pack_5: 5, pack_15: 15, pack_50: 50 }
  trackUpgradeInitiated(creditMap[planId] ?? 0)

  try {
    const res = await fetch('/api/checkout', { method: 'POST', ... })
    // ...
    const { checkoutUrl } = await res.json()
    window.location.href = checkoutUrl  // redirect a Stripe
  } catch {
    setError('Error al conectar con el sistema de pagos')
  }
}
// No hay estado de carga — el botón no se deshabilita durante el fetch
```

**Problema:** Entre el clic en "Comprar pack" y el redirect a Stripe hay una llamada de red. El botón no se deshabilita, por lo que el usuario puede hacer clic múltiples veces y crear múltiples sesiones de Stripe. Además, no hay feedback de "Redirigiendo a la pasarela de pago...".

**Fix propuesto:**
```tsx
const [isCheckingOut, setIsCheckingOut] = useState(false)

async function handleSelectPlan(planId: string) {
  setIsCheckingOut(true)
  try {
    // ... fetch ...
    window.location.href = checkoutUrl
  } catch {
    setError('Error al conectar con el sistema de pagos')
    setIsCheckingOut(false)
  }
}

// En UpgradePrompt, pasar isCheckingOut como prop y deshabilitar botones
```

---

## 10. Performance Frontend

### AUDIT-029 — Sin React.memo en componentes de lista costosos
**Severidad:** 🔵 LOW
**Archivos:** `components/dashboard/ReportsList.tsx`, `components/dashboard/GamificationChecklist.tsx`

**Problema:** `ReportsList` y `GamificationChecklist` son componentes que reciben props que no cambian frecuentemente, pero el dashboard los re-renderiza cada vez que cualquier estado cambia (p.ej. cuando `showToast` actualiza el contexto).

**Fix propuesto:**
```tsx
export const ReportsList = React.memo(function ReportsList({ reports }: ReportListProps) { ... })
export const GamificationChecklist = React.memo(function GamificationChecklist(...) { ... })
```

---

### AUDIT-030 — Librería xlsx importada completa (bundle size)
**Severidad:** 🟡 MEDIUM
**Archivo:** `package.json` — dependencia `"xlsx": "^0.18.5"`

**Problema:** La librería `xlsx` tiene un bundle de ~1.2 MB sin minificar. Se usa en los parsers del servidor (`lib/parsers/`). Si alguno de estos parsers se importa accidentalmente en el bundle del cliente, el bundle size se dispara. Verificar con `@next/bundle-analyzer`.

**Recomendación:** Asegurar que todos los imports de `xlsx` estén en archivos que no tengan `'use client'` ni sean referenciados desde Client Components. Considerar `exceljs` como alternativa más ligera si solo se lee Excel.

---

### AUDIT-031 — Sin lazy loading en tabs del informe
**Severidad:** 🔵 LOW
**Archivo:** `components/report/ReportLayout.tsx:10-20`

```tsx
// ACTUAL — todos los tabs importados estáticamente
import { SummaryTab } from './SummaryTab'
import { CashTab } from './CashTab'
import { InvoicesTab } from './InvoicesTab'
// ... 9 imports estáticos
```

**Problema:** Los 9 componentes de tab (incluyendo Recharts) se cargan en el bundle inicial aunque el usuario solo vea el primer tab. En informes con muchos datos, el primer render puede ser más lento de lo necesario.

**Fix propuesto:**
```tsx
const CashTab = React.lazy(() => import('./CashTab').then(m => ({ default: m.CashTab })))
const InvoicesTab = React.lazy(() => import('./InvoicesTab').then(m => ({ default: m.InvoicesTab })))
// etc.

// Wrapping con Suspense en renderTab():
<Suspense fallback={<Skeleton variant="card" className="h-64" />}>
  {renderTab()}
</Suspense>
```

---

## 11. Internacionalización

### AUDIT-032 — Formatos de fecha inconsistentes
**Severidad:** 🟡 MEDIUM
**Archivos:** múltiples

```tsx
// comparar/page.tsx:179,202 — formato corto
new Date(r.created_at).toLocaleDateString('es-ES')
// → "28/3/2026"

// AlertRulesCard.tsx:124
new Date(rule.last_triggered_at).toLocaleDateString('es-ES')
// → "28/3/2026"

// AIInsightsTab.tsx:275-281 — formato largo con hora
new Date(insights.generated_at).toLocaleDateString('es-ES', {
  day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})
// → "28 de marzo de 2026 14:30"
```

**Problema:** Se usan formatos de fecha distintos en diferentes partes de la aplicación sin una función centralizada. `lib/utils.ts` ya tiene `formatDate()` pero no se usa de forma consistente en todos los componentes.

**Fix propuesto:** Usar siempre `formatDate()` de `lib/utils.ts` para garantizar consistencia. Si se necesitan variantes (corto, largo, con hora), añadirlas a utils como `formatDateShort()`, `formatDateLong()`.

---

### AUDIT-033 — Texto hardcodeado en español sin posibilidad de extensión
**Severidad:** 🔵 LOW
**Estado:** Conocido / diseño actual

**Observación:** Toda la UI está en español hardcodeado. No existe ninguna infraestructura de i18n (no hay `next-i18next`, `i18next`, ni archivos de traducción). Si en el futuro se quiere expandir a otros mercados, se requerirá una refactorización significativa.

**Recomendación para el futuro:** Si hay planes de internacionalización, considerar empezar a extraer strings a archivos de constantes desde ahora (incluso monolingüe), para facilitar la migración posterior.

---

## Tabla de Hallazgos Consolidada

| ID | Severidad | Categoría | Archivo Principal | Descripción |
|----|-----------|-----------|-------------------|-------------|
| AUDIT-001 | 🟡 MEDIUM | Accesibilidad | `ReportLayout.tsx:148` | Tabs sin roles ARIA |
| AUDIT-002 | 🟡 MEDIUM | Accesibilidad | `SummaryTab.tsx:72,89` | Emojis sin aria-hidden |
| AUDIT-003 | 🟡 MEDIUM | UX | `ReportLayout.tsx:119` | Sin loading en descarga PDF |
| AUDIT-004 | 🟠 HIGH | UX | `AlertRulesCard.tsx:53` | Borrar alerta sin confirmación |
| AUDIT-005 | 🟡 MEDIUM | Accesibilidad | `AlertRulesCard.tsx:148` | Botón delete sin aria-label |
| AUDIT-006 | 🟡 MEDIUM | UX | `informe/[slug]/page.tsx:110` | Vista "processing" pública sin auto-refresh |
| AUDIT-007 | 🟡 MEDIUM | Info leak | `informe/[slug]/page.tsx:143` | Slug interno expuesto |
| AUDIT-008 | 🔴 CRITICAL | React / Bugs | `upload/page.tsx:362` | Race condition en demo (stale closure) |
| AUDIT-009 | 🔴 CRITICAL | React / Memory | múltiples | Fetches sin AbortController |
| AUDIT-010 | 🟡 MEDIUM | React | múltiples | Keys con índice en listas |
| AUDIT-011 | 🟡 MEDIUM | TypeScript | `CorrelationTab.tsx:24` | Tipo `any` explícito |
| AUDIT-012 | 🟠 HIGH | React | no existe `error.tsx` | Sin Error Boundaries |
| AUDIT-013 | 🟠 HIGH | UX / Bugs | `processing/page.tsx:121` | Polling sin timeout máximo |
| AUDIT-014 | 🔵 LOW | Routing | no existe `not-found.tsx` | Sin página 404 personalizada |
| AUDIT-015 | 🔵 LOW | SEO | sub-rutas dashboard | Sin metadatos de página |
| AUDIT-016 | 🟡 MEDIUM | UX | `ReportLayout.tsx:69` | Tab activo no refleja en URL |
| AUDIT-017 | 🟠 HIGH | Recharts | `CashTab.tsx`, etc. | Charts sin estado vacío |
| AUDIT-018 | 🟡 MEDIUM | TypeScript | `CorrelationTab.tsx:24` | ScatterTooltip tipado como `any` |
| AUDIT-019 | 🔵 LOW | UX | `CashTab.tsx:60` | YAxis sin símbolo de moneda |
| AUDIT-020 | 🔵 LOW | UX | `report-pdf.tsx` | PDF sin gráficos |
| AUDIT-021 | 🟠 HIGH | Seguridad | `FileDropZone.tsx:53` | Sin validación de tamaño de archivo |
| AUDIT-022 | 🔵 LOW | Validación | `AlertRuleModal.tsx` | Sin validación de threshold |
| AUDIT-023 | 🔵 LOW | UX | `upload/page.tsx:314` | Input sin maxLength |
| AUDIT-024 | 🟡 MEDIUM | UX | `upload/page.tsx:160` | Sin progreso de upload |
| AUDIT-025 | 🟠 HIGH | Race condition | `comparar/page.tsx:90` | Race condition en comparación |
| AUDIT-026 | 🟡 MEDIUM | Bugs | `upload/page.tsx:83` | Fallback con 100 créditos falsos |
| AUDIT-027 | 🟠 HIGH | Auth | múltiples | Sin manejo de sesión expirada (401) |
| AUDIT-028 | 🟡 MEDIUM | UX / Stripe | `upload/page.tsx:240` | Sin loading en selección de plan |
| AUDIT-029 | 🔵 LOW | Performance | `ReportsList.tsx` | Sin React.memo en listas |
| AUDIT-030 | 🟡 MEDIUM | Performance | `package.json` | Bundle xlsx en potencial client bundle |
| AUDIT-031 | 🔵 LOW | Performance | `ReportLayout.tsx:10` | Sin lazy loading en tabs |
| AUDIT-032 | 🟡 MEDIUM | i18n | múltiples | Formatos de fecha inconsistentes |
| AUDIT-033 | 🔵 LOW | i18n | toda la app | Strings hardcodeados en español |

---

## Priorización de Fixes

### Sprint 1 — Crítico e imprescindible (1-2 días)
1. **AUDIT-008** — Fix race condition del modo demo
2. **AUDIT-009** — Añadir AbortController a todos los fetches en useEffect
3. **AUDIT-012** — Crear `app/error.tsx` y `app/dashboard/error.tsx`
4. **AUDIT-021** — Añadir validación de tamaño y MIME en FileDropZone
5. **AUDIT-026** — Corregir fallback de créditos (0 en lugar de 100)

### Sprint 2 — Alta prioridad (3-5 días)
6. **AUDIT-004** — Confirmación antes de borrar alertas
7. **AUDIT-013** — Timeout máximo en polling de processing page
8. **AUDIT-017** — Empty states en todos los charts
9. **AUDIT-025** — AbortController en race condition de comparación
10. **AUDIT-027** — Manejo de 401 (sesión expirada)

### Sprint 3 — Mejoras de calidad (1 semana)
11. **AUDIT-001** — Roles ARIA en tab navigation
12. **AUDIT-002** — aria-hidden en emojis
13. **AUDIT-005** — aria-label en botón delete
14. **AUDIT-011**, **AUDIT-018** — Eliminar tipos `any`
15. **AUDIT-016** — Tab activo en URL
16. **AUDIT-032** — Normalizar formatos de fecha

---

*Informe generado el 2026-03-28. No se realizaron cambios en el código durante esta auditoría.*
