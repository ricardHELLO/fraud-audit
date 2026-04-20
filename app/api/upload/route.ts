import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@/lib/supabase';
import { detectVolume } from '@/lib/volume-detector';
import {
  isConnectorType,
  isSourceCategory,
  ALL_CONNECTOR_IDS,
  SOURCE_CATEGORIES,
} from '@/lib/types/connectors';
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_MB, UPLOAD_MAX_ROWS } from '@/lib/constants/upload';
import { rateLimit, identifierFromRequest, rateLimitHeaders } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // SEC-04: rate limit por usuario. Pass-through si Upstash no está
    // configurado (degradación elegante en deploys sin env vars).
    const rl = await rateLimit('upload', identifierFromRequest(req, userId));
    // P3 (issue #3): X-RateLimit-* en todas las respuestas.
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Intenta de nuevo en unos segundos.' },
        {
          status: 429,
          headers: {
            ...rlHeaders,
            ...(rl.reset
              ? { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) }
              : {}),
          },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const connectorType = formData.get('connectorType') as string | null;
    const sourceCategory = formData.get('sourceCategory') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400, headers: rlHeaders }
      );
    }

    // BUG-API03 fix: validate file size before reading into memory.
    // file.text() without a size check allows arbitrary-size uploads (OOM risk).
    // Constant lives in lib/constants/upload.ts so UI + API + tests agree.
    if (file.size > UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `El archivo es demasiado grande. El tamaño máximo permitido es ${UPLOAD_MAX_MB}MB.` },
        { status: 413, headers: rlHeaders }
      );
    }

    if (!connectorType) {
      return NextResponse.json(
        { error: 'connectorType is required' },
        { status: 400, headers: rlHeaders }
      );
    }

    if (!sourceCategory) {
      return NextResponse.json(
        { error: 'sourceCategory is required' },
        { status: 400, headers: rlHeaders }
      );
    }

    // SEC-02: allowlist de conectores y categorías. Rechazamos input desconocido
    // antes de tocar Storage o DB para evitar filas envenenadas y runs fallidos.
    if (!isConnectorType(connectorType)) {
      return NextResponse.json(
        {
          error: `Invalid connectorType. Must be one of: ${ALL_CONNECTOR_IDS.join(', ')}`,
        },
        { status: 400, headers: rlHeaders }
      );
    }

    if (!isSourceCategory(sourceCategory)) {
      return NextResponse.json(
        {
          error: `Invalid sourceCategory. Must be one of: ${SOURCE_CATEGORIES.join(', ')}`,
        },
        { status: 400, headers: rlHeaders }
      );
    }

    const supabase = createServerClient();

    // Look up internal user from Clerk ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('clerk_id', userId)
      .single();

    // ERR-01: PGRST116 (no rows) → 404 legítimo; otros errores → 500 con log.
    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (upload):', userError.message);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500, headers: rlHeaders }
      );
    }
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: rlHeaders }
      );
    }

    // Build the storage path
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${timestamp}_${sanitizedFilename}`;

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
        { status: 500, headers: rlHeaders }
      );
    }

    // Run volume detection on the file content
    let volumeInfo;
    try {
      volumeInfo = detectVolume(fileContent, connectorType);
    } catch (err) {
      console.error('Volume detection error:', err);
      // Clean up the uploaded file before returning the error
      const { error: removeError } = await supabase.storage.from('uploads').remove([storagePath]);
      if (removeError) {
        console.error('Failed to remove orphaned storage file:', storagePath, removeError.message);
      }
      return NextResponse.json(
        { error: 'No se pudo analizar la estructura del archivo. Verifica que sea un CSV válido para el conector seleccionado.' },
        { status: 400, headers: rlHeaders }
      );
    }

    // PERF-02: cap de filas aparte del cap de bytes. UPLOAD_MAX_BYTES ya
    // limita el input a 50 MB, pero inputs patológicos (líneas cortas,
    // muchas celdas vacías) pueden expandirse a millones de filas y
    // reventar el worker de Inngest downstream. Rechazamos aquí con 413
    // claro antes de guardar nada en DB. El archivo YA está en Storage
    // (subido a L113), así que reutilizamos el patrón de cleanup que usa
    // el catch de detectVolume.
    if (volumeInfo.totalRows > UPLOAD_MAX_ROWS) {
      const { error: removeError } = await supabase.storage.from('uploads').remove([storagePath]);
      if (removeError) {
        console.error('Failed to remove orphaned storage file:', storagePath, removeError.message);
      }
      return NextResponse.json(
        {
          error: `El archivo tiene demasiadas filas (${volumeInfo.totalRows.toLocaleString('es-ES')}). El máximo permitido es ${UPLOAD_MAX_ROWS.toLocaleString('es-ES')}.`,
        },
        { status: 413, headers: rlHeaders }
      );
    }

    // Save the upload record to the database
    const insertData: Record<string, unknown> = {
      user_id: user.id,
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
    };
    if (user.organization_id) {
      insertData.organization_id = user.organization_id;
    }

    const { data: uploadRecord, error: dbError } = await supabase
      .from('uploads')
      .insert(insertData)
      .select('id')
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError.message);
      // Clean up the already-uploaded file to prevent orphans in storage
      const { error: removeError } = await supabase.storage.from('uploads').remove([storagePath]);
      if (removeError) {
        console.error('Failed to remove orphaned storage file:', storagePath, removeError.message);
      }
      return NextResponse.json(
        { error: 'Failed to save upload record' },
        { status: 500, headers: rlHeaders }
      );
    }

    return NextResponse.json(
      {
        uploadId: uploadRecord.id,
        volumeInfo,
      },
      { status: 200, headers: rlHeaders }
    );
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
