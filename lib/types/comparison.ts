export type Trend = 'improving' | 'worsening' | 'stable'

export interface MetricDelta {
  label: string
  value_a: number
  value_b: number
  absolute_delta: number
  percentage_delta: number | null
  trend: Trend
}

export interface LocalDelta {
  location: string
  cash_delta: number
  invoices_count_delta: number
  waste_delta: number
  present_in_a: boolean
  present_in_b: boolean
}

export interface ComparisonResult {
  report_a: { slug: string; org_name: string; period: string; created_at: string }
  report_b: { slug: string; org_name: string; period: string; created_at: string }
  deltas: {
    cash_discrepancy: MetricDelta
    deleted_invoices_count: MetricDelta
    deleted_invoices_amount: MetricDelta
    waste_percentage: MetricDelta
    risk_level: { from: string; to: string; trend: Trend }
  }
  per_local: LocalDelta[]
}
