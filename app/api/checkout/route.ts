import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';

// Package ID → env var name mapping
const PACKAGE_TO_ENV: Record<string, string> = {
  pack_5: 'STRIPE_PRICE_5_CREDITS',
  pack_15: 'STRIPE_PRICE_15_CREDITS',
  pack_50: 'STRIPE_PRICE_50_CREDITS',
};

export async function POST(req: NextRequest) {
  try {
    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

    if (!STRIPE_SECRET || STRIPE_SECRET === 'sk_test_placeholder') {
      return NextResponse.json(
        { error: 'Payments are not configured yet (free beta mode)' },
        { status: 503 }
      );
    }

    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { packageId } = body;

    if (!packageId || !PACKAGE_TO_ENV[packageId]) {
      return NextResponse.json(
        { error: 'Invalid packageId. Must be pack_5, pack_15, or pack_50.' },
        { status: 400 }
      );
    }

    // Get Stripe price ID from env
    const envVarName = PACKAGE_TO_ENV[packageId];
    const priceId = process.env[envVarName];

    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for ${packageId}` },
        { status: 500 }
      );
    }

    // Look up internal user ID
    const supabase = createServerClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('clerk_id', clerkId)
      .single();

    // ERR-01: PGRST116 → 404; otros errores → 500 con log.
    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (checkout):', userError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Dynamic import of Stripe
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fraud-audit.vercel.app';

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
        packageId,
      },
      customer_email: user.email,
      success_url: `${appUrl}/dashboard?purchase=success`,
      cancel_url: `${appUrl}/dashboard/upload`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { checkoutUrl: session.url },
      { status: 200 }
    );
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
