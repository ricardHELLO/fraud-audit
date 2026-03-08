import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { awardCredit } from '@/lib/credits';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
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

    if (accuracy_rating === undefined || accuracy_rating === null) {
      return NextResponse.json(
        { error: 'accuracy_rating is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Look up the internal user ID from Clerk ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single();

    if (userError || !user) {
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

    // Award 1 credit if this is the first feedback for this report
    let creditAwarded = false;
    if (isFirstFeedback) {
      creditAwarded = await awardCredit(user.id, 'feedback', reportId);
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
