# Fix 5 Critical QA Issues — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corregir los 4 issues CRITICAL y 1 HIGH prioritario identificados en el QA Frontend Report del 2026-03-28, sin introducir regresiones.

**Architecture:** Cada fix es independiente y atómico — no hay dependencias entre tareas. Todos los cambios son en archivos ya existentes. No se crean nuevas rutas ni tablas.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React 18, Clerk, Supabase, Inngest

---

## Contexto de los 5 Issues

| ID | Archivo principal | Descripción corta |
|----|-------------------|-------------------|
| C-01 | `app/api/analyze/route.ts` | Demo mode bypasses credit deduction sin límite |
| C-02 | `app/dashboard/upload/page.tsx` | Error de red → fallback engañoso a 100 créditos |
| C-03 | `app/dashboard/processing/[reportId]/page.tsx` | Race condition: `clearInterval(undefined)` → polling zombie |
| C-04 | `components/report/AIInsightsTab.tsx` | `status='unavailable'` no detiene el useEffect → polling infinito |
| H-04 | `app/api/reports/[reportId]/ai-insights/route.ts` | Timeout calcula desde `created_at` en vez de `updated_at` |

---

## Task 1: C-03 — Corregir race condition en processing page

> Empezamos por este porque es el más mecánico y fácil de verificar visualmente.

**Files:**
- Modify: `app/dashboard/processing/[reportId]/page.tsx:168-178`

### Contexto del bug

```ts
// CÓDIGO ACTUAL (buggy)
const timeoutId = setTimeout(() => {
  pollStatus()                               // (1) async — puede completar antes de (2)
  intervalId = setInterval(pollStatus, 3000) // (2) si (1) ya completó, este intervalo nunca se limpia
}, 1500)
```

Si el informe ya estaba `completed` en DB cuando el usuario llega a esta página, `pollStatus()` resuelve, llama `clearInterval(intervalId)` con `intervalId = undefined`, y luego se asigna el intervalo real que **nunca se limpia**.

### Step 1: Abrir el archivo

```
app/dashboard/processing/[reportId]/page.tsx
```

Localizar el `useEffect` que comienza en la línea ~121. El bloque a modificar es el `setTimeout` al final del efecto (líneas ~168-178).

### Step 2: Aplicar el fix

Cambiar el orden: asignar `intervalId` **antes** de llamar `pollStatus()`.

```ts
// REEMPLAZAR esto:
const timeoutId = setTimeout(() => {
  pollStatus()
  intervalId = setInterval(pollStatus, 3000)
}, 1500)

// POR esto:
const timeoutId = setTimeout(() => {
  intervalId = setInterval(pollStatus, 3000) // asignar PRIMERO
  pollStatus()                                // luego ejecutar (ya tiene ref al interval)
}, 1500)
```

El cambio es mover una sola línea. El `clearInterval(intervalId)` dentro de `pollStatus` ahora siempre tiene una referencia válida.

### Step 3: Verificar manualmente

1. Abrir la app en desarrollo (`npm run dev`)
2. Tener un informe ya completado en DB
3. Navegar directamente a `/dashboard/processing/{reportId}` de ese informe
4. Abrir DevTools → Network → filtrar por `/api/reports`
5. Verificar que la página muestra "Informe generado con éxito" y **deja de hacer requests** tras el primer poll exitoso

### Step 4: Commit

```bash
git add app/dashboard/processing/[reportId]/page.tsx
git commit -m "fix: resolve interval race condition in processing page polling

assignIntervalId before calling pollStatus() to ensure clearInterval
always has a valid reference, preventing zombie polling after completion"
```

---

## Task 2: C-04 — Corregir polling infinito en AIInsightsTab

**Files:**
- Modify: `components/report/AIInsightsTab.tsx:167-168`

### Contexto del bug

```ts
// CÓDIGO ACTUAL (buggy)
useEffect(() => {
  if (initialData || !reportId || status === 'ready') return
  // ↑ 'unavailable' NO está aquí

  const interval = setInterval(async () => {
    // ...cuando llega status 'unavailable':
    setStatus('unavailable')   // (1) dispara re-render
    clearInterval(interval)    // (2) limpia este interval
    // React re-ejecuta el effect porque status cambió
    // El effect no hace early-return para 'unavailable'
    // → se crea OTRO interval infinito
  }, 3000)

  return () => clearInterval(interval)
}, [initialData, reportId, status])
```

### Step 1: Aplicar el fix — una sola línea

```ts
// REEMPLAZAR:
if (initialData || !reportId || status === 'ready') return

// POR:
if (initialData || !reportId || status === 'ready' || status === 'unavailable') return
```

Localizar en `components/report/AIInsightsTab.tsx` línea ~168.

### Step 2: Verificar que el fix es completo

Revisar que los únicos lugares donde se llama `setStatus` dentro del efecto son:
- `setStatus('ready')` — ya estaba en la condición de early-return ✓
- `setStatus('unavailable')` — ahora también cubierto ✓

El `pollCount.current >= maxPolls` también llama `setStatus('unavailable')`, queda igualmente protegido.

### Step 3: Verificar manualmente

1. Abrir un informe cuyo `ai_insights` sea `null` y `status = 'completed'` con más de 1 minuto de antigüedad (la API devolverá `'unavailable'`)
2. Ir al tab "IA Insights"
3. Abrir DevTools → Network → filtrar por `/api/reports`
4. Verificar que los requests a `ai-insights` se detienen después del primer poll que devuelve `'unavailable'`
5. Confirmar que se muestra el estado "Los insights de IA no están disponibles" con el botón de reintentar

### Step 4: Commit

```bash
git add components/report/AIInsightsTab.tsx
git commit -m "fix: stop infinite polling in AIInsightsTab when status is unavailable

add 'unavailable' to useEffect early-return condition to prevent
React from creating a new poll interval on each status state change"
```

---

## Task 3: C-02 — Corregir fallback engañoso a 100 créditos

**Files:**
- Modify: `app/dashboard/upload/page.tsx:83-96` (fetch balance)
- Modify: `app/dashboard/upload/page.tsx:180-186` (canAnalyze guard)
- Modify: `app/dashboard/upload/page.tsx:347-350` (render VolumePreview)

### Contexto del bug

```ts
// CÓDIGO ACTUAL (buggy)
} catch {
  setUserCredits(100)  // Si la red falla, el usuario "ve" 100 créditos que no tiene
}
```

### Step 1: Corregir el catch del fetch de balance

```ts
// REEMPLAZAR:
} catch {
  // Fallback — don't block user
  setUserCredits(100)
}

// POR:
} catch {
  // Balance unknown — don't show misleading value
  // canAnalyze will stay blocked until balance loads or user retries
  setUserCredits(null)
}
```

### Step 2: Añadir guard explícito en `canAnalyze`

El `canAnalyze` ya tiene `userCredits !== null` como condición, pero necesitamos también bloquear con balance 0:

```ts
// REEMPLAZAR:
const canAnalyze =
  posConnector !== '' &&
  posFile !== null &&
  posVolume !== null &&
  !showUpgrade &&
  !isAnalyzing &&
  userCredits !== null

// POR:
const canAnalyze =
  posConnector !== '' &&
  posFile !== null &&
  posVolume !== null &&
  !showUpgrade &&
  !isAnalyzing &&
  userCredits !== null &&
  userCredits > 0
```

> Nota: `showUpgrade` se activa cuando `creditsRequired > credits`, pero si `credits === 0` y `creditsRequired === 0` (datos vacíos), `showUpgrade` sería `false`. El guard `userCredits > 0` cubre este edge case.

### Step 3: Añadir mensaje de error cuando balance es null tras carga

Localizar el bloque donde se renderiza el error (línea ~438) y añadir antes del error principal:

```tsx
{/* Error de carga de balance */}
{userCredits === null && !isLoading && (
  <Alert
    variant="warning"
    title="No pudimos verificar tu saldo"
    description="Recarga la página para intentarlo de nuevo. El análisis no está disponible hasta confirmar tus créditos."
  />
)}
```

Añadir esta alerta antes del bloque `{/* --- Error alert --- */}` existente.

### Step 4: Mostrar skeleton en VolumePreview mientras balance carga

```tsx
// REEMPLAZAR:
{posVolume && userCredits !== null && (
  <VolumePreview volumeInfo={posVolume} userCredits={userCredits} />
)}

// POR:
{posVolume && userCredits === null && (
  <Skeleton variant="card" className="h-32" />
)}
{posVolume && userCredits !== null && (
  <VolumePreview volumeInfo={posVolume} userCredits={userCredits} />
)}
```

Asegurarse de que `Skeleton` está importado (ya está en el proyecto: `import { Skeleton } from '@/components/ui/skeleton'`).

### Step 5: Verificar manualmente

1. En DevTools → Network → click derecho en `/api/dashboard` → "Block request URL"
2. Recargar la página `/dashboard/upload`
3. Verificar que aparece la alerta de "No pudimos verificar tu saldo"
4. Subir un archivo CSV → verificar que el botón "Analizar" queda deshabilitado
5. Desbloquear la URL en Network, recargar → verificar comportamiento normal

### Step 6: Commit

```bash
git add app/dashboard/upload/page.tsx
git commit -m "fix: remove misleading 100-credit fallback on network error

when balance fetch fails, keep userCredits as null and show warning
alert instead of silently assigning a fake balance that would cause
confusing 402 errors when user tries to analyze"
```

---

## Task 4: H-04 — Corregir timeout de AI Insights basado en `created_at`

**Files:**
- Modify: `app/api/reports/[reportId]/ai-insights/route.ts:34-64`

### Contexto del bug

```ts
// CÓDIGO ACTUAL (buggy)
const { data: report } = await supabase
  .from('reports')
  .select('id, status, ai_insights, created_at')  // ← usa created_at
  ...

const createdAt = new Date(report.created_at).getTime()
const elapsed = Date.now() - createdAt
const TIMEOUT_MS = 60_000 // 1 minuto desde CREACIÓN
```

Si el análisis tarda 3 minutos, cuando completa y el usuario abre el tab de IA, `elapsed` ya es >60s y la API devuelve `'unavailable'` sin haber esperado al step de Inngest.

### Step 1: Cambiar la query para incluir `updated_at`

```ts
// REEMPLAZAR:
const { data: report } = await supabase
  .from('reports')
  .select('id, status, ai_insights, created_at')
  .eq('id', reportId)
  .eq('user_id', user.id)
  .single()

// POR:
const { data: report } = await supabase
  .from('reports')
  .select('id, status, ai_insights, updated_at')
  .eq('id', reportId)
  .eq('user_id', user.id)
  .single()
```

### Step 2: Actualizar la lógica del timeout

```ts
// REEMPLAZAR:
// Report is completed but no insights — check how long ago
const createdAt = new Date(report.created_at).getTime()
const elapsed = Date.now() - createdAt
const TIMEOUT_MS = 60_000 // 1 minute grace period

if (elapsed < TIMEOUT_MS) {
  // Still within grace period — Inngest step may finish soon
  return NextResponse.json({ status: 'generating', data: null })
}

// Past grace period with no insights → generation failed
return NextResponse.json({ status: 'unavailable', data: null })

// POR:
// Report is completed but no insights — use updated_at as reference
// (updated_at reflects when the report completed, not when it was created)
const referenceTime = new Date(report.updated_at).getTime()
const elapsed = Date.now() - referenceTime
const TIMEOUT_MS = 3 * 60_000 // 3 minutes grace period after completion

if (elapsed < TIMEOUT_MS) {
  // Still within grace period after completion — Inngest AI step may finish soon
  return NextResponse.json({ status: 'generating', data: null })
}

// Past grace period with no insights → generation failed
return NextResponse.json({ status: 'unavailable', data: null })
```

> **Por qué 3 minutos:** El step de AI en Inngest se ejecuta después del análisis principal. En casos de alta carga, puede tardarse 2-3 minutos adicionales. 3 minutos desde `updated_at` (momento de completion) es más que suficiente.

### Step 3: Verificar que `updated_at` existe en la tabla

Confirmar en Supabase que la tabla `reports` tiene columna `updated_at`. Si no existe:

```sql
-- Ejecutar en Supabase SQL Editor si la columna no existe:
ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

> En la mayoría de proyectos Supabase con migraciones, `updated_at` ya existe. Verificar primero antes de ejecutar el SQL.

### Step 4: Verificar manualmente

1. Crear un informe nuevo (el Inngest step de AI insights tardará en completar)
2. Una vez que el informe esté `completed`, ir al tab "IA Insights" inmediatamente
3. Verificar que muestra el spinner de "generando" (no "unavailable") durante los primeros 3 minutos
4. Esperar a que los insights aparezcan, o pasados 3 minutos ver el estado "unavailable"

### Step 5: Commit

```bash
git add app/api/reports/[reportId]/ai-insights/route.ts
git commit -m "fix: base AI insights timeout on updated_at instead of created_at

use updated_at (report completion time) as reference for the grace
period, and extend timeout to 3 minutes. this prevents premature
'unavailable' status for reports that take >1min to process"
```

---

## Task 5: C-01 — Añadir límite de 1 análisis demo por usuario

**Files:**
- Modify: `app/api/analyze/route.ts:54-63`

### Contexto del bug

```ts
// CÓDIGO ACTUAL (buggy)
if (!isDemo) {
  const deducted = await deductCredit(user.id, 'analysis', undefined)
  if (!deducted) { return ... 402 }
}
// isDemo viene del cliente sin validación server-side
// → bypass total del sistema de créditos
```

### Step 1: Añadir query para contar análisis demo previos

```ts
// REEMPLAZAR el bloque completo:
// Deduct credit for the analysis (skip for demo mode)
if (!isDemo) {
  const deducted = await deductCredit(user.id, 'analysis', undefined)
  if (!deducted) {
    return NextResponse.json(
      { error: 'Insufficient credits' },
      { status: 402 }
    );
  }
}

// POR:
// Deduct credit for the analysis
if (isDemo) {
  // Demo mode: allow max 1 demo analysis per user (server-enforced)
  const { count } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_demo', true)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Demo analysis already used. Purchase credits to continue.' },
      { status: 402 }
    )
  }
} else {
  const deducted = await deductCredit(user.id, 'analysis', undefined)
  if (!deducted) {
    return NextResponse.json(
      { error: 'Insufficient credits' },
      { status: 402 }
    )
  }
}
```

### Step 2: Asegurarse de que `is_demo` se guarda en el `reportInsert`

Buscar el objeto `reportInsert` más abajo en el mismo archivo (~línea 69):

```ts
// Verificar que ya tiene is_demo — si no, añadirlo:
const reportInsert: Record<string, unknown> = {
  slug,
  user_id: user.id,
  pos_upload_id: posUploadId,
  inventory_upload_id: inventoryUploadId ?? null,
  status: 'processing',
  pos_connector: posConnector,
  inventory_connector: inventoryConnector ?? null,
  is_demo: isDemo ?? false,  // ← añadir si no existe
}
```

### Step 3: Verificar que la columna `is_demo` existe en la tabla `reports`

Buscar en `supabase/migrations/` si `is_demo` ya está definido. Si no:

```sql
-- Ejecutar en Supabase SQL Editor:
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
```

### Step 4: Manejar el error 402 de demo agotado en el frontend

En `app/dashboard/upload/page.tsx`, el bloque de catch de `handleAnalyze` ya maneja el 402:

```ts
// Línea ~222-224 — ya existe este handler, solo verificar que el mensaje es claro:
if (analyzeRes.status === 402) {
  throw new Error('Créditos insuficientes. Adquiere más ejecuciones para continuar.')
}
```

El mensaje es adecuado también para el caso de demo agotado. No requiere cambio.

### Step 5: Verificar manualmente

1. Iniciar sesión con un usuario nuevo (o limpiar `reports` con `is_demo=true` para el usuario actual)
2. Usar el botón "Probar con datos de ejemplo" → debería funcionar normalmente
3. Intentar usar el botón de demo una segunda vez
4. Verificar que el servidor devuelve 402 y el frontend muestra "Créditos insuficientes"
5. Verificar en Supabase que hay exactamente 1 fila en `reports` con `is_demo=true` para ese usuario

### Step 6: Commit

```bash
git add app/api/analyze/route.ts
git commit -m "fix: enforce 1 demo analysis limit per user server-side

validate isDemo server-side by counting existing demo reports
for the user, preventing unlimited credit bypass via client body"
```

---

## Orden de ejecución recomendado

Los tasks son independientes. El orden propuesto minimiza el riesgo:

```
Task 1 (C-03) → Task 2 (C-04) → Task 3 (C-02) → Task 4 (H-04) → Task 5 (C-01)
  ~5 min          ~5 min          ~15 min          ~10 min          ~15 min
```

- Tasks 1 y 2 son cambios de 1 línea cada uno — empezar por ellos para ganar confianza
- Task 3 tiene 3 puntos de modificación en el mismo archivo
- Task 4 puede requerir verificar la migración de DB
- Task 5 es el más delicado porque toca lógica de negocio y puede necesitar migración

**Tiempo total estimado: ~50 minutos**

---

## Verificación final

Tras completar los 5 tasks, hacer un smoke test del flujo completo:

1. Demo flow: usar "Probar con datos de ejemplo" → verificar que funciona → intentar segunda vez → verificar que bloquea
2. Upload flow con red lenta (throttle en DevTools): subir archivo con 3G → verificar que no aparecen 100 créditos falsos
3. Processing page: abrir con informe ya completado → verificar que no hay polling zombie en Network
4. AI Insights tab: abrir en informe con insights null → verificar que polling se detiene al llegar a unavailable
5. AI Insights timeout: confirmar que `updated_at` se usa como referencia en los logs del servidor

```bash
# Pull request final
git push origin claude/nostalgic-khorana
gh pr create --title "fix: resolve 5 critical QA issues (demo bypass, credit fallback, polling zombies, AI timeout)" \
  --body "Fixes C-01, C-02, C-03, C-04, H-04 from QA_FRONTEND_REPORT.md"
```
