import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BIZ-04 — no-touch calculators rule must live in the production prompt.
 *
 * Why parse the source instead of importing SYSTEM_PROMPT:
 * - SYSTEM_PROMPT is intentionally not exported (keeps the module's public
 *   surface minimal). Exporting just for tests would be an anti-pattern.
 * - Reading the source via readFileSync is the cheapest, most robust way to
 *   guarantee the prompt contract cannot be silently removed in a refactor.
 *
 * If any of these assertions fails, CI blocks the merge and forces a human
 * review of why the integrity rules were changed.
 */
describe('BIZ-04: system prompt integrity rules', () => {
  const source = readFileSync(
    join(process.cwd(), 'lib', 'ai-insights-generator.ts'),
    'utf8'
  )

  it('contains the REGLAS DE INTEGRIDAD NUMERICA header', () => {
    expect(source).toContain('REGLAS DE INTEGRIDAD NUMERICA')
  })

  it('forbids recomputation explicitly', () => {
    expect(source).toMatch(/NUNCA recalcules/i)
  })

  it('names the calculators as the only source of truth', () => {
    expect(source).toMatch(/UNICA fuente de verdad numerica/i)
  })

  it('forbids fabricating data not present in ReportData', () => {
    expect(source).toMatch(/NO lo inventes/i)
  })

  it('forbids approximations like ~ or aprox', () => {
    // The prompt must call out approximation patterns as prohibited.
    expect(source).toMatch(/~1\.250|aprox\./i)
  })

  it('enumerates every calculator name so the LLM knows the full set', () => {
    const calculators = [
      'cash_discrepancy',
      'deleted_invoices',
      'deleted_products',
      'waste_analysis',
      'inventory_deviation',
      'correlation',
      'conclusions',
    ]
    for (const c of calculators) {
      expect(source).toContain(c)
    }
  })

  it('blocks benchmarks / seasonality inference', () => {
    expect(source).toMatch(/benchmarks/i)
    expect(source).toMatch(/estacionalidad/i)
  })

  it('handles zero/null fields as "sin datos suficientes" instead of fabrication', () => {
    expect(source).toMatch(/0 o null/)
    expect(source).toMatch(/sin datos suficientes/)
  })
})
