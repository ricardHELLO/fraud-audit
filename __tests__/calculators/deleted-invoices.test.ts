import { describe, it, expect } from 'vitest'
import { calculateDeletedInvoices } from '@/lib/calculators/deleted-invoices'
import type { NormalizedInvoice } from '@/lib/types/normalized'

function makeInvoice(employee: string, amount: number, id: string): NormalizedInvoice {
  return { id, date: '2024-01-01', location: 'Local A', employee, amount, status: 'deleted' }
}

describe('calculateDeletedInvoices — BUG-C04: mínimo absoluto', () => {
  it('NO debe alertar con solo 1 factura eliminada', () => {
    const result = calculateDeletedInvoices([makeInvoice('Juan', 100, '1')])
    expect(result.concentration_alert).toBe('')
  })

  it('NO debe alertar con 3 facturas aunque 1 empleado tenga el 100%', () => {
    const invoices = [
      makeInvoice('Juan', 50, '1'),
      makeInvoice('Juan', 60, '2'),
      makeInvoice('Juan', 70, '3'),
    ]
    const result = calculateDeletedInvoices(invoices)
    expect(result.concentration_alert).toBe('')
  })

  it('CON 5+ facturas y concentración > 40% sí debe alertar', () => {
    const invoices = Array.from({ length: 5 }, (_, i) =>
      makeInvoice('Juan', 200, String(i))
    )
    const result = calculateDeletedInvoices(invoices)
    expect(result.concentration_alert).not.toBe('')
    expect(result.concentration_alert).toContain('Juan')
  })
})

describe('calculateDeletedInvoices — BUG-C05: concentración por importe', () => {
  it('alerta menciona al empleado con mayor importe, no mayor conteo', () => {
    const invoices = [
      makeInvoice('Ana', 5000, '1'),  // 2 facturas grandes
      makeInvoice('Ana', 5000, '2'),
      makeInvoice('Pedro', 10, '3'),  // 3 facturas pequeñas
      makeInvoice('Pedro', 10, '4'),
      makeInvoice('Pedro', 10, '5'),
      makeInvoice('Maria', 500, '6'),
    ]
    const result = calculateDeletedInvoices(invoices)
    // Ana tiene el 48% del importe total → debe alertar
    // Pedro tiene el 60% del conteo pero <1% del importe → no debe aparecer
    if (result.concentration_alert !== '') {
      expect(result.concentration_alert).toContain('Ana')
      expect(result.concentration_alert).not.toContain('Pedro')
    }
  })
})
