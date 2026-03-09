import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@/lib/supabase'
import { compareReports } from '@/lib/report-comparator'
import type { ReportData } from '@/lib/types/report'

/* ------------------------------------------------------------------ */
/*  GET /api/compare?reportA={slug}&reportB={slug}                     */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const slugA = searchParams.get('reportA')
    const slugB = searchParams.get('reportB')

    if (!slugA || !slugB) {
      return NextResponse.json(
        { error: 'reportA and reportB query params are required' },
        { status: 400 }
      )
    }

    if (slugA === slugB) {
      return NextResponse.json(
        { error: 'Cannot compare a report with itself' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Lookup user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch both reports — must belong to the user and be completed
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, slug, status, report_data, created_at')
      .eq('user_id', user.id)
      .in('slug', [slugA, slugB])

    if (error || !reports || reports.length !== 2) {
      return NextResponse.json(
        { error: 'One or both reports not found' },
        { status: 404 }
      )
    }

    const reportA = reports.find((r) => r.slug === slugA)
    const reportB = reports.find((r) => r.slug === slugB)

    if (!reportA || !reportB) {
      return NextResponse.json(
        { error: 'One or both reports not found' },
        { status: 404 }
      )
    }

    if (reportA.status !== 'completed' || reportB.status !== 'completed') {
      return NextResponse.json(
        { error: 'Both reports must have status completed' },
        { status: 400 }
      )
    }

    if (!reportA.report_data || !reportB.report_data) {
      return NextResponse.json(
        { error: 'Both reports must have report data' },
        { status: 400 }
      )
    }

    const result = compareReports({
      reportA: reportA.report_data as ReportData,
      reportB: reportB.report_data as ReportData,
      metaA: { slug: reportA.slug, created_at: reportA.created_at },
      metaB: { slug: reportB.slug, created_at: reportB.created_at },
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('Compare API error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
