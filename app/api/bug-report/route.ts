import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { awardCredit } from '@/lib/credits';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { description } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    if (description.length > 2000) {
      return NextResponse.json(
        { error: 'Description must be 2000 characters or less' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Look up user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (userError || !user) {
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
