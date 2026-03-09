export type AlertMetric =
  | 'cash_discrepancy'
  | 'deleted_invoices_count'
  | 'waste_percentage'
  | 'risk_level'

export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq'

export interface AlertRule {
  id: string
  user_id: string
  name: string
  metric: AlertMetric
  operator: AlertOperator
  threshold: number
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
}

export interface TriggeredAlert {
  ruleId: string
  ruleName: string
  metric: AlertMetric
  threshold: number
  actualValue: number
}

// Labels in Spanish for the UI
export const METRIC_LABELS: Record<AlertMetric, string> = {
  cash_discrepancy: 'Descuadre de caja (€)',
  deleted_invoices_count: 'Facturas eliminadas (cantidad)',
  waste_percentage: 'Porcentaje de merma (%)',
  risk_level: 'Nivel de riesgo',
}

export const OPERATOR_LABELS: Record<AlertOperator, string> = {
  gt: 'Mayor que',
  gte: 'Mayor o igual que',
  lt: 'Menor que',
  lte: 'Menor o igual que',
  eq: 'Igual a',
}

export const RISK_LEVEL_VALUES: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

export const RISK_LEVEL_LABELS: Record<number, string> = {
  1: 'Bajo',
  2: 'Medio',
  3: 'Alto',
  4: 'Critico',
}

export const VALID_METRICS: AlertMetric[] = [
  'cash_discrepancy',
  'deleted_invoices_count',
  'waste_percentage',
  'risk_level',
]

export const VALID_OPERATORS: AlertOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq']

export const MAX_ALERT_RULES_PER_USER = 10
