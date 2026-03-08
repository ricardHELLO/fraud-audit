import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase';
import { getBalance } from '@/lib/credits';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Map price IDs to credit amounts
function getPriceToCredits(): Record<string, number> {
  const map: Record<string, number> = {};

  if (process.env.STRIPE_PRICE_5_CREDITS) {
    map[process.env.STRIPE_PRICE_5_CREDITS] = 5;
  }
  if (process.env.STRIPE_PRICE_15_CREDITS) {
    map[process.env.STRIPE_PRICE_15_CREDITS] = 15;
  }
  if (process.env.STRIPE_PRICE_50_CREDITS) {
    map[process.env.STRIPE_PRICE_50_CREDITS] = 50;
  }

  return map;
}

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook secret not configured' },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Get the user ID from session metadata
        const userId = session.metadata?.userId;
        if (!userId) {
          console.error('Stripe checkout session missing userId in metadata');
          return NextResponse.json(
            { error: 'Missing userId in session metadata' },
            { status: 400 }
          );
        }

        // Retrieve the line items to determine credits purchased
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 10 }
        );

        const supabase = createServerClient();
        const priceToCredits = getPriceToCredits();

        let totalCreditsAwarded = 0;

        for (const item of lineItems.data) {
          const priceId = item.price?.id;
          if (!priceId) continue;

          const creditAmount = priceToCredits[priceId];
          if (!creditAmount) {
            console.warn(`Unknown price ID: ${priceId}`);
            continue;
          }

          const quantity = item.quantity ?? 1;
          const totalCredits = creditAmount * quantity;

          // Insert a single credit transaction for the purchase
          const { error: txError } = await supabase
            .from('credit_transactions')
            .insert({
              user_id: userId,
              amount: totalCredits,
              reason: 'purchase',
              reference_id: session.id,
            });

          if (txError) {
            console.error('Failed to insert purchase transaction:', txError.message);
            return NextResponse.json(
              { error: 'Failed to record credit transaction' },
              { status: 500 }
            );
          }

          totalCreditsAwarded += totalCredits;
        }

        // Update the user's balance
        if (totalCreditsAwarded > 0) {
          const currentBalance = await getBalance(userId);
          const { error: updateError } = await supabase
            .from('users')
            .update({ credits_balance: currentBalance + totalCreditsAwarded })
            .eq('id', userId);

          if (updateError) {
            console.error('Failed to update user balance:', updateError.message);
            return NextResponse.json(
              { error: 'Failed to update user balance' },
              { status: 500 }
            );
          }
        }

        break;
      }

      default:
        // Unhandled event type -- acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
