import { NextRequest, NextResponse } from 'next/server';

/**
 * Stripe webhook handler — disabled during free beta.
 * When Stripe is configured, this processes checkout.session.completed events
 * and awards credits to users.
 */
export async function POST(req: NextRequest) {
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  // Stripe not configured — free beta mode
  if (!STRIPE_SECRET || !WEBHOOK_SECRET || STRIPE_SECRET === 'sk_test_placeholder') {
    return NextResponse.json(
      { error: 'Stripe is not configured (free beta mode)' },
      { status: 200 }
    );
  }

  // Dynamic import to avoid module-level crash when Stripe key is missing
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });
  const { createServerClient } = await import('@/lib/supabase');
  const { getBalance } = await import('@/lib/credits');
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
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as import('stripe').Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) {
          console.error('Stripe checkout session missing userId in metadata');
          return NextResponse.json({ error: 'Missing userId in session metadata' }, { status: 400 });
        }

        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const supabase = createServerClient();
        const priceToCredits = getPriceToCredits();
        let totalCreditsAwarded = 0;

        for (const item of lineItems.data) {
          const priceId = item.price?.id;
          if (!priceId) continue;
          const creditAmount = priceToCredits[priceId];
          if (!creditAmount) { console.warn(`Unknown price ID: ${priceId}`); continue; }
          const quantity = item.quantity ?? 1;
          const totalCredits = creditAmount * quantity;

          const { error: txError } = await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: totalCredits,
            reason: 'purchase',
            reference_id: session.id,
          });

          if (txError) {
            console.error('Failed to insert purchase transaction:', txError.message);
            return NextResponse.json({ error: 'Failed to record credit transaction' }, { status: 500 });
          }
          totalCreditsAwarded += totalCredits;
        }

        if (totalCreditsAwarded > 0) {
          const currentBalance = await getBalance(userId);
          const { error: updateError } = await supabase
            .from('users')
            .update({ credits_balance: currentBalance + totalCreditsAwarded })
            .eq('id', userId);

          if (updateError) {
            console.error('Failed to update user balance:', updateError.message);
            return NextResponse.json({ error: 'Failed to update user balance' }, { status: 500 });
          }

          serverTrackPurchaseCompleted(userId, {
            amount: session.amount_total ? session.amount_total / 100 : 0,
            credits_purchased: totalCreditsAwarded,
            stripe_session_id: session.id,
          });
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
