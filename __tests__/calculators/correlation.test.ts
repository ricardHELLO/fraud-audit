import { describe, it, expect } from 'vitest'
import { calculateCorrelation } from '@/lib/calculators/correlation'

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
    cash: {
      locals,
      worst_local: 'Local 1',
      alert_message: '',
    },
    invoices: {
      by_local: invoiceLocals,
      by_employee: [],
      total_count: n * 2,
      total_amount: n * 500,
      concentration_alert: '',
    },
    inventory: {
      by_month: [],
      by_product_top10: [],
      total_deviation_range: { min: 0, max: 0 },
      main_cause: '',
    },
  }
}

describe('calculateCorrelation — validez estadística (BUG-C08)', () => {
  it('con n=2 locales NO debe detectar correlación (falso positivo garantizado)', () => {
    const { cash, invoices, inventory } = makeInputs(2)
    const result = calculateCorrelation(cash, invoices, inventory)
    expect(result.correlation_exists).toBe(false)
  })

  it('con n=3 locales NO debe detectar correlación (muestra insuficiente)', () => {
    const { cash, invoices, inventory } = makeInputs(3)
    const result = calculateCorrelation(cash, invoices, inventory)
    expect(result.correlation_exists).toBe(false)
  })

  it('con n=4 locales SÍ puede calcular correlación sin lanzar error', () => {
    const { cash, invoices, inventory } = makeInputs(4)
    const result = calculateCorrelation(cash, invoices, inventory)
    expect(typeof result.correlation_exists).toBe('boolean')
  })

  it('con n=2 el resultado incluye scatter_data con 2 puntos', () => {
    const { cash, invoices, inventory } = makeInputs(2)
    const result = calculateCorrelation(cash, invoices, inventory)
    expect(result.scatter_data).toHaveLength(2)
  })
})
