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
  // BIZ-01: el umbral CRÍTICO está unificado con conclusions.ts en 1000€.
  // Estos tests usan valores explícitamente por encima (1500) para
  // disparar CRÍTICA; los cambios de umbral requieren actualizar esos
  // valores en lockstep.
  it('BUG-C01: debe alertar CRÍTICA cuando un sobrante supera 1000€', () => {
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
    // BIZ-01: antes de unificar el umbral, -800 disparaba CRÍTICA. Con
    // umbral 1000 hace falta -1500 para seguir testeando el mismo caso.
    const sales = [makeSale('Local A', -1500)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).toContain('CRÍTICA')
  })

  it('worst_local con faltante grande y sobrante pequeño apunta al faltante', () => {
    const sales = [
      makeSale('Local A', -800),  // faltante grande (pero no CRÍTICO tras BIZ-01)
      makeSale('Local B', 200),   // sobrante pequeño
    ]
    const result = calculateCashDiscrepancy(sales)
    // Test de ordenación — no depende del umbral crítico; sigue válido.
    expect(result.worst_local).toBe('Local A')
  })

  it('BIZ-01: descuadre de 600€ NO debe ser "CRÍTICO" (entre los dos umbrales 200/1000)', () => {
    // Regresión contra el caso que disparó BIZ-01: un descuadre en la
    // zona gris 500-1000€ ya no debe decir "CRÍTICA". Queda como
    // "ALERTA" moderada, coherente con conclusions.ts.
    const sales = [makeSale('Local A', 600)]
    const result = calculateCashDiscrepancy(sales)
    expect(result.alert_message).not.toContain('CRÍTICA')
    expect(result.alert_message).toContain('ALERTA')
  })
})
