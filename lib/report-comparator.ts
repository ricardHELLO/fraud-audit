import type { ReportData } from './types/report'
import type {
  ComparisonResult,
  MetricDelta,
  LocalDelta,
  Trend,
} from './types/comparison'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const RISK_SEVERITY: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

function determineTrend(
  valueA: number,
  valueB: number,
  lowerIsBetter: boolean
): Trend {
  if (valueA === valueB) return 'stable'
  if (lowerIsBetter) {
    return valueB < valueA ? 'improving' : 'worsening'
  }
  return valueB > valueA ? 'improving' : 'worsening'
}

function buildMetricDelta(
  label: string,
  valueA: number,
  valueB: number,
  lowerIsBetter: boolean
): MetricDelta {
  const absolute = valueB - valueA
  const percentage = valueA !== 0 ? ((valueB - valueA) / Math.abs(valueA)) * 100 : null

  return {
    label,
    value_a: valueA,
    value_b: valueB,
    absolute_delta: absolute,
    percentage_delta: percentage !== null ? Math.round(percentage * 10) / 10 : null,
    trend: determineTrend(valueA, valueB, lowerIsBetter),
  }
}

/* ------------------------------------------------------------------ */
/*  Main comparator                                                    */
/* ------------------------------------------------------------------ */

export interface CompareReportsInput {
  reportA: ReportData
  reportB: ReportData
  metaA: { slug: string; created_at: string }
  metaB: { slug: string; created_at: string }
}

export function compareReports(input: CompareReportsInput): ComparisonResult {
  const { reportA, reportB, metaA, metaB } = input

  // --- Cash discrepancy delta ---
  const cashA = reportA.cash_discrepancy.locals.reduce(
    (sum, l) => sum + Math.abs(l.total_discrepancy),
    0
  )
  const cashB = reportB.cash_discrepancy.locals.reduce(
    (sum, l) => sum + Math.abs(l.total_discrepancy),
    0
  )

  // --- Deleted invoices deltas ---
  const invoicesCountA = reportA.deleted_invoices.total_count
  const invoicesCountB = reportB.deleted_invoices.total_count

  const invoicesAmountA = reportA.deleted_invoices.total_amount
  const invoicesAmountB = reportB.deleted_invoices.total_amount

  // --- Waste percentage delta ---
  const wasteA = reportA.waste_analysis.waste_percentage
  const wasteB = reportB.waste_analysis.waste_percentage

  // --- Risk level delta ---
  const riskA = reportA.summary.overall_risk_level
  const riskB = reportB.summary.overall_risk_level
  const riskSevA = RISK_SEVERITY[riskA] ?? 0
  const riskSevB = RISK_SEVERITY[riskB] ?? 0

  let riskTrend: Trend = 'stable'
  if (riskSevB < riskSevA) riskTrend = 'improving'
  if (riskSevB > riskSevA) riskTrend = 'worsening'

  // --- Per-local comparison ---
  const allLocations = new Set<string>()

  // Gather locations from cash_discrepancy
  for (const l of reportA.cash_discrepancy.locals) allLocations.add(l.name)
  for (const l of reportB.cash_discrepancy.locals) allLocations.add(l.name)

  const perLocal: LocalDelta[] = []
  for (const location of allLocations) {
    const cashLocalA = reportA.cash_discrepancy.locals.find(
      (l) => l.name === location
    )
    const cashLocalB = reportB.cash_discrepancy.locals.find(
      (l) => l.name === location
    )

    const invoiceLocalA = reportA.deleted_invoices.by_local.find(
      (l) => l.location === location
    )
    const invoiceLocalB = reportB.deleted_invoices.by_local.find(
      (l) => l.location === location
    )

    const wasteLocalA = reportA.waste_analysis.by_local.find(
      (l) => l.location === location
    )
    const wasteLocalB = reportB.waste_analysis.by_local.find(
      (l) => l.location === location
    )

    const presentInA = !!(cashLocalA || invoiceLocalA || wasteLocalA)
    const presentInB = !!(cashLocalB || invoiceLocalB || wasteLocalB)

    perLocal.push({
      location,
      cash_delta:
        Math.abs(cashLocalB?.total_discrepancy ?? 0) -
        Math.abs(cashLocalA?.total_discrepancy ?? 0),
      invoices_count_delta:
        (invoiceLocalB?.count ?? 0) - (invoiceLocalA?.count ?? 0),
      waste_delta:
        (wasteLocalB?.waste_percentage ?? 0) -
        (wasteLocalA?.waste_percentage ?? 0),
      present_in_a: presentInA,
      present_in_b: presentInB,
    })
  }

  // Sort: locations present in both first, then by absolute cash delta
  perLocal.sort((a, b) => {
    const bothA = a.present_in_a && a.present_in_b ? 0 : 1
    const bothB = b.present_in_a && b.present_in_b ? 0 : 1
    if (bothA !== bothB) return bothA - bothB
    return Math.abs(b.cash_delta) - Math.abs(a.cash_delta)
  })

  return {
    report_a: {
      slug: metaA.slug,
      org_name: reportA.summary.organization_name,
      period: reportA.summary.analysis_period,
      created_at: metaA.created_at,
    },
    report_b: {
      slug: metaB.slug,
      org_name: reportB.summary.organization_name,
      period: reportB.summary.analysis_period,
      created_at: metaB.created_at,
    },
    deltas: {
      cash_discrepancy: buildMetricDelta(
        'Descuadre de caja',
        cashA,
        cashB,
        true // lower is better
      ),
      deleted_invoices_count: buildMetricDelta(
        'Facturas eliminadas',
        invoicesCountA,
        invoicesCountB,
        true
      ),
      deleted_invoices_amount: buildMetricDelta(
        'Importe eliminado',
        invoicesAmountA,
        invoicesAmountB,
        true
      ),
      waste_percentage: buildMetricDelta(
        'Merma (%)',
        wasteA,
        wasteB,
        true
      ),
      risk_level: {
        from: riskA,
        to: riskB,
        trend: riskTrend,
      },
    },
    per_local: perLocal,
  }
}
