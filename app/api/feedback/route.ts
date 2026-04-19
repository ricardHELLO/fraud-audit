import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { awardCredit } from '@/lib/credits';
import { serverTrackFeedbackSubmitted, serverTrackCreditEarned } from '@/lib/posthog-server-events';
import { rateLimit, identifierFromRequest, rateLimitHeaders } from '@/lib/rate-limit';
import { parseJsonBody, FeedbackBodySchema } from '@/lib/api-validation';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const log = logger.forRequest(req, { route: '/api/feedback' });
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
    // P3 (issue #3): X-RateLimit-* en todas las respuestas.
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Intenta en unos segundos.' },
        {
          status: 429,
          headers: {
            ...rlHeaders,
            ...(rl.reset
              ? { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) }
              : {}),
          },
        }
      );
    }

    // P2 + BIZ-07 fix: validación centralizada con zod.
    // `accuracy_rating` como `z.number().int().min(1).max(5)` cierra el
    // caso antiguo de 3.5 llegando al INSERT (DB constraint lo rechazaba
    // con 500 sin explicación útil). Ahora sale 400 con mensaje claro.
    const parsed = await parseJsonBody(req, FeedbackBodySchema);
    if (!parsed.success) return parsed.response;
    const {
      reportId,
      accuracy_rating,
      most_useful_section,
      missing_data,
      would_share,
      would_share_reason,
      general_comments,
    } = parsed.data;

    const supabase = createServerClient();

    // Look up the internal user ID from Clerk ID.
    // ERR-01: PGRST116 (no rows) sigue siendo 404; otros errores → 500.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      log.error('DB error fetching user', { code: userError.code, message: userError.message });
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500, headers: rlHeaders }
      );
    }
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: rlHeaders }
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
      log.error('Failed to save feedback', { message: feedbackError.message, reportId });
      return NextResponse.json(
        { error: 'Failed to save feedback' },
        { status: 500, headers: rlHeaders }
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
        // Post-success: feedback ya persistido. No fallar la request.
        log.exception(creditErr, 'Failed to award feedback credit (feedback ya guardado)', {
          reportId,
          userId: user.id,
        });
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
      // PostHog best-effort — no debe romper la respuesta.
      log.exception(trackErr, 'Failed to track feedback event', { reportId });
    }

    return NextResponse.json(
      {
        success: true,
        creditAwarded,
      },
      { status: 200, headers: rlHeaders }
    );
  } catch (err) {
    log.exception(err, 'Unhandled feedback error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
