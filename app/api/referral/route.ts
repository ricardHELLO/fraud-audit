import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Look up the internal user ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, referral_code')
      .eq('clerk_id', clerkId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.referral_code) {
      return NextResponse.json(
        {
          referralCode: null,
          referralCount: 0,
          creditsEarned: 0,
        },
        { status: 200 }
      );
    }

    // Count how many users used this referral code
    const { count: referralCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', user.referral_code);

    // Count credits earned from referrals
    const { data: referralCredits } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('reason', 'referral');

    const creditsEarned =
      referralCredits?.reduce((sum, tx) => sum + tx.amount, 0) ?? 0;

    return NextResponse.json(
      {
        referralCode: user.referral_code,
        referralCount: referralCount ?? 0,
        creditsEarned,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Referral GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(_req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Look up the internal user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, referral_code')
      .eq('clerk_id', clerkId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // If the user already has a referral code, return it
    if (user.referral_code) {
      return NextResponse.json(
        {
          referralCode: user.referral_code,
          referralCount: 0,
          creditsEarned: 0,
        },
        { status: 200 }
      );
    }

    // Generate a new referral code
    const referralCode = nanoid(8);

    const { error: updateError } = await supabase
      .from('users')
      .update({ referral_code: referralCode })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to save referral code:', updateError.message);
      return NextResponse.json(
        { error: 'Failed to create referral code' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        referralCode,
        referralCount: 0,
        creditsEarned: 0,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Referral POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
