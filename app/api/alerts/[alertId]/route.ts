import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@/lib/supabase'

/* ------------------------------------------------------------------ */
/*  PATCH /api/alerts/[alertId] — Update an alert rule                 */
/* ------------------------------------------------------------------ */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { alertId } = await params

    if (!alertId) {
      return NextResponse.json(
        { error: 'alertId is required' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const supabase = createServerClient()

    // Verify ownership.
    // ERR-01: 404 vs 500. El alertId puede no existir legítimamente (el usuario
    // borró la regla desde otra pestaña); eso sigue siendo 404. Pero un error
    // de BD no debe enmascararse como "not found".
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (alerts PATCH):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: existingRule, error: ruleError } = await supabase
      .from('alert_rules')
      .select('id, user_id')
      .eq('id', alertId)
      .single()

    // PGRST116 = "no rows" en PostgREST → legítimamente 404.
    // Cualquier otro code es un error real → 500.
    if (ruleError && ruleError.code !== 'PGRST116') {
      console.error('DB error fetching alert rule (PATCH):', ruleError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!existingRule || existingRule.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Alert rule not found' },
        { status: 404 }
      )
    }

    // Build update object — only allow specific fields
    const updateFields: Record<string, unknown> = {}
    if (body.is_active !== undefined) updateFields.is_active = body.is_active
    if (body.name !== undefined) updateFields.name = body.name
    if (body.threshold !== undefined) updateFields.threshold = body.threshold

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { data: updated, error } = await supabase
      .from('alert_rules')
      .update(updateFields)
      .eq('id', alertId)
      .select()
      .single()

    if (error) {
      console.error('Failed to update alert rule:', error.message)
      return NextResponse.json(
        { error: 'Failed to update alert' },
        { status: 500 }
      )
    }

    return NextResponse.json({ rule: updated })
  } catch (err) {
    console.error('Alerts PATCH error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/alerts/[alertId] — Delete an alert rule                */
/* ------------------------------------------------------------------ */

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { alertId } = await params

    if (!alertId) {
      return NextResponse.json(
        { error: 'alertId is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Verify ownership.
    // ERR-01: mismo patrón que PATCH — 404 (fila inexistente) vs 500 (DB rota).
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (alerts DELETE):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: existingRule, error: ruleError } = await supabase
      .from('alert_rules')
      .select('id, user_id')
      .eq('id', alertId)
      .single()

    if (ruleError && ruleError.code !== 'PGRST116') {
      console.error('DB error fetching alert rule (DELETE):', ruleError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!existingRule || existingRule.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Alert rule not found' },
        { status: 404 }
      )
    }

    // Delete alert history first (foreign key constraint)
    await supabase
      .from('alert_history')
      .delete()
      .eq('alert_rule_id', alertId)

    // Delete the rule
    const { error } = await supabase
      .from('alert_rules')
      .delete()
      .eq('id', alertId)

    if (error) {
      console.error('Failed to delete alert rule:', error.message)
      return NextResponse.json(
        { error: 'Failed to delete alert' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Alerts DELETE error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
