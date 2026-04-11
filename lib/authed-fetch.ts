/**
 * AUDIT-027 fix: wrapper over fetch that redirects to login on 401.
 *
 * When Clerk session expires, API routes return 401. Without this wrapper,
 * the dashboard silently fails to load data with no explanation to the user.
 *
 * Returns null when redirecting (caller should early-return).
 */
export async function authedFetch(
  url: string,
  options?: RequestInit
): Promise<Response | null> {
  const res = await fetch(url, options)

  if (res.status === 401) {
    const currentPath = window.location.pathname + window.location.search
    window.location.href = `/login?redirect_url=${encodeURIComponent(currentPath)}`
    return null
  }

  return res
}
