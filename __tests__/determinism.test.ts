import { describe, it, expect } from 'vitest'
import { calculateCashDiscrepancy } from '@/lib/calculators/cash-discrepancy'
import { calculateInventoryDeviation } from '@/lib/calculators/inventory-deviation'
import type { NormalizedDailySales } from '@/lib/types/normalized'
import type { NormalizedInventoryDeviation } from '@/lib/types/normalized'

// ============================================================
// Determinism Tests
//
// These tests verify that each calculator produces IDENTICAL
// results when run multiple times with the same input.
// This is critical for a financial audit tool where
// non-deterministic results would undermine trust.
// ============================================================

describe('Determinism — Cash Discrepancy Calculator', () => {
  const sampleSales: NormalizedDailySales[] = [
    { date: '2024-01-01', location: 'Madrid Centro', gross_sales: 1000, net_sales: 900, expected_cash: 500, actual_cash: 480, cash_discrepancy: -20 },
    { date: '2024-01-02', location: 'Madrid Centro', gross_sales: 1200, net_sales: 1100, expected_cash: 600, actual_cash: 595, cash_discrepancy: -5 },
    { date: '2024-01-01', location: 'Barcelona', gross_sales: 800, net_sales: 700, expected_cash: 400, actual_cash: 350, cash_discrepancy: -50 },
    { date: '2024-01-02', location: 'Barcelona', gross_sales: 900, net_sales: 800, expected_cash: 450, actual_cash: 440, cash_discrepancy: -10 },
    { date: '2024-01-03', location: 'Barcelona', gross_sales: 950, net_sales: 850, expected_cash: 475, actual_cash: 200, cash_discrepancy: -275 },
  ]

  it('produces identical results on repeated runs', () => {
    const result1 = calculateCashDiscrepancy(sampleSales)
    const result2 = calculateCashDiscrepancy(sampleSales)
    const result3 = calculateCashDiscrepancy(sampleSales)

    expect(result1).toEqual(result2)
    expect(result2).toEqual(result3)
  })

  it('sorts locals deterministically by discrepancy then by name', () => {
    const result = calculateCashDiscrepancy(sampleSales)

    // Barcelona has more negative total (-335) than Madrid Centro (-25)
    expect(result.locals[0].name).toBe('Barcelona')
    expect(result.locals[1].name).toBe('Madrid Centro')
    expect(result.worst_local).toBe('Barcelona')
  })

  it('tiebreaker: two locals with same discrepancy sort by name', () => {
    const tiedSales: NormalizedDailySales[] = [
      { date: '2024-01-01', location: 'Zaragoza', gross_sales: 1000, net_sales: 900, expected_cash: 500, actual_cash: 450, cash_discrepancy: -50 },
      { date: '2024-01-01', location: 'Almería', gross_sales: 1000, net_sales: 900, expected_cash: 500, actual_cash: 450, cash_discrepancy: -50 },
    ]

    const result = calculateCashDiscrepancy(tiedSales)

    // Same discrepancy → alphabetical: Almería before Zaragoza
    expect(result.locals[0].name).toBe('Almería')
    expect(result.locals[1].name).toBe('Zaragoza')
  })

  it('computes correct alert severity', () => {
    const result = calculateCashDiscrepancy(sampleSales)
    // Barcelona has -335 which is > MODERATE_SHORTAGE_THRESHOLD (200)
    expect(result.alert_message).toContain('ALERTA')
  })

  it('handles empty input', () => {
    const result = calculateCashDiscrepancy([])
    expect(result.locals).toEqual([])
    expect(result.worst_local).toBe('Sin datos')
  })
})

describe('Determinism — Inventory Deviation Calculator', () => {
  const sampleDeviations: NormalizedInventoryDeviation[] = [
    { month: '2024-01', location: 'Madrid', product_name: 'Cerveza', theoretical_consumption: 100, actual_consumption: 120, deviation: 20, unit: 'L' },
    { month: '2024-01', location: 'Madrid', product_name: 'Vino', theoretical_consumption: 50, actual_consumption: 55, deviation: 5, unit: 'L' },
    { month: '2024-02', location: 'Madrid', product_name: 'Cerveza', theoretical_consumption: 110, actual_consumption: 140, deviation: 30, unit: 'L' },
    { month: '2024-02', location: 'Madrid', product_name: 'Vino', theoretical_consumption: 60, actual_consumption: 65, deviation: 5, unit: 'L' },
    { month: '2024-01', location: 'Barcelona', product_name: 'Cerveza', theoretical_consumption: 80, actual_consumption: 85, deviation: 5, unit: 'L' },
  ]

  it('produces identical results on repeated runs', () => {
    const result1 = calculateInventoryDeviation(sampleDeviations)
    const result2 = calculateInventoryDeviation(sampleDeviations)
    const result3 = calculateInventoryDeviation(sampleDeviations)

    expect(result1).toEqual(result2)
    expect(result2).toEqual(result3)
  })

  it('sorts products by deviation descending, tiebreaker by name', () => {
    const result = calculateInventoryDeviation(sampleDeviations)

    // Cerveza: 20+30+5=55, Vino: 5+5=10
    expect(result.by_product_top10[0].product_name).toBe('Cerveza')
    expect(result.by_product_top10[0].total_deviation).toBe(55)
    expect(result.by_product_top10[1].product_name).toBe('Vino')
    expect(result.by_product_top10[1].total_deviation).toBe(10)
  })

  it('sorts months chronologically', () => {
    const result = calculateInventoryDeviation(sampleDeviations)

    expect(result.by_month[0].month).toBe('2024-01')
    expect(result.by_month[1].month).toBe('2024-02')
  })

  it('identifies dominant product as main cause', () => {
    const result = calculateInventoryDeviation(sampleDeviations)

    // Cerveza = 55 / 65 total = 84.6% > 30% threshold
    expect(result.main_cause).toContain('Cerveza')
    expect(result.main_cause).toContain('dominante')
  })

  it('tiebreaker: two products with same deviation sort by name', () => {
    const tiedDeviations: NormalizedInventoryDeviation[] = [
      { month: '2024-01', location: 'Madrid', product_name: 'Zumo', theoretical_consumption: 100, actual_consumption: 110, deviation: 10, unit: 'L' },
      { month: '2024-01', location: 'Madrid', product_name: 'Agua', theoretical_consumption: 100, actual_consumption: 110, deviation: 10, unit: 'L' },
    ]

    const result = calculateInventoryDeviation(tiedDeviations)

    // Same deviation → alphabetical: Agua before Zumo
    expect(result.by_product_top10[0].product_name).toBe('Agua')
    expect(result.by_product_top10[1].product_name).toBe('Zumo')
  })

  it('handles empty input', () => {
    const result = calculateInventoryDeviation([])
    expect(result.by_month).toEqual([])
    expect(result.by_product_top10).toEqual([])
    expect(result.total_deviation_range).toEqual({ min: 0, max: 0 })
  })

  it('limits to top 10 products', () => {
    // Create 15 unique products
    const manyProducts: NormalizedInventoryDeviation[] = Array.from(
      { length: 15 },
      (_, i) => ({
        month: '2024-01',
        location: 'Madrid',
        product_name: `Product_${String(i).padStart(2, '0')}`,
        theoretical_consumption: 100,
        actual_consumption: 100 + (15 - i), // Different deviations so sorting is deterministic
        deviation: 15 - i,
        unit: 'kg',
      })
    )

    const result = calculateInventoryDeviation(manyProducts)
    expect(result.by_product_top10).toHaveLength(10)
    // First product should have the highest deviation
    expect(result.by_product_top10[0].total_deviation).toBe(15)
  })
})
