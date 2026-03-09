import posthog from 'posthog-js'

// ========== Browser Client ==========

let posthogBrowserInitialized = false

export function getPostHogBrowser() {
  if (typeof window === 'undefined') return null

  if (!posthogBrowserInitialized && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false, // Manual pageviews for control
      session_recording: {
        maskAllInputs: true, // Don't record file upload data
      },
      persistence: 'localStorage',
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') {
          ph.debug()
        }
      },
    })
    posthogBrowserInitialized = true
  }

  return posthog
}

// Re-export the posthog instance for direct imports
export { posthog as posthogClient }

// ========== Browser Helpers ==========

/** Identify a user after Clerk auth confirms session */
export function identifyUser(userId: string, properties: {
  email?: string
  name?: string
  organization_id?: string
  credits_balance?: number
}) {
  const ph = getPostHogBrowser()
  if (!ph) return
  ph.identify(userId, properties)
}

/** Set organization group */
export function setOrganizationGroup(orgId: string, properties?: {
  name?: string
  created_at?: string
}) {
  const ph = getPostHogBrowser()
  if (!ph) return
  ph.group('organization', orgId, properties)
}

/** Check a feature flag */
export function isFeatureEnabled(flag: string): boolean {
  const ph = getPostHogBrowser()
  if (!ph) return false
  return ph.isFeatureEnabled(flag) ?? false
}

/** Get feature flag value (for multivariate) */
export function getFeatureFlag(flag: string): string | boolean | undefined {
  const ph = getPostHogBrowser()
  if (!ph) return undefined
  return ph.getFeatureFlag(flag)
}
