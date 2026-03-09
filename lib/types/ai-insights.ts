export interface AIInsights {
  narrative: string
  recommendations: AIRecommendation[]
  anomalies: AIAnomaly[]
  generated_at: string
}

export interface AIRecommendation {
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: 'immediate' | 'structural' | 'monitoring'
}

export interface AIAnomaly {
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  affected_area: string
}
