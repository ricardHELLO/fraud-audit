import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@/lib/supabase'
import { deductCredit } from '@/lib/credits'

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

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: report } = await supabase
      .from('reports')
      .select('id, status, ai_insights, created_at')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single()

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
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { reportId } = await params
    const supabase = createServerClient()

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: report } = await supabase
      .from('reports')
      .select('id, report_data, user_id')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single()

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
