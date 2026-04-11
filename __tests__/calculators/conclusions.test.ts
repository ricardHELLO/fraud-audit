import { describe, it, expect } from 'vitest'
import { generateConclusions } from '@/lib/calculators/conclusions'

function emptyInputs() {
  return {
    cash: { locals: [], worst_local: '', alert_message: '' },
    invoices: {
      by_local: [],
      by_employee: [],
      total_count: 0,
      total_amount: 0,
      concentration_alert: '',
    },
    products: {
      total_eliminated: 0,
      by_phase: {
        before_kitchen: { count: 0, amount: 0 },
        after_kitchen: { count: 0, amount: 0 },
        after_billing: { count: 0, amount: 0 },
      },
      by_local: [],
      critical_alert: '',
    },
    waste: {
      total_waste: 0,
      total_sales: 10000,
      waste_percentage: 0,
      by_local: [],
      benchmark_comparison: '',
      underreporting_alert: false,
    },
    inventory: {
      by_month: [],
      by_product_top10: [],
      total_deviation_range: { min: 0, max: 0 },
      main_cause: '',
    },
    correlation: { scatter_data: [], correlation_exists: false, patterns_by_local: [] },
  }
}

describe('generateConclusions — BUG-C13: severidad de infrareporte', () => {
  it('merma de 0.01% debe generar conclusión CRITICAL (no medium)', () => {
    const inputs = emptyInputs()
    inputs.waste.waste_percentage = 0.01
    const result = generateConclusions(inputs)
    const wasteConcl = result.conclusions.find(
      (c) =>
        c.title.toLowerCase().includes('merma') ||
        c.title.toLowerCase().includes('infrareporte')
    )
    expect(wasteConcl).toBeDefined()
    expect(wasteConcl!.severity).toBe('critical')
  })

  it('merma de 0.8% debe generar conclusión medium', () => {
    const inputs = emptyInputs()
    inputs.waste.waste_percentage = 0.8
    const result = generateConclusions(inputs)
    const wasteConcl = result.conclusions.find(
      (c) =>
        c.title.toLowerCase().includes('merma') ||
        c.title.toLowerCase().includes('infrareporte')
    )
    expect(wasteConcl).toBeDefined()
    expect(wasteConcl!.severity).toBe('medium')
  })
})

describe('generateConclusions — BUG-C14: locales multi-riesgo con correlación', () => {
  it('locales multi-riesgo debe mostrarse TAMBIÉN cuando correlation_exists=true', () => {
    const inputs = emptyInputs()
    inputs.correlation.correlation_exists = true
    inputs.correlation.patterns_by_local = [
      {
        location: 'Local A',
        pattern: 'Descuadres de caja; Alto volumen facturas',
        strength: 75,
      },
    ]
    const result = generateConclusions(inputs)
    const multiRiskConcl = result.conclusions.find(
      (c) =>
        c.title.toLowerCase().includes('m\u00faltiples') ||
        c.title.toLowerCase().includes('multiples')
    )
    expect(multiRiskConcl).toBeDefined()
  })
})
