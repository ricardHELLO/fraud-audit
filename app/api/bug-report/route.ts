import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { awardCredit } from '@/lib/credits';
import { rateLimit, identifierFromRequest } from '@/lib/rate-limit';
import { parseJsonBody, BugReportBodySchema } from '@/lib/api-validation';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SEC-04: rate limit agresivo — endpoint de bug reports es blanco
    // típico de spam. 5/10min.
    const rl = await rateLimit('bugReport', identifierFromRequest(req, clerkId));
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiados reportes recientes. Intenta de nuevo en unos minutos.' },
        {
          status: 429,
          headers: rl.reset
            ? { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) }
            : undefined,
        }
      );
    }

    // P2 fix: validación centralizada con zod (trim + min/max en una).
    const parsed = await parseJsonBody(req, BugReportBodySchema);
    if (!parsed.success) return parsed.response;
    const { description } = parsed.data;

    const supabase = createServerClient();

    // Look up user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    // ERR-01: PGRST116 → 404; otros errores → 500 con log.
    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (bug-report):', userError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Insert bug report
    const { error: insertError } = await supabase.from('bug_reports').insert({
      user_id: user.id,
      description: description.trim(),
    });

    if (insertError) {
      console.error('Failed to save bug report:', insertError.message);
      return NextResponse.json(
        { error: 'Failed to save bug report' },
        { status: 500 }
      );
    }

    // Award credit for bug report
    let creditAwarded = false;
    try {
      creditAwarded = await awardCredit(user.id, 'bug_report');
    } catch (creditError) {
      console.error('Failed to award bug report credit:', creditError);
    }

    return NextResponse.json(
      { success: true, creditAwarded },
      { status: 200 }
    );
  } catch (err) {
    console.error('Bug report error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
