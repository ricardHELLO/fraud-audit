import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Look up user.
    // ERR-01: separar 404 "no hay fila" (PGRST116) de 500 "DB rota".
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, credits_balance, organization_id')
      .eq('clerk_id', clerkId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (settings GET):', userError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Look up organization name
    let organizationName = '';
    if (user.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', user.organization_id)
        .single();
      organizationName = org?.name ?? '';
    }

    // Fetch transaction history
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('id, amount, reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json(
      {
        user: {
          email: user.email,
          name: user.name,
          organization_name: organizationName,
        },
        balance: user.credits_balance ?? 0,
        transactions: transactions ?? [],
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Settings GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: 'Name must be 100 characters or less' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Look up user.
    // ERR-01: idem GET.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (settings PATCH):', userError.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update name
    const { error: updateError } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update user name:', updateError.message);
      return NextResponse.json(
        { error: 'Failed to update name' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, name: name.trim() },
      { status: 200 }
    );
  } catch (err) {
    console.error('Settings PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
