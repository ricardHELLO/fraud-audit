import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Stripe webhook handler — processes checkout.session.completed events
 * and awards credits atomically with idempotency protection.
 *
 * Idempotency: Uses session.id as reference_id in the PG function.
 * The unique index on (reason, reference_id) prevents duplicate credits
 * even if Stripe delivers the same webhook multiple times.
 */
export async function POST(req: NextRequest) {
  const log = logger.forRequest(req, { route: '/api/webhooks/stripe' });
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  // Stripe not configured: return 503 (not 200) so Stripe retries and on-call
  // notices. A 200 here would silently drop real payments if keys rotate or
  // someone fat-fingers the env vars in production. If the product is truly in
  // free-beta, disable the webhook endpoint in the Stripe dashboard instead.
  if (!STRIPE_SECRET || !WEBHOOK_SECRET || STRIPE_SECRET === 'sk_test_placeholder') {
    log.warn('Stripe webhook received but Stripe is not configured', {
      hasSecret: !!STRIPE_SECRET,
      hasWebhookSecret: !!WEBHOOK_SECRET,
      isPlaceholder: STRIPE_SECRET === 'sk_test_placeholder',
    });
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 503, headers: { 'Retry-After': '3600' } }
    );
  }

  // Dynamic import to avoid module-level crash when Stripe key is missing
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });
  const { awardCreditsRaw } = await import('@/lib/credits');
  const { serverTrackPurchaseCompleted } = await import('@/lib/posthog-server-events');

  // Map price IDs to credit amounts
  function getPriceToCredits(): Record<string, number> {
    const map: Record<string, number> = {};
    if (process.env.STRIPE_PRICE_5_CREDITS) map[process.env.STRIPE_PRICE_5_CREDITS] = 5;
    if (process.env.STRIPE_PRICE_15_CREDITS) map[process.env.STRIPE_PRICE_15_CREDITS] = 15;
    if (process.env.STRIPE_PRICE_50_CREDITS) map[process.env.STRIPE_PRICE_50_CREDITS] = 50;
    return map;
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: import('stripe').Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Nota: 400 es intencional — firma inválida = cliente mal, no bug. No a Sentry.
    log.warn('Stripe webhook signature verification failed', { message });
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as import('stripe').Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) {
          log.error('Stripe checkout session missing userId in metadata', { sessionId: session.id });
          return NextResponse.json({ error: 'Missing userId in session metadata' }, { status: 400 });
        }

        // SEC-05: Stripe puede emitir `checkout.session.completed` con
        // `payment_status` distinto de 'paid' (trials, async payment methods).
        // No otorgamos créditos hasta que el cobro esté confirmado.
        if (session.payment_status !== 'paid') {
          log.info('Stripe session not paid, skipping credit award', {
            sessionId: session.id,
            paymentStatus: session.payment_status,
          });
          return NextResponse.json({ received: true, skipped: 'unpaid' }, { status: 200 });
        }

        // INT-04: antes de pegarle a Stripe con listLineItems (latency + quota),
        // detectamos webhooks duplicados consultando credit_transactions por
        // `reference_id`. El PG function ya es idempotente, pero ahorra la
        // round-trip innecesaria en reintentos de Stripe.
        {
          const { createServerClient } = await import('@/lib/supabase');
          const supabase = createServerClient();
          const { data: existing } = await supabase
            .from('credit_transactions')
            .select('id')
            .eq('reason', 'purchase')
            .eq('reference_id', session.id)
            .limit(1)
            .maybeSingle();

          if (existing) {
            log.info('Duplicate Stripe webhook, skipping listLineItems', { sessionId: session.id });
            return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
          }
        }

        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const priceToCredits = getPriceToCredits();
        let totalCreditsAwarded = 0;

        for (const item of lineItems.data) {
          const priceId = item.price?.id;
          if (!priceId) continue;
          const creditAmount = priceToCredits[priceId];
          if (!creditAmount) { log.warn('Unknown Stripe price ID', { priceId, sessionId: session.id }); continue; }
          const quantity = item.quantity ?? 1;
          const totalCredits = creditAmount * quantity;

          // Atomic + idempotent: PG function checks for duplicate session.id
          const newBalance = await awardCreditsRaw(
            userId,
            totalCredits,
            'purchase',
            session.id
          );

          if (newBalance === -1) {
            // Already processed — Stripe delivered duplicate webhook
            log.info('Duplicate Stripe webhook, ignoring', { sessionId: session.id });
            return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
          }

          totalCreditsAwarded += totalCredits;
        }

        if (totalCreditsAwarded > 0) {
          serverTrackPurchaseCompleted(userId, {
            amount: session.amount_total ? session.amount_total / 100 : 0,
            credits_purchased: totalCreditsAwarded,
            stripe_session_id: session.id,
          });

          // Send purchase confirmation email (fire-and-forget)
          try {
            const { createServerClient } = await import('@/lib/supabase');
            const supabase = createServerClient();
            const { data: userData } = await supabase
              .from('users')
              .select('email, name')
              .eq('id', userId)
              .single();

            if (userData?.email) {
              const { sendEmail } = await import('@/lib/email');
              const { purchaseConfirmationEmail } = await import('@/lib/email-templates');
              const amountPaid = session.amount_total ? session.amount_total / 100 : 0;
              const template = purchaseConfirmationEmail(userData.name, totalCreditsAwarded, amountPaid);
              await sendEmail({ to: userData.email, subject: template.subject, html: template.html });
            }
          } catch (emailErr) {
            // Post-credit: email es best-effort, no debe romper el 200 al webhook.
            log.exception(emailErr, 'Failed to send purchase email', { sessionId: session.id, userId });
          }
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    log.exception(err, 'Unhandled Stripe webhook error', { eventType: event.type });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
