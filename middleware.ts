import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Redirect legacy /reports/:slug URLs to /informe/:slug
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/reports/')) {
    const slug = pathname.replace('/reports/', '')
    const url = req.nextUrl.clone()
    url.pathname = `/informe/${slug}`
    return NextResponse.redirect(url, 301)
  }

  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
