import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import type { ReportData } from '@/lib/types/report';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await params;

    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId is required' },
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

    // Fetch report — must belong to user
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, slug, status, report_data, pos_connector')
      .eq('id', reportId)
      .eq('user_id', user.id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    if (report.status !== 'completed' || !report.report_data) {
      return NextResponse.json(
        { error: 'Report is not ready yet' },
        { status: 400 }
      );
    }

    const reportData = report.report_data as ReportData;

    // Dynamic import to avoid issues at module level
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { ReportPDF } = await import('@/lib/pdf/report-pdf');

    // Render PDF to buffer
    const React = (await import('react')).default;
    const element = React.createElement(ReportPDF, { data: reportData }) as any;
    const buffer = await renderToBuffer(element);

    // Generate filename
    const orgName = reportData.summary.organization_name
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const date = new Date().toISOString().split('T')[0];
    const filename = `FraudAudit-${orgName}-${date}.pdf`;

    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
