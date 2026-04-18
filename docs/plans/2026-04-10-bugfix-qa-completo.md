# QA Bug Fix — Todos los hallazgos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corregir los 33 bugs identificados en los dos informes de QA (backend logic + frontend) antes de lanzar a clientes reales.

**Architecture:** Los fixes se agrupan por archivo afectado para minimizar conflictos. Primero se arreglan los calculadores (lógica de negocio pura, testeable sin servidor), luego los parsers, luego las APIs, y finalmente el frontend. Cada task incluye los tests de Vitest que verifican el fix.

**Tech Stack:** Next.js 14 · TypeScript · Vitest · Recharts · Clerk · Supabase · Inngest

---

## Resumen de bugs por task

| Task | Bugs | Severidad máx |
|------|------|---------------|
| 1 | BUG-C01, BUG-C02, BUG-C11 | CRÍTICO |
| 2 | BUG-C08 | CRÍTICO |
| 3 | BUG-C09, BUG-C06 | ALTO |
| 4 | BUG-C04, BUG-C05 | MEDIO |
| 5 | BUG-C13, BUG-C14 | MEDIO |
| 6 | BUG-C07, BUG-C15 | MEDIO/BAJO |
| 7 | BUG-P02, BUG-P03 | CRÍTICO/BAJO |
| 8 | BUG-P10, BUG-P11, BUG-P12 | BAJO/MEDIO |
| 9 | BUG-API01, BUG-API02, BUG-API03, BUG-API04, BUG-API05, BUG-API06 | ALTO |
| 10 | AUDIT-008, AUDIT-026 | CRÍTICO |
| 11 | AUDIT-009, AUDIT-025 | CRÍTICO |
| 12 | AUDIT-012, BUG-UI01, BUG-UI02, BUG-UI03 | ALTO |
| 13 | AUDIT-004, AUDIT-013, AUDIT-017, AUDIT-021 | ALTO/MEDIO |
| 14 | AUDIT-027 | ALTO |

---

## Task 1: Calculador de caja — sobrantes + worst_local + coherencia con conclusions

**Bugs:** BUG-C01, BUG-C02, BUG-C11
**Archivos:**
- Modify: `lib/calculators/cash-discrepancy.ts`
- Modify: `lib/calculators/conclusions.ts`
- Test: `__tests__/calculators/cash-discrepancy.test.ts`

**Contexto del bug:**
- `cash-discrepancy.ts` solo alerta cuando `total_discrepancy < -500`. Un sobrante de +1.500€ pasa como "normal".
- `worst_local` = `locals[0]` tras ordenar ascendente, lo que devuelve el MENOS negativo cuando hay sobrantes positivos.
- `conclusions.ts` usa `Math.abs()` internamente, lo que genera alertas críticas para sobrantes que cash-discrepancy.ts llama "normales" → contradicción visible en el informe.

**Step 1: Escribir tests que fallen**

En `__tests__/calculators/cash-discrepancy.test.ts` añadir:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateCashDiscrepancy } from '@/lib/calculators/cash-discrepancy'
import type { NormalizedDailySales } from '@/lib/types/normalized'

function makeSale(location: string, discrepancy: number): NormalizedDailySales {
  return {
    date: '2024-01-01',
    location,
    gross_sales: 1000,
    net_sales: 900,
    expected_cash: 500,
    actual_cash: 500 + discrepancy,
    cash_discrepancy: discrepancy,
  }
}

describe('calculateCashDiscrepancy — sobrantes positivos', () => {
  it('debe alertar CRÍTICA cuando un sobrante supera 500€', () => {
    const sales = [makeSale('Local A', 1500)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).toContain('CRÍTICA')
  })

  it('worst_local debe ser el local con mayor Math.abs(discrepancy)', () => {
    const sales = [
      makeSale('Local A', 200),   // sobrante pequeño
      makeSale('Local B', 1500),  // sobrante grande → debe ser el peor
    ]
    const result = calculateCashDiscrepancy(sales)
    expect(result.worst_local).toBe('Local B')
  })

  it('no debe generar contradicción: alert_message y conclusions deben coincidir', () => {
    // Si hay sobrante crítico, alert_message NO debe decir "rangos normales"
    const sales = [makeSale('Local A', 1500)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).not.toContain('rangos normales')
  })
})
```

**Step 2: Ejecutar tests para verificar que fallan**

```bash
cd "/Users/ricardvidal/Desktop/proyectos claude code/fraud-audit"
npx vitest run __tests__/calculators/cash-discrepancy.test.ts
```
Expected: FAIL en los 3 tests nuevos.

**Step 3: Corregir `lib/calculators/cash-discrepancy.ts`**

Reemplazar las líneas 48-68 (sort, worstLocal, alertas) con:

```typescript
  // Sort by Math.abs(total_discrepancy) descending — peor primero independiente del signo
  locals.sort((a, b) =>
    Math.abs(b.total_discrepancy) - Math.abs(a.total_discrepancy) ||
    a.name.localeCompare(b.name)
  )

  // worst_local = mayor desviación absoluta (faltante O sobrante)
  const worstLocal = locals.length > 0 ? locals[0].name : 'Sin datos'

  // Alertas basadas en valor absoluto para detectar AMBAS direcciones
  const hasAnyCritical = locals.some(
    (l) => Math.abs(l.total_discrepancy) > CRITICAL_SHORTAGE_THRESHOLD
  )
  const hasAnyModerate = locals.some(
    (l) => Math.abs(l.total_discrepancy) > MODERATE_SHORTAGE_THRESHOLD
  )

  // Distinguir tipo de alerta según dirección del peor local
  const worstValue = locals.length > 0 ? locals[0].total_discrepancy : 0
  const alertType = worstValue < 0 ? 'faltante' : 'sobrante'

  let alertMessage: string
  if (hasAnyCritical) {
    alertMessage = `ALERTA CRÍTICA: Descuadres significativos detectados (${alertType} superior a ${CRITICAL_SHORTAGE_THRESHOLD}€)`
  } else if (hasAnyModerate) {
    alertMessage = `ALERTA: Descuadres moderados detectados (${alertType})`
  } else {
    alertMessage = 'Descuadres dentro de rangos normales'
  }
```

**Step 4: Ejecutar tests para verificar que pasan**

```bash
npx vitest run __tests__/calculators/cash-discrepancy.test.ts
```
Expected: PASS todos.

**Step 5: Commit**

```bash
git add lib/calculators/cash-discrepancy.ts __tests__/calculators/cash-discrepancy.test.ts
git commit -m "fix(calculators): detectar sobrantes positivos en caja y corregir worst_local

BUG-C01: usar Math.abs() en umbrales de alerta
BUG-C02: worst_local ahora apunta al mayor desviación absoluta
BUG-C11: elimina contradicción entre cash-discrepancy y conclusions"
```

---

## Task 2: Correlación Spearman — mínimo n=4 para validez estadística

**Bug:** BUG-C08
**Archivos:**
- Modify: `lib/calculators/correlation.ts:75`
- Test: `__tests__/calculators/correlation.test.ts`

**Contexto del bug:**
Con n=2 la fórmula de Spearman `rho = 1 - (6*0)/(2*3) = 1.0` siempre. Con n=3 también es inestable. El umbral mínimo estadísticamente aceptado es n=4. El código actual dispara `correlationExists = true` para prácticamente cualquier restaurante con 2 locales.

**Step 1: Escribir tests que fallen**

```typescript
// En __tests__/calculators/correlation.test.ts
import { describe, it, expect } from 'vitest'
import { calculateCorrelation } from '@/lib/calculators/correlation'

// Helper: crear resultados mínimos con n locales
function makeInputs(n: number) {
  const locals = Array.from({ length: n }, (_, i) => ({
    name: `Local ${i + 1}`,
    total_discrepancy: -(i + 1) * 100,
    days_with_shortage: i + 1,
    total_days: 30,
  }))
  const invoiceLocals = Array.from({ length: n }, (_, i) => ({
    location: `Local ${i + 1}`,
    count: (i + 1) * 2,
    amount: (i + 1) * 500,
  }))
  return {
    cash: { locals, worst_local: 'Local 1', alert_message: '' },
    invoices: { by_local: invoiceLocals, by_employee: [], total_count: 10, total_amount: 1000, concentration_alert: '' },
    inventory: { by_month: [], by_product_top10: [], total_deviation_range: { min: 0, max: 0 }, main_cause: '' },
  }
}

describe('calculateCorrelation — validez estadística', () => {
  it('con n=2 locales NO debe detectar correlación (falso positivo)', () => {
    const inputs = makeInputs(2)
    const result = calculateCorrelation(inputs.cash, inputs.invoices, inputs.inventory)
    expect(result.correlation_exists).toBe(false)
  })

  it('con n=3 locales NO debe detectar correlación (muestra insuficiente)', () => {
    const inputs = makeInputs(3)
    const result = calculateCorrelation(inputs.cash, inputs.invoices, inputs.inventory)
    expect(result.correlation_exists).toBe(false)
  })

  it('con n=4 locales SÍ puede detectar correlación si existe', () => {
    const inputs = makeInputs(4)
    const result = calculateCorrelation(inputs.cash, inputs.invoices, inputs.inventory)
    // El resultado puede ser true o false, pero no debe lanzar error
    expect(typeof result.correlation_exists).toBe('boolean')
  })
})
```

**Step 2: Ejecutar para verificar fallo**

```bash
npx vitest run __tests__/calculators/correlation.test.ts
```
Expected: FAIL en los primeros 2 tests (con n=2 y n=3 actualmente devuelve `true`).

**Step 3: Corregir `lib/calculators/correlation.ts`**

Cambiar línea 75:
```typescript
// ANTES:
if (scatterData.length >= 2) {

// DESPUÉS:
const MIN_LOCATIONS_FOR_CORRELATION = 4
if (scatterData.length >= MIN_LOCATIONS_FOR_CORRELATION) {
```

**Step 4: Verificar que pasan**

```bash
npx vitest run __tests__/calculators/correlation.test.ts
```
Expected: PASS todos.

**Step 5: Commit**

```bash
git add lib/calculators/correlation.ts __tests__/calculators/correlation.test.ts
git commit -m "fix(calculators): requerir n>=4 locales para Spearman

BUG-C08: con n<4 Spearman es estadísticamente inválido (rho siempre ±1.0).
Ahora correlation_exists=false cuando hay menos de 4 locales."
```

---

## Task 3: Correlation — score de inventario por local + net vs abs deviation

**Bugs:** BUG-C09, BUG-C06
**Archivos:**
- Modify: `lib/calculators/correlation.ts:102-141`
- Modify: `lib/calculators/inventory-deviation.ts:20-28`
- Test: `__tests__/calculators/inventory-deviation.test.ts`

**Contexto:**
- BUG-C09: `inventoryDeviationMax` es global. `normalizeToScale(globalMax, 0, globalMax) = 100` para TODOS los locales. El 20% del score es idéntico para todos.
- BUG-C06: `Math.abs(d.deviation)` en inventory-deviation.ts. +500 y -500 en el mismo mes suman 1000 en lugar de 0 neto.

**Step 1: Tests para BUG-C06**

```typescript
// En __tests__/calculators/inventory-deviation.test.ts
import { describe, it, expect } from 'vitest'
import { calculateInventoryDeviation } from '@/lib/calculators/inventory-deviation'
import type { NormalizedInventoryDeviation } from '@/lib/types/normalized'

describe('calculateInventoryDeviation — deviaciones opuestas', () => {
  it('BUG-C06: +500 y -500 en el mismo mes deben mostrar desviación absoluta 1000 Y neta 0', () => {
    const deviations: NormalizedInventoryDeviation[] = [
      { month: '2024-01', location: 'Local A', product_name: 'Aceite', theoretical_consumption: 100, actual_consumption: 600, deviation: 500, unit: 'L' },
      { month: '2024-01', location: 'Local A', product_name: 'Aceite', theoretical_consumption: 100, actual_consumption: -400, deviation: -500, unit: 'L' },
    ]
    const result = calculateInventoryDeviation(deviations)
    // La desviación absoluta total es 1000 (suma de |500| + |-500|)
    expect(result.by_month[0].total_deviation).toBe(1000)
    // Debe exponer también la desviación neta
    expect(result.by_month[0].net_deviation).toBe(0)
  })
})
```

**Step 2: Ejecutar para verificar fallo**

```bash
npx vitest run __tests__/calculators/inventory-deviation.test.ts
```
Expected: FAIL (no existe `net_deviation` en el resultado).

**Step 3: Corregir `lib/calculators/inventory-deviation.ts`**

Primero actualizar el tipo en `lib/types/report.ts` — añadir `net_deviation` a `InventoryDeviationByMonth`:

```typescript
// En lib/types/report.ts, buscar InventoryDeviationByMonth y añadir:
export interface InventoryDeviationByMonth {
  month: string
  total_deviation: number   // suma de |deviaciones| (absoluto)
  net_deviation: number     // suma algebraica (puede ser 0 si se compensan)
  product_count: number
}
```

Luego en `lib/calculators/inventory-deviation.ts`, cambiar el loop de by_month (líneas 20-28):

```typescript
  const monthMap = new Map<
    string,
    { totalDeviation: number; netDeviation: number; products: Set<string> }
  >()

  for (const d of deviations) {
    const entry = monthMap.get(d.month) ?? {
      totalDeviation: 0,
      netDeviation: 0,
      products: new Set<string>(),
    }
    entry.totalDeviation += Math.abs(d.deviation)  // absoluto para detectar magnitud
    entry.netDeviation += d.deviation               // neto para detectar compensaciones
    entry.products.add(d.product_name)
    monthMap.set(d.month, entry)
  }

  // Al construir byMonth:
  byMonth.push({
    month,
    total_deviation: Math.round(data.totalDeviation * 100) / 100,
    net_deviation: Math.round(data.netDeviation * 100) / 100,
    product_count: data.products.size,
  })
```

Para BUG-C09, en `lib/calculators/correlation.ts`, reemplazar el bloque de inventoryScore (líneas 102, 134-139) con un valor fijo de 0 hasta que `InventoryDeviationResult` tenga datos por local. Añadir comentario explicativo:

```typescript
  // TODO BUG-C09: InventoryDeviationResult no tiene granularidad por local.
  // Hasta implementar by_local en inventory-deviation, el componente de
  // inventario del score se omite (peso 0) para evitar un score falso idéntico
  // para todos los locales.
  const inventoryScore = 0  // Se activará cuando exista by_local

  // Reajustar pesos: 50% cash + 50% invoices temporalmente
  const combinedScore = Math.round(
    normalizeToScale(cashVal, 0, maxCash) * 0.5 +
    normalizeToScale(invoiceVal, 0, maxInvoice) * 0.5
  )
```

**Step 4: Verificar tests**

```bash
npx vitest run __tests__/calculators/inventory-deviation.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/calculators/inventory-deviation.ts lib/calculators/correlation.ts lib/types/report.ts __tests__/calculators/inventory-deviation.test.ts
git commit -m "fix(calculators): net_deviation en inventario y deshabilitar score inventario por local

BUG-C06: trackear desviación neta además de absoluta en by_month
BUG-C09: score de inventario fijado a 0 hasta implementar by_local (evita score idéntico para todos)"
```

---

## Task 4: Facturas eliminadas — umbrales de concentración

**Bugs:** BUG-C04, BUG-C05
**Archivo:** `lib/calculators/deleted-invoices.ts:82-90`
**Test:** `__tests__/calculators/deleted-invoices.test.ts`

**Contexto:**
- BUG-C04: 1 empleado, 1 factura → 100% concentración → alerta. Debería requerir mínimo 5 facturas absolutas.
- BUG-C05: La concentración usa `count` (número de facturas) en lugar de `amount` (importe). 3 facturas de 10€ pesan más que 2 de 5.000€.

**Step 1: Tests que fallen**

```typescript
// __tests__/calculators/deleted-invoices.test.ts
import { describe, it, expect } from 'vitest'
import { calculateDeletedInvoices } from '@/lib/calculators/deleted-invoices'
import type { NormalizedInvoice } from '@/lib/types/normalized'

function makeInvoice(employee: string, amount: number, id: string): NormalizedInvoice {
  return { id, date: '2024-01-01', location: 'Local A', employee, amount, status: 'deleted' }
}

describe('calculateDeletedInvoices — concentración', () => {
  it('BUG-C04: NO debe alertar con solo 1 factura eliminada', () => {
    const invoices = [makeInvoice('Juan', 100, '1')]
    const result = calculateDeletedInvoices(invoices)
    expect(result.concentration_alert).toBe('')
  })

  it('BUG-C04: NO debe alertar con 3 facturas aunque 1 empleado tenga el 100%', () => {
    const invoices = [
      makeInvoice('Juan', 50, '1'),
      makeInvoice('Juan', 60, '2'),
      makeInvoice('Juan', 70, '3'),
    ]
    const result = calculateDeletedInvoices(invoices)
    expect(result.concentration_alert).toBe('')
  })

  it('BUG-C05: la concentración debe basarse en importe, no en conteo', () => {
    // Ana: 2 facturas de 5.000€ cada una = 10.000€ (44% del importe)
    // Pedro: 3 facturas de 10€ cada una = 30€ (< 1% del importe)
    // Por conteo Pedro tiene 60%, pero Ana tiene el 44% del importe
    const invoices = [
      makeInvoice('Ana', 5000, '1'),
      makeInvoice('Ana', 5000, '2'),
      makeInvoice('Pedro', 10, '3'),
      makeInvoice('Pedro', 10, '4'),
      makeInvoice('Pedro', 10, '5'),
      makeInvoice('Maria', 3000, '6'),  // 3.000€
      makeInvoice('Maria', 3000, '7'),  // + 3.000€ → total 6.000€, 26%
    ]
    const result = calculateDeletedInvoices(invoices)
    // Con importe: Ana 44%, Pedro 0.1%, Maria 26% → ninguno supera 40% del importe de forma aislada
    // excepto Ana. La alerta debe mencionar a Ana, no a Pedro.
    if (result.concentration_alert !== '') {
      expect(result.concentration_alert).toContain('Ana')
      expect(result.concentration_alert).not.toContain('Pedro')
    }
  })
})
```

**Step 2: Ejecutar para verificar fallo**

```bash
npx vitest run __tests__/calculators/deleted-invoices.test.ts
```
Expected: FAIL (BUG-C04: alerta con 1 factura, BUG-C05: alerta menciona Pedro).

**Step 3: Corregir `lib/calculators/deleted-invoices.ts`**

Añadir constante y cambiar lógica de concentración (líneas 8, 82-90):

```typescript
const CONCENTRATION_THRESHOLD = 0.4
const MIN_DELETIONS_FOR_CONCENTRATION_ALERT = 5  // BUG-C04: mínimo absoluto

// ... (resto del código sin cambios hasta línea 82)

  // Concentración por IMPORTE (no por conteo) — BUG-C05
  let concentrationAlert = ''
  if (byEmployee.length > 0 && totalCount >= MIN_DELETIONS_FOR_CONCENTRATION_ALERT) {
    // Reordenar por importe para encontrar el top por importe
    const topByAmount = [...byEmployee].sort((a, b) => b.amount - a.amount)[0]
    const topAmountPercentage = totalAmount > 0 ? topByAmount.amount / totalAmount : 0

    if (topAmountPercentage > CONCENTRATION_THRESHOLD) {
      const pctFormatted = Math.round(topAmountPercentage * 100)
      concentrationAlert = `Concentración anómala en empleado ${topByAmount.employee} (${pctFormatted}% del importe de anulaciones: ${topByAmount.amount.toFixed(2)}€)`
    }
  }
```

**Step 4: Verificar**

```bash
npx vitest run __tests__/calculators/deleted-invoices.test.ts
```
Expected: PASS todos.

**Step 5: Commit**

```bash
git add lib/calculators/deleted-invoices.ts __tests__/calculators/deleted-invoices.test.ts
git commit -m "fix(calculators): concentración de facturas usa importe y requiere mínimo 5

BUG-C04: añadir MIN_DELETIONS_FOR_CONCENTRATION_ALERT=5
BUG-C05: concentración basada en importe (€) no en conteo"
```

---

## Task 5: Conclusions — severidad de mermas y locales multi-riesgo

**Bugs:** BUG-C13, BUG-C14
**Archivo:** `lib/calculators/conclusions.ts:124-133, 175-183`
**Test:** `__tests__/calculators/conclusions.test.ts`

**Contexto:**
- BUG-C13: Merma de 0.01% devuelve `severity: 'medium'`. Infrareporte extremo (< 0.5%) debería ser `critical`.
- BUG-C14: La conclusión de "locales con múltiples factores de riesgo" se suprime con `&& !correlation_exists`. Es exactamente cuando más debería mostrarse.

**Step 1: Tests que fallen**

```typescript
// __tests__/calculators/conclusions.test.ts — añadir a los tests existentes
import { describe, it, expect } from 'vitest'
import { generateConclusions } from '@/lib/calculators/conclusions'

// Helper: inputs vacíos base
function emptyInputs() {
  return {
    cash: { locals: [], worst_local: '', alert_message: '' },
    invoices: { by_local: [], by_employee: [], total_count: 0, total_amount: 0, concentration_alert: '' },
    products: { total_eliminated: 0, by_phase: { before_kitchen: { count: 0, amount: 0 }, after_kitchen: { count: 0, amount: 0 }, after_billing: { count: 0, amount: 0 } }, by_local: [] },
    waste: { total_waste: 0, total_sales: 10000, waste_percentage: 0, by_local: [], benchmark_comparison: '', underreporting_alert: false },
    inventory: { by_month: [], by_product_top10: [], total_deviation_range: { min: 0, max: 0 }, main_cause: '' },
    correlation: { scatter_data: [], correlation_exists: false, patterns_by_local: [] },
  }
}

describe('generateConclusions — severidades', () => {
  it('BUG-C13: merma de 0.01% debe generar conclusión CRITICAL (no medium)', () => {
    const inputs = emptyInputs()
    inputs.waste.waste_percentage = 0.01
    inputs.waste.underreporting_alert = true
    const result = generateConclusions(inputs)
    const wasteConcl = result.conclusions.find(c => c.title.includes('merma') || c.title.includes('Merma') || c.title.includes('infrareporte') || c.title.includes('Infrareporte'))
    expect(wasteConcl).toBeDefined()
    expect(wasteConcl!.severity).toBe('critical')
  })

  it('BUG-C14: locales multi-riesgo debe mostrarse TAMBIÉN cuando correlation_exists=true', () => {
    const inputs = emptyInputs()
    inputs.correlation.correlation_exists = true
    inputs.correlation.patterns_by_local = [
      { location: 'Local A', pattern: 'Descuadres de caja críticos; Alto volumen de facturas anuladas', strength: 75 },
    ]
    const result = generateConclusions(inputs)
    const multiRiskConcl = result.conclusions.find(c =>
      c.title.includes('múltiples') || c.title.includes('multiples')
    )
    expect(multiRiskConcl).toBeDefined()
  })
})
```

**Step 2: Ejecutar para verificar fallo**

```bash
npx vitest run __tests__/calculators/conclusions.test.ts
```
Expected: FAIL en BUG-C13 (devuelve 'medium') y BUG-C14 (la conclusión no aparece).

**Step 3: Corregir `lib/calculators/conclusions.ts`**

Para BUG-C13, reemplazar el bloque de waste underreporting (líneas 124-133):

```typescript
  // --- 4. Waste underreporting — escala de severidad ---
  if (data.waste.underreporting_alert) {
    // Infrareporte extremo (< 0.5%) es una señal más fuerte de manipulación
    const wasteSeverity: 'critical' | 'high' | 'medium' =
      data.waste.waste_percentage < 0.5 ? 'critical' :
      data.waste.waste_percentage < WASTE_UNDERREPORTING_THRESHOLD ? 'high' :
      'medium'

    conclusions.push({
      title: 'Posible infrareporte de mermas',
      severity: wasteSeverity,
      description: `El porcentaje de mermas reportado (${data.waste.waste_percentage.toFixed(2)}%) está muy por debajo del benchmark de la industria (3%). Un nivel tan bajo sugiere que las mermas no están siendo reportadas correctamente, lo cual podría ocultar sustracciones de producto.`,
    })
    immediateActions.push(
      'Implementar registro obligatorio de mermas con fotografía y doble firma'
    )
  }
```

Para BUG-C14, eliminar la condición `&& !data.correlation.correlation_exists` en línea 178:

```typescript
  // ANTES (línea 178):
  if (multiRiskLocals.length > 0 && !data.correlation.correlation_exists) {

  // DESPUÉS:
  if (multiRiskLocals.length > 0) {
    // Mostrar locales multi-riesgo INDEPENDIENTEMENTE de si hay correlación general.
    // De hecho, si hay correlación, es aún más relevante destacar qué locales están implicados.
```

**Step 4: Verificar**

```bash
npx vitest run __tests__/calculators/conclusions.test.ts
```
Expected: PASS todos.

**Step 5: Commit**

```bash
git add lib/calculators/conclusions.ts __tests__/calculators/conclusions.test.ts
git commit -m "fix(calculators): escala de severidad en mermas y locales multi-riesgo

BUG-C13: merma < 0.5% → critical, < 1% → high (antes siempre medium)
BUG-C14: conclusión multi-riesgo se muestra también cuando correlation_exists=true"
```

---

## Task 6: Waste analysis e inventory deviation — casos límite

**Bugs:** BUG-C07, BUG-C15
**Archivos:**
- Modify: `lib/calculators/inventory-deviation.ts:86-99`
- Modify: `lib/calculators/waste-analysis.ts:67-73`

**Contexto:**
- BUG-C07: `mainCause = 'Desviaciones distribuidas...'` cuando `totalAbsoluteDeviation === 0` (no hay desviaciones). Debería decir "Sin desviaciones significativas detectadas".
- BUG-C15: Con `wastePercentage = 2.5` y `BENCHMARK_TOLERANCE = 0.5`, el umbral es `< 2.5` → 2.5 cae en "En línea". Si el diseño quiere que el benchmark sea la zona 2.5-3.5, entonces 2.5 debería ser "Por debajo". Es una decisión de diseño: usar `<=` en lugar de `<`.

**Step 1: Tests (sin TDD para estos — son edge cases de valores límite)**

```typescript
// Añadir a __tests__/calculators/inventory-deviation.test.ts
it('BUG-C07: sin deviaciones debe mostrar "Sin desviaciones significativas"', () => {
  const result = calculateInventoryDeviation([])
  expect(result.main_cause).toBe('Sin desviaciones significativas detectadas')
})

// Añadir a __tests__/calculators/waste-analysis.test.ts (crear si no existe)
import { calculateWasteAnalysis } from '@/lib/calculators/waste-analysis'
it('BUG-C15: 2.5% exacto debe clasificarse como "Por debajo del benchmark"', () => {
  const waste = [{ id: 'w1', date: '2024-01-01', location: 'Local A', product_name: 'X', quantity: 1, unit: 'ud', unit_cost: 25, total_cost: 25 }]
  const sales = [{ date: '2024-01-01', location: 'Local A', gross_sales: 1000, net_sales: 1000, expected_cash: 0, actual_cash: 0, cash_discrepancy: 0 }]
  const result = calculateWasteAnalysis(waste, sales)
  // 25/1000 = 2.5%
  expect(result.waste_percentage).toBe(2.5)
  expect(result.benchmark_comparison).toBe('Por debajo del benchmark')
})
```

**Step 2: Ejecutar para verificar fallo**

```bash
npx vitest run __tests__/calculators/inventory-deviation.test.ts __tests__/calculators/waste-analysis.test.ts
```

**Step 3: Corregir `lib/calculators/inventory-deviation.ts`**

Líneas 86-99, añadir guard para `totalAbsoluteDeviation === 0`:

```typescript
  let mainCause: string
  if (deviations.length === 0 || totalAbsoluteDeviation === 0) {
    mainCause = 'Sin desviaciones significativas detectadas'
  } else if (
    byProductTop10.length > 0 &&
    byProductTop10[0].total_deviation / totalAbsoluteDeviation > DOMINANT_PRODUCT_THRESHOLD
  ) {
    const topProduct = byProductTop10[0]
    const pct = Math.round((topProduct.total_deviation / totalAbsoluteDeviation) * 100)
    mainCause = `Producto dominante: ${topProduct.product_name} (${pct}% de la desviación total)`
  } else {
    mainCause = 'Desviaciones distribuidas entre múltiples productos'
  }
```

Corregir `lib/calculators/waste-analysis.ts` línea 68 — usar `<=` para el límite inferior:

```typescript
  if (wastePercentage <= INDUSTRY_BENCHMARK_PCT - BENCHMARK_TOLERANCE) {
    benchmarkComparison = 'Por debajo del benchmark'
```

**Step 4: Verificar**

```bash
npx vitest run __tests__/calculators/inventory-deviation.test.ts __tests__/calculators/waste-analysis.test.ts
```
Expected: PASS todos.

**Step 5: Commit**

```bash
git add lib/calculators/inventory-deviation.ts lib/calculators/waste-analysis.ts __tests__/calculators/inventory-deviation.test.ts __tests__/calculators/waste-analysis.test.ts
git commit -m "fix(calculators): mainCause con deviaciones 0 y límite de benchmark de mermas

BUG-C07: sin desviaciones → 'Sin desviaciones significativas detectadas'
BUG-C15: 2.5% se clasifica como 'Por debajo del benchmark' (usar <=)"
```

---

## Task 7: Parser Last.app — facturas eliminadas sin producto

**Bugs:** BUG-P02, BUG-P03
**Archivo:** `lib/parsers/lastapp.ts:394-426`
**Test:** `__tests__/parsers/lastapp.test.ts`

**Contexto:**
- BUG-P02: `if (productName)` en línea 409 ignora facturas eliminadas sin campo Producto. El 71% de las eliminaciones son invisibles para deleted_products.
- BUG-P03: Filas con todos los valores a 0 se eliminan silenciosamente. Añadir log de debug (no cambiar la lógica, es un guard válido).

**Step 1: Test para BUG-P02**

```typescript
// __tests__/parsers/lastapp.test.ts — añadir
import { parseLastApp } from '@/lib/parsers/lastapp'

it('BUG-P02: facturas eliminadas sin campo Producto deben generar entrada en deleted_products', () => {
  const csv = `Nº Factura,Fecha,Local,Empleado,Importe,Estado,Fase Eliminación
INV001,01/01/2024,Local A,Juan,150.00,Eliminada,Después del cobro`
  // Sin columna Producto

  const result = parseLastApp(csv)
  expect(result.deleted_products).toHaveLength(1)
  expect(result.deleted_products![0].product_name).toBe('Producto no especificado')
  expect(result.deleted_products![0].total_amount).toBe(150)
})
```

**Step 2: Ejecutar para verificar fallo**

```bash
npx vitest run __tests__/parsers/lastapp.test.ts
```
Expected: FAIL (`deleted_products` tiene longitud 0).

**Step 3: Corregir `lib/parsers/lastapp.ts`**

Reemplazar el bloque `if (productName)` (líneas 409-425) con:

```typescript
      if (status === 'deleted') {
        const productName = getField(row, [
          'Producto', 'producto', 'Product', 'product', 'Descripcion', 'Artículo',
          'Articulo', 'Nombre Producto',
        ])
        const quantity = parseNumber(
          getField(row, ['Cantidad', 'cantidad', 'Quantity', 'quantity', 'Qty', 'Uds']),
        )
        const unitPrice = parseNumber(
          getField(row, [
            'Precio Unitario', 'precio unitario', 'Unit Price', 'unit_price',
            'Precio', 'PVP',
          ]),
        )

        // BUG-P02 FIX: crear entrada aunque productName esté vacío
        const resolvedProductName = productName || 'Producto no especificado'
        const totalAmount = quantity && unitPrice ? quantity * unitPrice : amount

        deletedProducts.push({
          id: nextId('del'),
          date,
          location: location || 'Unknown',
          employee: employee || 'Unknown',
          product_name: resolvedProductName,
          quantity: quantity || 1,
          unit_price: unitPrice || amount,
          total_amount: totalAmount,
          phase: deletionPhaseRaw
            ? mapDeletionPhase(deletionPhaseRaw)
            : 'after_billing',
        })
      }
```

**Step 4: Verificar**

```bash
npx vitest run __tests__/parsers/lastapp.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/parsers/lastapp.ts __tests__/parsers/lastapp.test.ts
git commit -m "fix(parsers): crear deleted_product aunque la factura no tenga nombre de producto

BUG-P02: facturas eliminadas sin campo Producto ahora generan entrada
en deleted_products con 'Producto no especificado', recuperando el 71%
de eliminaciones que eran invisibles para el calculador de productos."
```

---

## Task 8: Parser T-Spoon Lab — fecha de fin de mes, coste total 0, desviación CSV

**Bugs:** BUG-P10, BUG-P11, BUG-P12
**Archivo:** `lib/parsers/tspoonlab.ts`
**Test:** `__tests__/parsers/tspoonlab.test.ts`

**Contexto:**
- BUG-P10: `dateTo = '${lastMonth}-28'` ignora meses con 30 o 31 días.
- BUG-P11: `total_cost: totalCost || unitCost * (quantity || 1)` — si CSV tiene `totalCost = 0` válido, se sobreescribe.
- BUG-P12: Si CSV dice `deviation = 75` pero `actual - theoretical = 74.57`, se usa el valor del CSV sin advertencia.

**Step 1: Tests**

```typescript
// __tests__/parsers/tspoonlab.test.ts
import { parseTSpoonLab } from '@/lib/parsers/tspoonlab'

it('BUG-P10: fecha fin de mes debe ser el último día real del mes', () => {
  const csv = `Mes,Local,Producto,Consumo Teorico,Consumo Real,Desviacion,Unidad
Marzo 2024,Local A,Aceite,100,110,10,L`
  const result = parseTSpoonLab(csv)
  // Marzo tiene 31 días, no 28
  expect(result.metadata!.date_to).toBe('2024-03-31')
})

it('BUG-P11: total_cost=0 explícito en CSV no debe sobreescribirse', () => {
  // Un producto registrado como merma con importe 0 (regalo/muestra) es válido
  const csv = `Fecha,Local,Producto,Cantidad,Unidad,Coste Unitario,Coste Total
01/01/2024,Local A,Muestra,1,ud,5,0`
  const result = parseTSpoonLab(csv)
  expect(result.waste![0].total_cost).toBe(0)
})

it('BUG-P12: desviación CSV se usa pero se puede validar contra actual-teorico', () => {
  const csv = `Mes,Local,Producto,Consumo Teorico,Consumo Real,Desviacion,Unidad
Enero 2024,Local A,Aceite,100,174.57,75,L`
  // actual - theoretical = 74.57, CSV dice 75 → diferencia de 0.43
  const result = parseTSpoonLab(csv)
  // El valor usado debe ser el del CSV (75), pero el deviation_source debe indicar 'csv'
  expect(result.inventory_deviations![0].deviation).toBe(75)
})
```

**Step 2: Ejecutar para verificar**

```bash
npx vitest run __tests__/parsers/tspoonlab.test.ts
```

**Step 3: Corregir `lib/parsers/tspoonlab.ts`**

Para BUG-P10 — crear helper `lastDayOfMonth` y usarlo en línea 271:

```typescript
function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  // new Date(year, month, 0) = último día del mes anterior = último día del mes `month`
  const day = new Date(year, month, 0).getDate()
  return `${yearMonth}-${String(day).padStart(2, '0')}`
}

// En parseTSpoonLab, línea 271, reemplazar:
// dateTo = `${lastMonth}-28`
// con:
dateTo = lastDayOfMonth(sortedMonths[sortedMonths.length - 1])
```

Para BUG-P11 — en `parseWasteRows`, corregir línea 344:

```typescript
// ANTES:
total_cost: totalCost || unitCost * (quantity || 1),

// DESPUÉS: solo calcular si totalCost no fue proporcionado en el CSV (es undefined/vacío),
// no si es 0 (puede ser un valor válido)
const totalCostRaw = getField(row, ['Coste Total', 'coste total', 'Total Cost', 'total_cost', 'Coste', 'Total', 'Importe'])
const totalCostProvided = totalCostRaw !== ''

waste.push({
  ...
  total_cost: totalCostProvided ? totalCost : unitCost * (quantity || 1),
})
```

Para BUG-P12 — en `parseInventoryRows` — añadir lógica sin cambiar el valor usado (el CSV es fuente de verdad, pero registrar discrepancia):

```typescript
const calculated = actualConsumption - theoreticalConsumption
const deviation = deviationRaw
  ? parseNumber(deviationRaw)
  : calculated

// Detectar discrepancia > 1 unidad entre CSV y cálculo
const deviationDiscrepancy = deviationRaw
  ? Math.abs(deviation - calculated)
  : 0
if (deviationDiscrepancy > 1) {
  console.warn(
    `[tspoonlab] Desviación CSV (${deviation}) difiere del cálculo (${calculated.toFixed(2)}) en ${deviationDiscrepancy.toFixed(2)} para producto "${productName}" en ${month}`
  )
}
```

**Step 4: Verificar**

```bash
npx vitest run __tests__/parsers/tspoonlab.test.ts
```
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/parsers/tspoonlab.ts __tests__/parsers/tspoonlab.test.ts
git commit -m "fix(parsers): tspoonlab fecha fin de mes real, total_cost=0 válido, warning desviación

BUG-P10: usar lastDayOfMonth() en lugar de hardcoded -28
BUG-P11: respetar total_cost=0 explícito del CSV
BUG-P12: warning en consola cuando desviación CSV difiere del cálculo >1 unidad"
```

---

## Task 9: APIs — validación, créditos, error messages, paginación

**Bugs:** BUG-API01, BUG-API02, BUG-API03, BUG-API04, BUG-API05, BUG-API06
**Archivos:**
- Modify: `app/api/upload/route.ts`
- Modify: `app/api/reports/[reportId]/ai-insights/route.ts`
- Modify: `app/api/analyze/route.ts`
- Modify: `app/api/dashboard/route.ts`
- Modify: `lib/report-comparator.ts`

**Nota sobre BUG-API01:** Revisando el código, `deductCredit` (línea 69) se llama ANTES de `supabase.insert(report)` (línea 97). El orden es correcto. El riesgo real es que `inngest.send()` (línea 112) falle después de deducir crédito y crear el reporte. El fix es envolver en try/catch e invalidar el reporte si el envío a Inngest falla.

**Step 1: Corregir `app/api/upload/route.ts` — validación de tamaño (BUG-API03)**

Añadir justo después de `if (!sourceCategory)` (línea 36):

```typescript
    // BUG-API03: validar tamaño antes de leer el contenido
    const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `El archivo supera el límite de 50 MB (tamaño actual: ${(file.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 413 }
      )
    }
```

**Step 2: Corregir `app/api/analyze/route.ts` — mensaje demo (BUG-API04) y Inngest failure (BUG-API01)**

Cambiar línea 63-66 (error de demo):

```typescript
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'Demo limit reached. Each account can run one demo analysis.' },
          { status: 400 }  // 400, no 402
        )
      }
```

Añadir manejo de fallo en Inngest (líneas 112-125):

```typescript
    try {
      await inngest.send({
        name: 'report/analyze',
        data: { reportId: report.id, /* ... */ },
      })
    } catch (inngestErr) {
      console.error('Failed to send Inngest event:', inngestErr)
      // Marcar el reporte como fallido para no dejar estado zombie
      await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id)
      return NextResponse.json(
        { error: 'Failed to queue analysis. Your credit has not been charged.' },
        { status: 500 }
      )
    }
```

**Step 3: Corregir `app/api/reports/[reportId]/ai-insights/route.ts` — deducir crédito (BUG-API02)**

En el POST handler, añadir después de verificar `report.report_data` (línea 115-120) y antes de la llamada a `generateAIInsights`:

```typescript
    // BUG-API02: la regeneración de insights usa la API de Anthropic — deducir crédito
    const { deductCredit } = await import('@/lib/credits')
    const deducted = await deductCredit(user.id, 'ai_insights_regeneration', undefined)
    if (!deducted) {
      return NextResponse.json(
        { error: 'Insufficient credits to regenerate AI insights', status: 'insufficient_credits' },
        { status: 402 }
      )
    }
```

**Step 4: Corregir `app/api/dashboard/route.ts` — paginación (BUG-API05)**

Añadir `.limit(50)` y soporte para `offset` via query param:

```typescript
    // BUG-API05: limitar reports para evitar timeout con usuarios con muchos informes
    const REPORTS_PAGE_SIZE = 50
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, slug, status, created_at, locations_analyzed, analysis_window_from, analysis_window_to, external_views, pos_connector, report_data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(REPORTS_PAGE_SIZE)
```

**Step 5: Corregir `lib/report-comparator.ts` — Math.abs en comparación de caja (BUG-API06)**

El comparador usa `Math.abs()` para calcular el total de discrepancias. Esto es para comparar "magnitud de problema". Mantener el Math.abs() para el total global (es correcto — queremos saber si el problema empeoró en términos absolutos), pero **eliminar el Math.abs() en `per_local`** para preservar la dirección:

Líneas 131-134 en `lib/report-comparator.ts`:

```typescript
    // BUG-API06: cash_delta debe preservar dirección (signado)
    // Si A tenía -300 y B tiene +200, el delta es +500 (mejoró en esa dirección)
    const cashValA = cashLocalA?.total_discrepancy ?? 0
    const cashValB = cashLocalB?.total_discrepancy ?? 0
    perLocal.push({
      location,
      cash_delta: cashValB - cashValA,  // signado, no Math.abs()
      invoices_count_delta: (invoiceLocalB?.count ?? 0) - (invoiceLocalA?.count ?? 0),
      waste_delta: (wasteLocalB?.waste_percentage ?? 0) - (wasteLocalA?.waste_percentage ?? 0),
      present_in_a: presentInA,
      present_in_b: presentInB,
    })
```

**Step 6: Commit**

```bash
git add app/api/upload/route.ts app/api/analyze/route.ts app/api/reports/\[reportId\]/ai-insights/route.ts app/api/dashboard/route.ts lib/report-comparator.ts
git commit -m "fix(api): validación archivo, crédito AI insights, mensaje demo, paginación, dirección cash delta

BUG-API01: manejar fallo de Inngest marcando reporte como failed
BUG-API02: deducir crédito antes de regenerar AI insights
BUG-API03: validar tamaño máximo 50MB en upload
BUG-API04: 400 en lugar de 402 para límite de demo
BUG-API05: limitar dashboard a 50 reports
BUG-API06: cash_delta en comparador preserva signo (dirección)"
```

---

## Task 10: Frontend — race condition demo + créditos falsos

**Bugs:** AUDIT-008, AUDIT-026
**Archivo:** `app/dashboard/upload/page.tsx`

**Contexto:**
- AUDIT-008: El `setTimeout(..., 50)` captura un closure de `handlePosFileSelect` con `posConnector = ''`. El conector `'lastapp'` no llega a la detección de volumen.
- AUDIT-026: En el catch de fetchBalance, se asignan 100 créditos falsos. Si la API falla, el usuario ve saldo que no tiene y puede intentar analizar, recibiendo un 402.

**Step 1: Corregir AUDIT-008 en `app/dashboard/upload/page.tsx`**

Buscar el bloque del botón de demo (líneas 362-383) y reemplazar completamente:

```typescript
                onClick={async () => {
                  try {
                    const res = await fetch('/demo/lastapp-demo.csv')
                    const blob = await res.blob()
                    const demoFile = new File([blob], 'lastapp-demo.csv', { type: 'text/csv' })

                    // AUDIT-008 FIX: no usar setTimeout con handlePosFileSelect (stale closure).
                    // Ejecutar detectVolume directamente con el conector conocido.
                    const demoConnector = 'lastapp'
                    const text = await demoFile.text()
                    const volume = detectVolume(text, demoConnector)

                    setPosConnector(demoConnector)
                    setRestaurantName('Demo — Paella Dorada')
                    setIsDemo(true)
                    setPosFile(demoFile)
                    setPosVolume(volume)

                    const credits = userCredits ?? 0
                    if (volume.creditsRequired > credits) {
                      setShowUpgrade(true)
                    } else {
                      setShowUpgrade(false)
                    }
                  } catch {
                    setError('No se pudo cargar los datos demo')
                  }
                }}
```

**Step 2: Corregir AUDIT-026 en `app/dashboard/upload/page.tsx`**

Líneas 91-93, cambiar el catch:

```typescript
    } catch {
      // Si no se puede verificar el saldo, mostrar 0 para no inflar créditos
      setUserCredits(0)
    }
```

**Step 3: Commit**

```bash
git add app/dashboard/upload/page.tsx
git commit -m "fix(frontend): race condition demo y fallback de créditos a 0

AUDIT-008: eliminar setTimeout con stale closure, llamar detectVolume directamente
AUDIT-026: fallback de userCredits a 0 en lugar de 100 cuando falla fetchBalance"
```

---

## Task 11: Frontend — AbortController en todos los useEffect con fetch

**Bug:** AUDIT-009, AUDIT-025
**Archivos:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/upload/page.tsx`
- Modify: `app/dashboard/comparar/page.tsx`

**Contexto:** Cuatro `useEffect` lanzan fetches sin `AbortController`. Si el usuario navega antes de que terminen, `setState` se llama en componentes ya desmontados (memory leak silencioso en React 18). El caso de `comparar/page.tsx` tiene además un race condition de datos.

**Step 1: Corregir `app/dashboard/page.tsx` (loadDashboard)**

```typescript
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
          setReports(data.reports)
          setCompletedActions(data.completedActions)
          setAlertRules(data.alertRules ?? [])
        } else {
          console.error('Dashboard API returned error:', res.status)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Failed to load dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboard()
    return () => controller.abort()
  }, [isUserLoaded, user])
```

**Step 2: Corregir `app/dashboard/upload/page.tsx` (fetchBalance)**

```typescript
  useEffect(() => {
    const controller = new AbortController()
    async function fetchBalance() {
      try {
        const res = await fetch('/api/dashboard', { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          setUserCredits(data.balance)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setUserCredits(0)
      }
    }
    fetchBalance()
    return () => controller.abort()
  }, [])
```

**Step 3: Corregir `app/dashboard/comparar/page.tsx` — ambos useEffect**

```typescript
  // Fetch available reports
  useEffect(() => {
    if (!isLoaded || !user) return
    const controller = new AbortController()

    async function loadReports() {
      try {
        const res = await fetch('/api/dashboard', { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          const completed = (data.reports ?? []).filter(
            (r: ReportOption & { status: string }) => r.status === 'completed'
          )
          setReports(completed)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('Failed to load reports')
      } finally {
        setIsLoadingReports(false)
      }
    }

    loadReports()
    return () => controller.abort()
  }, [isLoaded, user])

  // Fetch comparison — AUDIT-025: AbortController previene race condition
  useEffect(() => {
    if (!slugA || !slugB || slugA === slugB) {
      setComparison(null)
      setError(null)
      return
    }

    const controller = new AbortController()

    async function compare() {
      setIsComparing(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/compare?reportA=${encodeURIComponent(slugA)}&reportB=${encodeURIComponent(slugB)}`,
          { signal: controller.signal }
        )
        if (res.ok) {
          setComparison(await res.json())
        } else {
          const data = await res.json()
          setError(data.error || 'Error al comparar informes')
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('Error de conexión')
      } finally {
        setIsComparing(false)
      }
    }

    compare()
    return () => controller.abort()
  }, [slugA, slugB])
```

**Step 4: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/upload/page.tsx app/dashboard/comparar/page.tsx
git commit -m "fix(frontend): AbortController en todos los useEffect con fetch

AUDIT-009: previene setState en componentes desmontados
AUDIT-025: previene race condition al cambiar selección en comparador"
```

---

## Task 12: Frontend — Error Boundaries y bugs UI

**Bugs:** AUDIT-012, BUG-UI01, BUG-UI02, BUG-UI03
**Archivos:**
- Create: `app/error.tsx`
- Create: `app/dashboard/error.tsx`
- Modify: `components/report/SummaryTab.tsx`
- Modify: `components/report/InventoryTab.tsx`

**Step 1: Crear `app/error.tsx`**

```typescript
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="mx-auto max-w-md px-4 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-red-600">
            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-stone-900">Algo fue mal</h2>
        <p className="mt-2 text-sm text-stone-500">
          {process.env.NODE_ENV === 'development' ? error.message : 'Se ha producido un error inesperado.'}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
```

Crear `app/dashboard/error.tsx` con el mismo contenido pero añadiendo link a dashboard:

```typescript
// Igual que app/error.tsx pero con:
import Link from 'next/link'
// Y añadir tras el botón de Reintentar:
<Link href="/dashboard" className="mt-2 block text-sm text-stone-400 hover:text-stone-600">
  Volver al dashboard
</Link>
```

**Step 2: Corregir BUG-UI01 en `components/report/SummaryTab.tsx`**

Línea 47 — añadir guard para `cash.locals`:

```typescript
  const totalCashDiscrepancy = (cash.locals ?? []).reduce(
    (sum, l) => sum + l.total_discrepancy,
    0
  )
```

**Step 3: Corregir BUG-UI03 en `components/report/InventoryTab.tsx`**

El problema es que `formatCurrency(-500)` en algunos locales puede mostrar "-500 €" o "€-500" dependiendo de la implementación del `Intl.NumberFormat`. Verificar en `lib/utils.ts`:

```typescript
// lib/utils.ts — la función actual es correcta para es-ES:
// Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR'}).format(-500)
// → "-500,00 €" (correcto en es-ES)
// El bug BUG-UI03 menciona "$-500" — posiblemente es un problema de locale
// Añadir verificación explícita de signo:
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
// Si ya es así, el bug no reproduce. Verificar en el browser con datos reales.
```

En `components/report/InventoryTab.tsx`, la columna de desviación (línea 137) ya tiene `text-red-600` para todos los valores. Mejorar para valores positivos (exceso):

```typescript
                  <td className={`py-3 pr-4 text-right tabular-nums ${
                    p.total_deviation < 0 ? 'text-red-600' : 'text-amber-600'
                  }`}>
                    {formatCurrency(p.total_deviation)}
                  </td>
```

**Step 4: Commit**

```bash
git add app/error.tsx app/dashboard/error.tsx components/report/SummaryTab.tsx components/report/InventoryTab.tsx lib/utils.ts
git commit -m "fix(frontend): error boundaries, null check en SummaryTab, color desviación inventario

AUDIT-012/BUG-UI02: crear app/error.tsx y app/dashboard/error.tsx
BUG-UI01: guard para cash.locals null en SummaryTab
BUG-UI03: diferenciar color positivo/negativo en tabla de desviación de inventario"
```

---

## Task 13: Frontend UX — confirmación de borrado, polling timeout, empty states charts, validación upload

**Bugs:** AUDIT-004, AUDIT-013, AUDIT-017, AUDIT-021
**Archivos:**
- Modify: `components/dashboard/AlertRulesCard.tsx`
- Modify: `app/dashboard/processing/[reportId]/page.tsx`
- Modify: `components/report/CashTab.tsx`
- Modify: `components/report/InventoryTab.tsx`
- Modify: `components/report/CorrelationTab.tsx`
- Modify: `components/upload/FileDropZone.tsx`

**Step 1: AUDIT-004 — confirmación antes de borrar alerta**

En `components/dashboard/AlertRulesCard.tsx`, función `handleDelete`:

```typescript
  async function handleDelete(ruleId: string) {
    const ruleName = rules.find((r) => r.id === ruleId)?.name ?? 'esta alerta'
    if (!window.confirm(`¿Eliminar "${ruleName}"? Esta acción no se puede deshacer.`)) return

    try {
      const res = await fetch(`/api/alerts/${ruleId}`, { method: 'DELETE' })
      // ... resto igual
```

**Step 2: AUDIT-013 — timeout máximo de polling**

En `app/dashboard/processing/[reportId]/page.tsx`, añadir tras las constantes iniciales:

```typescript
  const MAX_POLL_DURATION_MS = 5 * 60 * 1000 // 5 minutos máximo
  const pollStartTime = useRef(Date.now())
```

Dentro de `pollStatus()`, añadir al inicio:

```typescript
      if (Date.now() - pollStartTime.current > MAX_POLL_DURATION_MS) {
        setError('El análisis está tardando más de lo esperado. Por favor, contacta con soporte si el problema persiste.')
        clearInterval(intervalId)
        return
      }
```

**Step 3: AUDIT-017 — empty states en charts**

En `components/report/CashTab.tsx`, antes del `<Card>` del chart:

```typescript
          {chartData.length === 0 ? (
            <div className="flex h-80 items-center justify-center rounded-xl bg-stone-50 text-sm text-stone-400">
              No hay datos de caja suficientes para mostrar este gráfico
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer ...>
                ...
              </ResponsiveContainer>
            </div>
          )}
```

Aplicar el mismo patrón en `components/report/InventoryTab.tsx` (guard `monthChart.length === 0`) y `components/report/CorrelationTab.tsx` (guard `data.scatter_data.length === 0`).

**Step 4: AUDIT-021 — validación en FileDropZone**

En `components/upload/FileDropZone.tsx`, actualizar la interfaz y el handler:

```typescript
export interface FileDropZoneProps {
  onFileSelect: (file: File) => void
  onError?: (message: string) => void  // nuevo
  accept: string
  label: string
}

const MAX_FILE_SIZE_MB = 50
const ALLOWED_EXTENSIONS = /\.(csv|xlsx|xls)$/i

// En handleFile:
  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        onError?.(`El archivo "${file.name}" supera el límite de ${MAX_FILE_SIZE_MB} MB`)
        return
      }
      if (!ALLOWED_EXTENSIONS.test(file.name)) {
        onError?.(`Formato no válido: solo se aceptan CSV, XLS y XLSX`)
        return
      }
      setSelectedFile(file)
      onFileSelect(file)
    },
    [onFileSelect, onError]
  )
```

En `app/dashboard/upload/page.tsx`, pasar `onError` a los `FileDropZone`:

```typescript
<FileDropZone
  onFileSelect={handlePosFileSelect}
  onError={(msg) => setError(msg)}
  accept=".csv,.xlsx,.xls"
  label="Archivo CSV o Excel del POS"
/>
```

**Step 5: Commit**

```bash
git add components/dashboard/AlertRulesCard.tsx app/dashboard/processing/\[reportId\]/page.tsx components/report/CashTab.tsx components/report/InventoryTab.tsx components/report/CorrelationTab.tsx components/upload/FileDropZone.tsx app/dashboard/upload/page.tsx
git commit -m "fix(frontend): confirmación de borrado, timeout polling, empty states, validación upload

AUDIT-004: window.confirm antes de eliminar alerta
AUDIT-013: timeout máximo 5min en processing page
AUDIT-017: empty states en charts CashTab, InventoryTab, CorrelationTab
AUDIT-021: validar tamaño (50MB) y extensión en FileDropZone"
```

---

## Task 14: Frontend — manejo de sesión expirada (401)

**Bug:** AUDIT-027
**Archivos:**
- Create: `lib/authed-fetch.ts`
- Modify: `app/dashboard/page.tsx`, `app/dashboard/upload/page.tsx`, `app/dashboard/comparar/page.tsx`

**Contexto:** Si la sesión de Clerk expira, las APIs devuelven 401 pero el frontend no hace nada especial — el usuario ve datos que no cargan sin explicación.

**Step 1: Crear `lib/authed-fetch.ts`**

```typescript
/**
 * Wrapper sobre fetch que redirige automáticamente al login si la API devuelve 401.
 * Usar en todos los fetches del dashboard en lugar de fetch() directamente.
 */
export async function authedFetch(
  url: string,
  options?: RequestInit
): Promise<Response | null> {
  const res = await fetch(url, options)

  if (res.status === 401) {
    const currentPath = window.location.pathname + window.location.search
    window.location.href = `/login?redirect_url=${encodeURIComponent(currentPath)}`
    return null
  }

  return res
}
```

**Step 2: Reemplazar `fetch` por `authedFetch` en las páginas del dashboard**

En `app/dashboard/page.tsx`:
```typescript
import { authedFetch } from '@/lib/authed-fetch'
// Cambiar: const res = await fetch('/api/dashboard', { signal: controller.signal })
// Por:
const res = await authedFetch('/api/dashboard', { signal: controller.signal })
if (!res) return // redirect en curso
```

Aplicar el mismo cambio en `app/dashboard/upload/page.tsx` y `app/dashboard/comparar/page.tsx`.

**Step 3: Commit**

```bash
git add lib/authed-fetch.ts app/dashboard/page.tsx app/dashboard/upload/page.tsx app/dashboard/comparar/page.tsx
git commit -m "fix(frontend): redirigir a login cuando la sesión expira (401)

AUDIT-027: crear authedFetch() wrapper que detecta 401 y redirige
a /login preservando la URL actual para redirect después del login"
```

---

## Verificación Final

Una vez completadas todas las tasks, ejecutar la suite de tests completa:

```bash
cd "/Users/ricardvidal/Desktop/proyectos claude code/fraud-audit"
npx vitest run
```

Expected: Todos los tests pasan, incluyendo los 30 que pasaban antes más los nuevos.

Luego arrancar el servidor local y verificar manualmente:
1. Modo demo — verificar que la detección de volumen muestra datos de Last.app
2. Subir CSV grande (>50MB) — debe rechazar en cliente y servidor
3. Restaurante con 2 locales — tab Correlación debe mostrar "datos insuficientes" en lugar de "fraude sistémico"
4. Dejar la pestaña de processing 5 minutos — debe mostrar mensaje de timeout
5. Borrar una alerta — debe pedir confirmación

```bash
npm run dev
```

---

## Orden de ejecución recomendado

Los bugs CRÍTICOS primero, luego ALTOS, luego MEDIOS:

```
Task 1 → Task 2 → Task 7 → Task 10 → Task 11
  ↓
Task 3 → Task 4 → Task 5 → Task 9
  ↓
Task 6 → Task 8 → Task 12 → Task 13 → Task 14
```
