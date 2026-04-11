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
  it('BUG-C01: debe alertar CRÍTICA cuando un sobrante supera 500€', () => {
    const sales = [makeSale('Local A', 1500)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).toContain('CRÍTICA')
  })

  it('BUG-C02: worst_local debe ser el local con mayor Math.abs(discrepancy)', () => {
    const sales = [
      makeSale('Local A', 200),   // sobrante pequeño
      makeSale('Local B', 1500),  // sobrante grande → debe ser el peor
    ]
    const result = calculateCashDiscrepancy(sales)
    expect(result.worst_local).toBe('Local B')
  })

  it('BUG-C11: alerta CRÍTICA no debe decir "rangos normales" con sobrante de 1500€', () => {
    const sales = [makeSale('Local A', 1500)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).not.toContain('rangos normales')
  })

  it('faltante grande también debe alertar CRÍTICA', () => {
    const sales = [makeSale('Local A', -800)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).toContain('CRÍTICA')
  })

  it('worst_local con faltante grande y sobrante pequeño apunta al faltante', () => {
    const sales = [
      makeSale('Local A', -800),  // faltante grande
      makeSale('Local B', 200),   // sobrante pequeño
    ]
    const result = calculateCashDiscrepancy(sales)
    expect(result.worst_local).toBe('Local A')
  })
})
