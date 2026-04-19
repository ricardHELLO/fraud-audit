import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { awardCredit } from '@/lib/credits';
import { serverTrackFeedbackSubmitted, serverTrackCreditEarned } from '@/lib/posthog-server-events';
import { rateLimit, identifierFromRequest } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // SEC-04: rate limit por usuario.
    const rl = await rateLimit('feedback', identifierFromRequest(req, clerkId));
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Intenta en unos segundos.' },
        {
          status: 429,
          headers: rl.reset
            ? { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) }
            : undefined,
        }
      );
    }

    const body = await req.json();
    const {
      reportId,
      accuracy_rating,
      most_useful_section,
      missing_data,
      would_share,
      would_share_reason,
      general_comments,
    } = body;

    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId is required' },
        { status: 400 }
      );
    }

    // BIZ-07: el constraint de DB (CHECK BETWEEN 1 AND 5) se pensó para ints 1..5,
    // pero sin validar `Number.isInteger` llegaban 3.5 al insert y fallaba con 500.
    // Validamos en la frontera con mensaje claro.
    if (
      typeof accuracy_rating !== 'number' ||
      !Number.isInteger(accuracy_rating) ||
      accuracy_rating < 1 ||
      accuracy_rating > 5
    ) {
      return NextResponse.json(
        { error: 'accuracy_rating must be an integer between 1 and 5' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Look up the internal user ID from Clerk ID.
    // ERR-01: PGRST116 (no rows) sigue siendo 404; otros errores → 500.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (feedback):', userError.message);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has already submitted feedback for this report
    const { data: existingFeedback } = await supabase
      .from('feedback')
      .select('id')
      .eq('user_id', user.id)
      .eq('report_id', reportId)
      .limit(1);

    const isFirstFeedback =
      !existingFeedback || existingFeedback.length === 0;

    // Save the feedback
    const { error: feedbackError } = await supabase.from('feedback').insert({
      user_id: user.id,
      report_id: reportId,
      accuracy_rating,
      most_useful_section: most_useful_section ?? null,
      missing_data: missing_data ?? null,
      would_share: would_share ?? null,
      would_share_reason: would_share_reason ?? null,
      general_comments: general_comments ?? null,
    });

    if (feedbackError) {
      console.error('Failed to save feedback:', feedbackError.message);
      return NextResponse.json(
        { error: 'Failed to save feedback' },
        { status: 500 }
      );
    }

    // ERR-02: a partir de aquí, el feedback YA está persistido. Cualquier
    // error posterior (crédito, analytics) se loguea pero NO debe devolver
    // 500 al cliente: si el cliente retria, inserta un duplicado en
    // `feedback`, y la segunda inserción tendrá isFirstFeedback=false
    // (sin crédito), pero el registro duplicado queda para siempre.
    let creditAwarded = false;
    if (isFirstFeedback) {
      try {
        creditAwarded = await awardCredit(user.id, 'feedback', reportId);
        if (creditAwarded) {
          serverTrackCreditEarned(user.id, 'feedback', 0); // Balance will be fetched
        }
      } catch (creditErr) {
        console.error(
          'Failed to award feedback credit (feedback ya guardado):',
          creditErr instanceof Error ? creditErr.message : creditErr
        );
        // No fallar la request — el feedback se guardó correctamente.
      }
    }

    // Track feedback event (best-effort — PostHog no debe romper la respuesta)
    try {
      serverTrackFeedbackSubmitted(user.id, {
        accuracy_rating,
        most_useful_section: most_useful_section ?? undefined,
        would_share: would_share ?? undefined,
      });
    } catch (trackErr) {
      console.error(
        'Failed to track feedback event:',
        trackErr instanceof Error ? trackErr.message : trackErr
      );
    }

    return NextResponse.json(
      {
        success: true,
        creditAwarded,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Feedback error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
