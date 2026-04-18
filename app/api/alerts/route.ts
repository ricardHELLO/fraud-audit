import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@/lib/supabase'
import {
  VALID_METRICS,
  VALID_OPERATORS,
  MAX_ALERT_RULES_PER_USER,
} from '@/lib/types/alerts'
import type { AlertMetric, AlertOperator } from '@/lib/types/alerts'

/* ------------------------------------------------------------------ */
/*  GET /api/alerts — List user's alert rules                          */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()

    // ERR-01: separar 404 "no existe" de 500 "DB rota".
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (alerts GET):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: rules, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch alert rules:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch alerts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ rules: rules ?? [] })
  } catch (err) {
    console.error('Alerts GET error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/alerts — Create a new alert rule                         */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, metric, operator, threshold } = body as {
      name?: string
      metric?: string
      operator?: string
      threshold?: number
    }

    // Validate required fields
    if (!name || !metric || !operator || threshold === undefined) {
      return NextResponse.json(
        { error: 'name, metric, operator, and threshold are required' },
        { status: 400 }
      )
    }

    // Validate metric
    if (!VALID_METRICS.includes(metric as AlertMetric)) {
      return NextResponse.json(
        { error: `Invalid metric. Must be one of: ${VALID_METRICS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate operator
    if (!VALID_OPERATORS.includes(operator as AlertOperator)) {
      return NextResponse.json(
        { error: `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate threshold is a number
    if (typeof threshold !== 'number' || !isFinite(threshold)) {
      return NextResponse.json(
        { error: 'threshold must be a valid finite number' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // ERR-01: idem GET.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (alerts POST):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check max rules limit
    const { count } = await supabase
      .from('alert_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= MAX_ALERT_RULES_PER_USER) {
      return NextResponse.json(
        { error: `Maximo ${MAX_ALERT_RULES_PER_USER} alertas por usuario` },
        { status: 400 }
      )
    }

    // Create the rule
    const { data: rule, error } = await supabase
      .from('alert_rules')
      .insert({
        user_id: user.id,
        name: name.trim(),
        metric,
        operator,
        threshold,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create alert rule:', error.message)
      return NextResponse.json(
        { error: 'Failed to create alert' },
        { status: 500 }
      )
    }

    return NextResponse.json({ rule }, { status: 201 })
  } catch (err) {
    console.error('Alerts POST error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
