import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Look up internal user from Clerk ID.
    // ERR-01: el bug anterior era devolver 404 ante CUALQUIER error (incluido
    // un DB timeout). Ahora PGRST116 (no rows) → 404 legítimo; otros errores
    // → 500 con log, para no enmascarar fallos de infraestructura.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credits_balance')
      .eq('clerk_id', clerkId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (dashboard):', userError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // BUG-API05 fix: add .limit() to prevent loading all reports for users with
    // 100+ reports, which could cause timeouts. 50 is enough for the dashboard view.
    const DASHBOARD_REPORTS_LIMIT = 50;

    // Fetch user's reports
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select(
        'id, slug, status, created_at, locations_analyzed, analysis_window_from, analysis_window_to, external_views, pos_connector, report_data'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(DASHBOARD_REPORTS_LIMIT);

    if (reportsError) {
      console.error('Failed to fetch reports:', reportsError.message);
    }

    // Format reports for the frontend
    const formattedReports = (reports ?? []).map((r) => {
      const locations = r.locations_analyzed ?? [];
      const from = r.analysis_window_from ?? '';
      const to = r.analysis_window_to ?? '';
      const period = from && to ? `${from} — ${to}` : '';

      return {
        id: r.id,
        slug: r.slug,
        organization_name:
          (r.report_data as any)?.summary?.organization_name
          ?? r.pos_connector
          ?? 'Restaurante',
        status: r.status,
        created_at: r.created_at,
        locations,
        analysis_period: period,
        external_views: r.external_views ?? 0,
      };
    });

    // Compute completed gamification actions from credit_transactions
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('reason')
      .eq('user_id', user.id);

    const earnedReasons = new Set(
      (transactions ?? []).map((t) => t.reason)
    );

    const completedActions: string[] = ['signup']; // Always completed

    if (earnedReasons.has('feedback')) completedActions.push('feedback');
    if (earnedReasons.has('referral')) completedActions.push('referral');
    if (earnedReasons.has('first_share_view')) completedActions.push('share');
    if (earnedReasons.has('second_source'))
      completedActions.push('second_source');
    if (earnedReasons.has('bug_report')) completedActions.push('bug_report');

    // Fetch alert rules for the user
    const { data: alertRules } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json(
      {
        balance: user.credits_balance ?? 0,
        reports: formattedReports,
        completedActions,
        alertRules: alertRules ?? [],
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Dashboard API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
