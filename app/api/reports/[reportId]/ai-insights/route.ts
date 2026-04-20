import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@/lib/supabase'
import { deductCredit } from '@/lib/credits'
import { rateLimit, identifierFromRequest } from '@/lib/rate-limit'

type RouteParams = { params: Promise<{ reportId: string }> }

/**
 * GET /api/reports/[reportId]/ai-insights
 * Poll for AI insights — returns { status, data } so the client
 * can distinguish "still generating" from "failed / unavailable".
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { reportId } = await params
    const supabase = createServerClient()

    // ERR-01: distinguir "no encontrado" (404) de "error de infraestructura" (500).
    // Si no destructuramos `error`, un DB timeout devuelve data=null y el cliente
    // ve "User not found", enmascarando problemas reales de Supabase.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (ai-insights GET):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, status, ai_insights, created_at')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single()

    if (reportError && reportError.code !== 'PGRST116') {
      console.error('DB error fetching report (ai-insights GET):', reportError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // If insights exist, return them
    if (report.ai_insights) {
      return NextResponse.json({
        status: 'ready',
        data: report.ai_insights,
      })
    }

    // If report is still processing, insights may arrive later
    if (report.status === 'processing') {
      return NextResponse.json({ status: 'generating', data: null })
    }

    // Report is completed but no insights — check how long ago.
    // updated_at is not in the schema, so we use created_at with a generous
    // 10-minute window to accommodate reports that take several minutes to
    // process before the Inngest AI step has a chance to run.
    const createdAt = new Date(report.created_at).getTime()
    const elapsed = Date.now() - createdAt
    const TIMEOUT_MS = 10 * 60_000 // 10 minutes grace period (updated_at unavailable)

    if (elapsed < TIMEOUT_MS) {
      // Still within grace period — Inngest step may finish soon
      return NextResponse.json({ status: 'generating', data: null })
    }

    // Past grace period with no insights → generation failed
    return NextResponse.json({ status: 'unavailable', data: null })
  } catch (err) {
    console.error('AI insights poll error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/reports/[reportId]/ai-insights
 * Trigger AI insights regeneration on demand.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // B8: rate limit the AI regeneration endpoint. Each POST triggers an
    // Anthropic call (paid), deducts a credit, and runs synchronously for
    // ~15 s of server time. Without this, a single authenticated user can
    // drain both credit balance and Anthropic quota in seconds. We use the
    // existing `analyze` preset (5/min) which is sized for this exact
    // workload — same cost profile as POST /api/analyze.
    const rlResult = await rateLimit(
      'analyze',
      identifierFromRequest(req, clerkId)
    )
    if (!rlResult.success) {
      const retryAfterSec = rlResult.reset
        ? Math.max(1, Math.ceil((rlResult.reset - Date.now()) / 1000))
        : 60
      return NextResponse.json(
        {
          error: 'Too many AI regeneration requests. Try again later.',
          retryAfter: retryAfterSec,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            ...(rlResult.limit !== undefined && {
              'X-RateLimit-Limit': String(rlResult.limit),
            }),
            ...(rlResult.remaining !== undefined && {
              'X-RateLimit-Remaining': String(rlResult.remaining),
            }),
          },
        }
      )
    }

    const { reportId } = await params
    const supabase = createServerClient()

    // ERR-01: mismo patrón que el GET — separamos 404 de 500.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (ai-insights POST):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, report_data, user_id')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single()

    if (reportError && reportError.code !== 'PGRST116') {
      console.error('DB error fetching report (ai-insights POST):', reportError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (!report.report_data) {
      return NextResponse.json(
        { error: 'Report has no data to analyze' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { status: 'unavailable', error: 'AI service not configured' },
        { status: 503 }
      )
    }

    // BUG-API02 fix: deduct a credit before calling the AI API.
    // Previously, regeneration was free — potential for unlimited AI API abuse.
    const deducted = await deductCredit(user.id, 'analysis', reportId)
    if (!deducted) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      )
    }

    // Generate insights synchronously (Claude call ~10-15s)
    const { generateAIInsights } = await import('@/lib/ai-insights-generator')
    const insights = await generateAIInsights(report.report_data as any)

    if (!insights) {
      return NextResponse.json(
        { status: 'failed', error: 'AI generation returned no results' },
        { status: 500 }
      )
    }

    // Persist to DB
    await supabase
      .from('reports')
      .update({ ai_insights: insights })
      .eq('id', report.id)

    return NextResponse.json({ status: 'ready', data: insights })
  } catch (err) {
    console.error('AI insights regeneration error:', err)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}
