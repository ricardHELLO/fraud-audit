import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import { createServerClient } from '@/lib/supabase';
import { deductCredit } from '@/lib/credits';
import { inngest } from '@/lib/inngest/client';
import { serverTrackAnalysisStarted, serverTrackCreditSpent } from '@/lib/posthog-server-events';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      posUploadId,
      inventoryUploadId,
      posConnector,
      inventoryConnector,
      restaurantName,
      isDemo,
    } = body;

    if (!posUploadId || !posConnector) {
      return NextResponse.json(
        { error: 'posUploadId and posConnector are required' },
        { status: 400 }
      );
    }

    // Look up the internal user ID from Clerk ID
    const supabase = createServerClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('clerk_id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Deduct credit or enforce demo limit
    if (isDemo) {
      // Server-side enforcement: max 1 demo analysis per user
      const { count } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_demo', true)

      if ((count ?? 0) > 0) {
        // BUG-API04 fix: demo limit is not a credits issue; use 400 + clear message.
        return NextResponse.json(
          { error: 'Demo limit reached' },
          { status: 400 }
        )
      }
    } else {
      const deducted = await deductCredit(user.id, 'analysis', undefined)

      if (!deducted) {
        return NextResponse.json(
          { error: 'Insufficient credits' },
          { status: 402 }
        )
      }
    }

    // Generate a unique slug for the report URL
    const slug = nanoid(12);

    // Create the report record with status 'processing'
    const reportInsert: Record<string, unknown> = {
      slug,
      user_id: user.id,
      pos_upload_id: posUploadId,
      inventory_upload_id: inventoryUploadId ?? null,
      status: 'processing',
      pos_connector: posConnector,
      inventory_connector: inventoryConnector ?? null,
      is_demo: isDemo ?? false,
    };
    if (user.organization_id) {
      reportInsert.organization_id = user.organization_id;
    }

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert(reportInsert)
      .select('id')
      .single();

    if (reportError || !report) {
      console.error('Failed to create report:', reportError?.message);
      return NextResponse.json(
        { error: 'Failed to create report' },
        { status: 500 }
      );
    }

    // BUG-API01 fix: wrap inngest.send() in try/catch.
    // If Inngest is down after credit deduction + report creation, mark the report
    // as failed so the user sees a clear error (not a zombie "processing" report).
    try {
      await inngest.send({
        name: 'report/analyze',
        data: {
          reportId: report.id,
          userId: user.id,
          organizationId: user.organization_id,
          posUploadId,
          inventoryUploadId: inventoryUploadId ?? null,
          posConnector,
          inventoryConnector: inventoryConnector ?? null,
          restaurantName: restaurantName ?? null,
          slug,
        },
      });
    } catch (inngestErr) {
      console.error('Failed to send Inngest event:', inngestErr);
      await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id);
      return NextResponse.json(
        { error: 'Failed to queue analysis. Please try again.' },
        { status: 500 }
      );
    }

    // Track analytics events
    serverTrackCreditSpent(user.id, 'analysis', -1); // Will update with real balance later
    serverTrackAnalysisStarted(user.id, {
      credits_used: 1,
      analysis_window_months: 0, // Not calculated at this point
      locations_count: 0,
      report_slug: slug,
    });

    return NextResponse.json(
      {
        reportId: report.id,
        slug,
        status: 'processing',
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
