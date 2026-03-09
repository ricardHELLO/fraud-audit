import type { ReportData } from './types/report'
import type { AlertMetric, AlertOperator, AlertRule, TriggeredAlert } from './types/alerts'
import { RISK_LEVEL_VALUES } from './types/alerts'

/**
 * Extract a numeric value from ReportData for a given metric.
 */
export function extractMetricValue(
  reportData: ReportData,
  metric: AlertMetric
): number {
  switch (metric) {
    case 'cash_discrepancy': {
      // Sum of absolute discrepancies across all locals
      return reportData.cash_discrepancy.locals.reduce(
        (sum, local) => sum + Math.abs(local.total_discrepancy),
        0
      )
    }
    case 'deleted_invoices_count': {
      return reportData.deleted_invoices.total_count
    }
    case 'waste_percentage': {
      return reportData.waste_analysis.waste_percentage
    }
    case 'risk_level': {
      return RISK_LEVEL_VALUES[reportData.summary.overall_risk_level] ?? 0
    }
    default:
      return 0
  }
}

/**
 * Evaluate a single condition: actual <operator> threshold.
 */
export function evaluateCondition(
  actual: number,
  operator: AlertOperator,
  threshold: number
): boolean {
  switch (operator) {
    case 'gt':
      return actual > threshold
    case 'gte':
      return actual >= threshold
    case 'lt':
      return actual < threshold
    case 'lte':
      return actual <= threshold
    case 'eq':
      // Use epsilon comparison to handle floating-point precision
      return Math.abs(actual - threshold) < 0.01
    default:
      return false
  }
}

/**
 * Evaluate all active alert rules against a report and return triggered alerts.
 */
export function evaluateAlerts(
  rules: AlertRule[],
  reportData: ReportData
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = []

  for (const rule of rules) {
    if (!rule.is_active) continue

    const actualValue = extractMetricValue(reportData, rule.metric)
    const isTriggered = evaluateCondition(
      actualValue,
      rule.operator,
      rule.threshold
    )

    if (isTriggered) {
      triggered.push({
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        threshold: rule.threshold,
        actualValue,
      })
    }
  }

  return triggered
}
