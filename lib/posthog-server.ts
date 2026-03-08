import { PostHog as PostHogNode } from 'posthog-node'

// ========== Server Client (Node.js only) ==========

let serverClient: PostHogNode | null = null

export function getPostHogServer(): PostHogNode | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null

  if (!serverClient) {
    serverClient = new PostHogNode(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  }

  return serverClient
}

/** Capture a server-side event */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const ph = getPostHogServer()
  if (!ph) return
  ph.capture({ distinctId, event, properties })
}
