import { inngest } from './client';
import { createServerClient } from '@/lib/supabase';
import { getParser, mergeDatasets } from '@/lib/parsers';
import { generateReport } from '@/lib/report-generator';
import { serverTrackAnalysisCompleted, serverTrackAnalysisFailed } from '@/lib/posthog-server-events';

export const analyzeReport = inngest.createFunction(
  { id: 'analyze-report', name: 'Analyze Report' },
  { event: 'report/analyze' },
  async ({ event, step }) => {
    const {
      reportId,
      userId,
      organizationId,
      posUploadId,
      inventoryUploadId,
      posConnector,
      inventoryConnector,
      slug,
    } = event.data;

    const supabase = createServerClient();

    // Step 1: Update status to processing
    await step.run('update-status-processing', async () => {
      await supabase
        .from('reports')
        .update({ status: 'processing' })
        .eq('id', reportId);
    });

    // Step 2: Download POS file from storage and parse
    const posData = await step.run('parse-pos-data', async () => {
      const { data: upload } = await supabase
        .from('uploads')
        .select('file_path')
        .eq('id', posUploadId)
        .single();

      if (!upload) throw new Error('POS upload not found');

      const { data: fileData } = await supabase.storage
        .from('uploads')
        .download(upload.file_path);

      if (!fileData) throw new Error('POS file not found in storage');

      const text = await fileData.text();
      const parser = getParser(posConnector);
      return parser(text);
    });

    // Step 3: Download and parse inventory file (optional)
    let inventoryData = undefined;
    if (inventoryUploadId && inventoryConnector) {
      inventoryData = await step.run('parse-inventory-data', async () => {
        const { data: upload } = await supabase
          .from('uploads')
          .select('file_path')
          .eq('id', inventoryUploadId)
          .single();

        if (!upload) throw new Error('Inventory upload not found');

        const { data: fileData } = await supabase.storage
          .from('uploads')
          .download(upload.file_path);

        if (!fileData) throw new Error('Inventory file not found in storage');

        const text = await fileData.text();
        const parser = getParser(inventoryConnector);
        return parser(text);
      });
    }

    // Step 4: Merge datasets and generate the report
    const reportSlug = await step.run('generate-report', async () => {
      const dataset = mergeDatasets(posData, inventoryData);
      return generateReport({
        userId,
        organizationId,
        dataset,
        slug,
        posUploadId,
        inventoryUploadId,
      });
    });

    // Step 5: Mark complete
    await step.run('update-status-completed', async () => {
      await supabase
        .from('reports')
        .update({ status: 'completed' })
        .eq('id', reportId);

      // Track completion
      serverTrackAnalysisCompleted(userId, {
        processing_time_seconds: 0, // Inngest doesn't easily expose total duration
        report_slug: slug,
      });
    });

    return { slug: reportSlug };
  }
);
