'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useUser, useAuth } from '@clerk/nextjs'
import { getPostHogBrowser, identifyUser, setOrganizationGroup } from '@/lib/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isLoaded: isUserLoaded } = useUser()
  const { userId } = useAuth()

  // Initialize PostHog on mount
  useEffect(() => {
    getPostHogBrowser()
  }, [])

  // Track pageviews manually
  useEffect(() => {
    const ph = getPostHogBrowser()
    if (!ph) return

    const url = window.origin + pathname
    const search = searchParams.toString()
    const fullUrl = search ? `${url}?${search}` : url

    ph.capture('$pageview', {
      $current_url: fullUrl,
    })
  }, [pathname, searchParams])

  // Identify user when Clerk session is ready
  useEffect(() => {
    if (!isUserLoaded || !user || !userId) return

    identifyUser(userId, {
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
    })

    // Set organization group if available from localStorage
    try {
      const onboarding = localStorage.getItem('fraudaudit_onboarding')
      if (onboarding) {
        const data = JSON.parse(onboarding)
        if (data.organizationId) {
          setOrganizationGroup(data.organizationId, {
            name: data.organizationName,
          })
        }
      }
    } catch {
      // Silently ignore localStorage errors
    }
  }, [isUserLoaded, user, userId])

  return <>{children}</>
}
