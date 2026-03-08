import { getPostHogBrowser } from './posthog'

// ============================================================
// Event name constants
// ============================================================

export const EVENTS = {
  // Acquisition & Activation
  LANDING_CTA_CLICKED: 'landing_cta_clicked',
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_ABANDONED: 'onboarding_abandoned',

  // Upload & Processing
  FILE_UPLOADED: 'file_uploaded',
  VOLUME_LIMIT_SHOWN: 'volume_limit_shown',
  UPGRADE_PROMPT_SHOWN: 'upgrade_prompt_shown',
  ANALYSIS_STARTED: 'analysis_started',
  ANALYSIS_COMPLETED: 'analysis_completed',
  ANALYSIS_FAILED: 'analysis_failed',

  // Report engagement
  REPORT_VIEWED: 'report_viewed',
  REPORT_TAB_CLICKED: 'report_tab_clicked',
  REPORT_SHARED: 'report_shared',
  REPORT_VIRAL_CTA_CLICKED: 'report_viral_cta_clicked',

  // Retention & Monetization
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  CREDIT_EARNED: 'credit_earned',
  CREDIT_SPENT: 'credit_spent',
  UPGRADE_INITIATED: 'upgrade_initiated',
  PURCHASE_COMPLETED: 'purchase_completed',
  REFERRAL_LINK_COPIED: 'referral_link_copied',
} as const

// ============================================================
// Feature flag constants
// ============================================================

export const FLAGS = {
  ONBOARDING_FLOW_VARIANT: 'onboarding_flow_variant',
  CREDIT_REWARD_AMOUNTS: 'credit_reward_amounts',
  VOLUME_LIMIT_FREE_TIER: 'volume_limit_free_tier',
  SHOW_UPGRADE_PROMPT_STYLE: 'show_upgrade_prompt_style',
} as const

// ============================================================
// Browser-side typed capture helpers
// ============================================================

export function trackLandingCTA(ctaPosition: 'hero' | 'mid' | 'bottom') {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.LANDING_CTA_CLICKED, { cta_position: ctaPosition })
}

export function trackOnboardingStep(step: 1 | 2 | 3, props?: {
  pos_selected?: string
  inventory_selected?: string
}) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step, ...props })
}

export function trackOnboardingAbandoned(lastStep: number) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.ONBOARDING_ABANDONED, { last_step: lastStep })
}

export function trackFileUploaded(props: {
  connector_type: string
  source_category: string
  file_size_bytes: number
  detected_rows: number
  detected_months: number
  detected_locations: number
}) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.FILE_UPLOADED, props)
}

export function trackVolumeLimitShown(props: {
  months_in_data: number
  locations_in_data: number
}) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.VOLUME_LIMIT_SHOWN, props)
}

export function trackUpgradePromptShown() {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.UPGRADE_PROMPT_SHOWN)
}

export function trackUpgradeInitiated(packageSize: number) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.UPGRADE_INITIATED, { package_size: packageSize })
}

export function trackReportTabClicked(tab: string) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.REPORT_TAB_CLICKED, { tab })
}

export function trackReportShared(slug: string) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.REPORT_SHARED, { slug })
}

export function trackReportViralCTA() {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.REPORT_VIRAL_CTA_CLICKED)
}

export function trackReferralLinkCopied(referrerId: string) {
  const ph = getPostHogBrowser()
  ph?.capture(EVENTS.REFERRAL_LINK_COPIED, { referrer_id: referrerId })
}

