import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await params;

    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Look up internal user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    // ERR-01: PGRST116 (no rows) → 404; otros errores → 500 con log.
    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (status):', userError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch report status — only if it belongs to this user
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, status, slug')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single();

    if (reportError && reportError.code !== 'PGRST116') {
      console.error('DB error fetching report (status):', reportError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: report.status,
        slug: report.slug,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Report status error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
