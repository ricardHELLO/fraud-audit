import { describe, it, expect } from 'vitest'
import {
  pseudonymizeReportData,
  depseudonymizeInsights,
  POST_PROCESS_PSEUDONYM_REGEX,
} from '@/lib/privacy/pseudonymize'
import type { ReportData } from '@/lib/types/report'
import type { AIInsights } from '@/lib/types/ai-insights'

/**
 * B3 — PII pseudonymization contract.
 *
 * These tests lock in the round-trip contract:
 *   real-name -> pseudonym -> LLM call -> pseudonym -> real-name
 *
 * Any regression that leaks a real employee name into the LLM payload, or
 * fails to restore the name on the way back, must fail this suite.
 */

function baseReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    summary: {
      organization_name: 'Restaurante Demo',
      analysis_period: '2026-Q1',
      locations_count: 2,
      overall_risk_level: 'medium',
      key_findings: [],
    },
    cash_discrepancy: {
      locals: [],
      worst_local: 'Local A',
      alert_message: '',
    },
    deleted_invoices: {
      by_local: [],
      by_employee: [],
      total_count: 0,
      total_amount: 0,
      concentration_alert: '',
    },
    deleted_products: {
      total_eliminated: 0,
      by_phase: {
        before_kitchen: { count: 0, amount: 0 },
        after_kitchen: { count: 0, amount: 0 },
        after_billing: { count: 0, amount: 0 },
      },
      by_local: [],
      critical_alert: '',
    },
    waste_analysis: {
      total_waste: 0,
      total_sales: 0,
      waste_percentage: 0,
      by_local: [],
      benchmark_comparison: '',
      underreporting_alert: false,
    },
    inventory_deviation: {
      by_month: [],
      by_product_top10: [],
      total_deviation_range: { min: 0, max: 0 },
      main_cause: '',
    },
    correlation: {
      scatter_data: [],
      correlation_exists: false,
      patterns_by_local: [],
    },
    conclusions: {
      conclusions: [],
      immediate_actions: [],
      structural_actions: [],
    },
    ...overrides,
  }
}

describe('pseudonymizeReportData', () => {
  it('replaces employee names with __EMP_N__ tokens in insertion order', () => {
    const input = baseReportData({
      deleted_invoices: {
        by_local: [],
        by_employee: [
          { employee: 'Juan García', location: 'Local A', count: 5, amount: 120 },
          { employee: 'María López', location: 'Local B', count: 3, amount: 80 },
        ],
        total_count: 8,
        total_amount: 200,
        concentration_alert: '',
      },
    })

    const { pseudonymized, reverseMap } = pseudonymizeReportData(input)

    expect(pseudonymized.deleted_invoices.by_employee[0].employee).toBe('__EMP_1__')
    expect(pseudonymized.deleted_invoices.by_employee[1].employee).toBe('__EMP_2__')
    expect(reverseMap.get('__EMP_1__')).toBe('Juan García')
    expect(reverseMap.get('__EMP_2__')).toBe('María López')
  })

  it('does NOT mutate the original reportData', () => {
    const input = baseReportData({
      deleted_invoices: {
        by_local: [],
        by_employee: [
          { employee: 'Juan García', location: 'Local A', count: 5, amount: 120 },
        ],
        total_count: 5,
        total_amount: 120,
        concentration_alert: '',
      },
    })

    pseudonymizeReportData(input)

    expect(input.deleted_invoices.by_employee[0].employee).toBe('Juan García')
  })

  it('reuses the same pseudonym for duplicate employee names', () => {
    const input = baseReportData({
      deleted_invoices: {
        by_local: [],
        by_employee: [
          { employee: 'Juan García', location: 'Local A', count: 5, amount: 120 },
          { employee: 'Juan García', location: 'Local B', count: 2, amount: 40 },
        ],
        total_count: 7,
        total_amount: 160,
        concentration_alert: '',
      },
    })

    const { pseudonymized, reverseMap } = pseudonymizeReportData(input)

    expect(pseudonymized.deleted_invoices.by_employee[0].employee).toBe('__EMP_1__')
    expect(pseudonymized.deleted_invoices.by_employee[1].employee).toBe('__EMP_1__')
    expect(reverseMap.size).toBe(1)
  })

  it('normalizes surrounding whitespace when deduplicating', () => {
    const input = baseReportData({
      deleted_invoices: {
        by_local: [],
        by_employee: [
          { employee: 'Juan García', location: 'Local A', count: 5, amount: 120 },
          { employee: 'Juan García ', location: 'Local B', count: 2, amount: 40 },
        ],
        total_count: 7,
        total_amount: 160,
        concentration_alert: '',
      },
    })

    const { pseudonymized, reverseMap } = pseudonymizeReportData(input)

    expect(pseudonymized.deleted_invoices.by_employee[0].employee).toBe('__EMP_1__')
    expect(pseudonymized.deleted_invoices.by_employee[1].employee).toBe('__EMP_1__')
    expect(reverseMap.size).toBe(1)
  })

  it('substitutes scatter_data.label ONLY when it matches a known employee name', () => {
    const input = baseReportData({
      deleted_invoices: {
        by_local: [],
        by_employee: [
          { employee: 'Juan García', location: 'Local A', count: 5, amount: 120 },
        ],
        total_count: 5,
        total_amount: 120,
        concentration_alert: '',
      },
      correlation: {
        scatter_data: [
          { x: 10, y: 20, label: 'Juan García' }, // known employee -> substitute
          { x: 30, y: 40, label: 'Local A' }, // location, NOT in map -> leave as-is
          { x: 50, y: 60, label: 'Sin personal asignado' }, // generic -> leave as-is
        ],
        correlation_exists: true,
        patterns_by_local: [],
      },
    })

    const { pseudonymized, reverseMap } = pseudonymizeReportData(input)

    expect(pseudonymized.correlation.scatter_data[0].label).toBe('__EMP_1__')
    expect(pseudonymized.correlation.scatter_data[1].label).toBe('Local A')
    expect(pseudonymized.correlation.scatter_data[2].label).toBe('Sin personal asignado')
    // reverseMap still has only one entry — scatter_data never MINTS new pseudonyms.
    expect(reverseMap.size).toBe(1)
  })

  it('leaves empty/whitespace-only employee strings untouched', () => {
    const input = baseReportData({
      deleted_invoices: {
        by_local: [],
        by_employee: [
          { employee: '', location: 'Local A', count: 1, amount: 10 },
          { employee: '   ', location: 'Local B', count: 1, amount: 10 },
        ],
        total_count: 2,
        total_amount: 20,
        concentration_alert: '',
      },
    })

    const { pseudonymized, reverseMap } = pseudonymizeReportData(input)

    expect(pseudonymized.deleted_invoices.by_employee[0].employee).toBe('')
    expect(pseudonymized.deleted_invoices.by_employee[1].employee).toBe('   ')
    expect(reverseMap.size).toBe(0)
  })
})

describe('depseudonymizeInsights', () => {
  it('restores real names across narrative, recommendations, and anomalies', () => {
    const reverseMap = new Map([
      ['__EMP_1__', 'Juan García'],
      ['__EMP_2__', 'María López'],
    ])

    const insights: AIInsights = {
      narrative: '__EMP_1__ eliminó 12 facturas y __EMP_2__ 5.',
      recommendations: [
        {
          title: 'Revisar a __EMP_1__',
          description: 'El empleado __EMP_1__ concentra el 80% de eliminaciones',
          priority: 'high',
          category: 'immediate',
        },
      ],
      anomalies: [
        {
          title: 'Concentración en __EMP_2__',
          description: 'Pico de cancelaciones en caja de __EMP_2__',
          severity: 'medium',
          affected_area: 'Caja (__EMP_2__)',
        },
      ],
      generated_at: '2026-04-20T12:00:00.000Z',
    }

    const restored = depseudonymizeInsights(insights, reverseMap)

    expect(restored.narrative).toBe('Juan García eliminó 12 facturas y María López 5.')
    expect(restored.recommendations[0].title).toBe('Revisar a Juan García')
    expect(restored.recommendations[0].description).toContain('Juan García')
    expect(restored.anomalies[0].title).toBe('Concentración en María López')
    expect(restored.anomalies[0].affected_area).toBe('Caja (María López)')
  })

  it('leaves unknown pseudonyms untouched (hallucination case)', () => {
    const reverseMap = new Map([['__EMP_1__', 'Juan García']])

    const insights: AIInsights = {
      narrative: '__EMP_1__ y también __EMP_99__ son sospechosos.',
      recommendations: [],
      anomalies: [],
      generated_at: '2026-04-20T12:00:00.000Z',
    }

    const restored = depseudonymizeInsights(insights, reverseMap)

    expect(restored.narrative).toContain('Juan García')
    // __EMP_99__ is not in the reverseMap — must remain so the leak regex can
    // flag it in telemetry (see POST_PROCESS_PSEUDONYM_REGEX usage).
    expect(restored.narrative).toContain('__EMP_99__')
  })
})

describe('POST_PROCESS_PSEUDONYM_REGEX', () => {
  it('matches every __EMP_N__ token in a string', () => {
    const haystack = 'Ha pasado __EMP_1__ y luego __EMP_42__ pero no _EMP_3_.'
    const matches = haystack.match(POST_PROCESS_PSEUDONYM_REGEX)
    expect(matches).toEqual(['__EMP_1__', '__EMP_42__'])
  })
})
