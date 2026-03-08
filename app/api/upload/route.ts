import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { detectVolume } from '@/lib/volume-detector';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const connectorType = formData.get('connectorType') as string | null;
    const sourceCategory = formData.get('sourceCategory') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!connectorType) {
      return NextResponse.json(
        { error: 'connectorType is required' },
        { status: 400 }
      );
    }

    if (!sourceCategory) {
      return NextResponse.json(
        { error: 'sourceCategory is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Build the storage path
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${timestamp}_${sanitizedFilename}`;

    // Read the file content for volume detection
    const fileContent = await file.text();

    // Upload the file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, fileContent, {
        contentType: file.type || 'text/csv',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError.message);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Run volume detection on the file content
    let volumeInfo;
    try {
      volumeInfo = detectVolume(fileContent, connectorType);
    } catch (err) {
      console.error('Volume detection error:', err);
      volumeInfo = {
        dateFrom: '',
        dateTo: '',
        locations: [],
        totalRows: 0,
        monthsCovered: 0,
        creditsRequired: 1,
      };
    }

    // Save the upload record to the database
    const { data: uploadRecord, error: dbError } = await supabase
      .from('uploads')
      .insert({
        user_id: userId,
        file_path: storagePath,
        file_name: file.name,
        file_size_bytes: file.size,
        connector_type: connectorType,
        source_category: sourceCategory,
        detected_date_from: volumeInfo.dateFrom || null,
        detected_date_to: volumeInfo.dateTo || null,
        detected_locations: volumeInfo.locations.length,
        detected_rows: volumeInfo.totalRows,
        months_covered: volumeInfo.monthsCovered,
        credits_required: volumeInfo.creditsRequired,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError.message);
      return NextResponse.json(
        { error: 'Failed to save upload record' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        uploadId: uploadRecord.id,
        volumeInfo,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
