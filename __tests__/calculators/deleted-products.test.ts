import { describe, it, expect } from 'vitest'
import { calculateDeletedProducts } from '@/lib/calculators/deleted-products'
import type { NormalizedDeletedProduct } from '@/lib/types/normalized'

type Phase = NormalizedDeletedProduct['phase']

function makeProduct(
  location: string,
  phase: Phase,
  total_amount: number,
  id = Math.random().toString(36).slice(2)
): NormalizedDeletedProduct {
  return {
    id,
    date: '2026-03-01',
    location,
    employee: 'Ana',
    product_name: 'Plato X',
    quantity: 1,
    unit_price: total_amount,
    total_amount,
    phase,
  }
}

describe('calculateDeletedProducts — edge cases', () => {
  it('empty input returns zeroed totals, empty locals and no critical alert', () => {
    const result = calculateDeletedProducts([])
    expect(result.total_eliminated).toBe(0)
    expect(result.by_local).toEqual([])
    expect(result.by_phase.before_kitchen).toEqual({ count: 0, amount: 0 })
    expect(result.by_phase.after_kitchen).toEqual({ count: 0, amount: 0 })
    expect(result.by_phase.after_billing).toEqual({ count: 0, amount: 0 })
    expect(result.critical_alert).toBe('')
  })

  it('does not fire the critical alert at the 20% boundary', () => {
    // 1 of 5 eliminated after_billing = exactly 20% → threshold is strictly greater than 0.2
    const products: NormalizedDeletedProduct[] = [
      ...Array.from({ length: 4 }, () => makeProduct('Local A', 'before_kitchen', 10)),
      makeProduct('Local A', 'after_billing', 10),
    ]
    const result = calculateDeletedProducts(products)
    expect(result.total_eliminated).toBe(5)
    expect(result.by_phase.after_billing.count).toBe(1)
    expect(result.critical_alert).toBe('')
  })

  it('fires the critical alert when after_billing ratio exceeds 20%', () => {
    // 3 of 10 (30%) after_billing → should alert
    const products: NormalizedDeletedProduct[] = [
      ...Array.from({ length: 7 }, () => makeProduct('Local A', 'before_kitchen', 10)),
      ...Array.from({ length: 3 }, () => makeProduct('Local A', 'after_billing', 10)),
    ]
    const result = calculateDeletedProducts(products)
    expect(result.critical_alert).toContain('30%')
    expect(result.critical_alert).not.toBe('')
  })

  it('by_local sorts by amount desc and breaks ties alphabetically', () => {
    const products: NormalizedDeletedProduct[] = [
      makeProduct('Zeta', 'before_kitchen', 50),
      makeProduct('Alfa', 'before_kitchen', 50),
      makeProduct('Beta', 'before_kitchen', 100),
    ]
    const result = calculateDeletedProducts(products)
    expect(result.by_local.map((l) => l.location)).toEqual(['Beta', 'Alfa', 'Zeta'])
  })

  it('computes after_billing_percentage per location independently', () => {
    const products: NormalizedDeletedProduct[] = [
      // Local A: 1 of 4 after_billing = 25%
      makeProduct('Local A', 'before_kitchen', 10),
      makeProduct('Local A', 'before_kitchen', 10),
      makeProduct('Local A', 'before_kitchen', 10),
      makeProduct('Local A', 'after_billing', 10),
      // Local B: 0 of 2 after_billing = 0%
      makeProduct('Local B', 'after_kitchen', 10),
      makeProduct('Local B', 'before_kitchen', 10),
    ]
    const result = calculateDeletedProducts(products)
    const a = result.by_local.find((l) => l.location === 'Local A')
    const b = result.by_local.find((l) => l.location === 'Local B')
    expect(a?.after_billing_percentage).toBe(25)
    expect(b?.after_billing_percentage).toBe(0)
  })
})
