import { describe, it, expect } from 'vitest'
import { calculateInventoryDeviation } from '@/lib/calculators/inventory-deviation'
import type { NormalizedInventoryDeviation } from '@/lib/types/normalized'

function makeDeviation(
  month: string,
  product: string,
  deviation: number
): NormalizedInventoryDeviation {
  return {
    month,
    location: 'Local A',
    product_name: product,
    theoretical_consumption: 100,
    actual_consumption: 100 + deviation,
    deviation,
    unit: 'kg',
  }
}

describe('calculateInventoryDeviation — BUG-C06: deviaciones opuestas', () => {
  it('+500 y -500 en el mismo mes: total_deviation=1000, net_deviation=0', () => {
    const deviations = [
      makeDeviation('2024-01', 'Aceite', 500),
      makeDeviation('2024-01', 'Aceite', -500),
    ]
    const result = calculateInventoryDeviation(deviations)
    expect(result.by_month[0].total_deviation).toBe(1000)
    expect(result.by_month[0].net_deviation).toBe(0)
  })

  it('desviaciones en la misma dirección: total y net coinciden', () => {
    const deviations = [
      makeDeviation('2024-01', 'Aceite', 200),
      makeDeviation('2024-01', 'Sal', 300),
    ]
    const result = calculateInventoryDeviation(deviations)
    expect(result.by_month[0].total_deviation).toBe(500)
    expect(result.by_month[0].net_deviation).toBe(500)
  })
})

describe('calculateInventoryDeviation — BUG-C07: mainCause cuando todo es 0', () => {
  it('con todas las desviaciones a 0 debe decir "Sin desviaciones", no "distribuidas"', () => {
    const deviations = [
      makeDeviation('2024-01', 'Aceite', 0),
      makeDeviation('2024-01', 'Sal', 0),
    ]
    const result = calculateInventoryDeviation(deviations)
    expect(result.main_cause).toContain('Sin desviaciones')
    expect(result.main_cause).not.toContain('distribuidas')
  })

  it('sin datos: main_cause dice "Sin desviaciones"', () => {
    const result = calculateInventoryDeviation([])
    expect(result.main_cause).toContain('Sin desviaciones')
  })
})
