import { captureServerEvent } from './posthog-server'
import { EVENTS } from './posthog-events'

// ============================================================
// Server-side typed capture helpers
// ============================================================

export function serverTrackSignup(userId: string, method: string) {
  captureServerEvent(userId, EVENTS.SIGNUP_COMPLETED, { method })
}

export function serverTrackAnalysisStarted(userId: string, props: {
  credits_used: number
  analysis_window_months: number
  locations_count: number
  report_slug: string
}) {
  captureServerEvent(userId, EVENTS.ANALYSIS_STARTED, props)
}

export function serverTrackAnalysisCompleted(userId: string, props: {
  processing_time_seconds: number
  report_slug: string
}) {
  captureServerEvent(userId, EVENTS.ANALYSIS_COMPLETED, props)
}

export function serverTrackAnalysisFailed(userId: string, props: {
  error_type: string
  connector_type: string
}) {
  captureServerEvent(userId, EVENTS.ANALYSIS_FAILED, props)
}

export function serverTrackReportViewed(distinctId: string, props: {
  slug: string
  is_owner: boolean
  source: 'direct' | 'shared_link'
}) {
  captureServerEvent(distinctId, EVENTS.REPORT_VIEWED, props)
}

export function serverTrackFeedbackSubmitted(userId: string, props: {
  accuracy_rating: number
  most_useful_section?: string
  would_share?: boolean
}) {
  captureServerEvent(userId, EVENTS.FEEDBACK_SUBMITTED, props)
}

export function serverTrackCreditEarned(userId: string, reason: string, newBalance: number) {
  captureServerEvent(userId, EVENTS.CREDIT_EARNED, { reason, new_balance: newBalance })
}

export function serverTrackCreditSpent(userId: string, reason: string, newBalance: number) {
  captureServerEvent(userId, EVENTS.CREDIT_SPENT, { reason, new_balance: newBalance })
}

export function serverTrackPurchaseCompleted(userId: string, props: {
  amount: number
  credits_purchased: number
  stripe_session_id: string
}) {
  captureServerEvent(userId, EVENTS.PURCHASE_COMPLETED, props)
}
