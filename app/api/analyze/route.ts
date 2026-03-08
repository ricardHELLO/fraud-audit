import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import { createServerClient } from '@/lib/supabase';
import { deductCredit } from '@/lib/credits';
import { inngest } from '@/lib/inngest/client';

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

    // Deduct credit for the analysis
    const deducted = await deductCredit(user.id, 'analysis', undefined);

    if (!deducted) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    // Generate a unique slug for the report URL
    const slug = nanoid(12);

    // Create the report record with status 'processing'
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        slug,
        user_id: user.id,
        organization_id: user.organization_id,
        pos_upload_id: posUploadId,
        inventory_upload_id: inventoryUploadId ?? null,
        status: 'processing',
        pos_connector: posConnector,
        inventory_connector: inventoryConnector ?? null,
      })
      .select('id')
      .single();

    if (reportError || !report) {
      console.error('Failed to create report:', reportError?.message);
      return NextResponse.json(
        { error: 'Failed to create report' },
        { status: 500 }
      );
    }

    // Send the Inngest event to trigger async processing
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
        slug,
      },
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
