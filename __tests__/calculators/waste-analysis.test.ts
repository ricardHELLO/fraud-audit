import { describe, it, expect } from 'vitest'
import { calculateWasteAnalysis } from '@/lib/calculators/waste-analysis'
import type { NormalizedWaste, NormalizedDailySales } from '@/lib/types/normalized'

function makeWaste(totalCost: number): NormalizedWaste {
  return {
    id: 'w1',
    date: '2024-01-01',
    location: 'Local A',
    product_name: 'Producto X',
    quantity: 1,
    unit: 'ud',
    unit_cost: totalCost,
    total_cost: totalCost,
  }
}

function makeSale(netSales: number): NormalizedDailySales {
  return {
    date: '2024-01-01',
    location: 'Local A',
    gross_sales: netSales,
    net_sales: netSales,
    expected_cash: 0,
    actual_cash: 0,
    cash_discrepancy: 0,
  }
}

describe('calculateWasteAnalysis — BUG-C15: boundary exacto en benchmark', () => {
  it('2.5% exacto debe clasificarse como "Por debajo del benchmark"', () => {
    // 25€ waste / 1000€ sales = 2.5%
    const result = calculateWasteAnalysis([makeWaste(25)], [makeSale(1000)])
    expect(result.waste_percentage).toBe(2.5)
    expect(result.benchmark_comparison).toBe('Por debajo del benchmark')
  })

  it('2.6% debe clasificarse como "En línea con el benchmark"', () => {
    const result = calculateWasteAnalysis([makeWaste(26)], [makeSale(1000)])
    expect(result.waste_percentage).toBe(2.6)
    expect(result.benchmark_comparison).toBe('En l\u00ednea con el benchmark')
  })

  it('3.6% debe clasificarse como "Por encima del benchmark"', () => {
    const result = calculateWasteAnalysis([makeWaste(36)], [makeSale(1000)])
    expect(result.waste_percentage).toBe(3.6)
    expect(result.benchmark_comparison).toBe('Por encima del benchmark')
  })
})
