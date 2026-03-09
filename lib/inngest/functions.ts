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

    // Step 6: Send notification email (fire-and-forget)
    await step.run('send-report-email', async () => {
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', userId)
          .single();

        if (userData?.email) {
          const { sendEmail } = await import('@/lib/email');
          const { reportReadyEmail } = await import('@/lib/email-templates');

          let orgName = 'tu restaurante';
          if (organizationId) {
            const { data: org } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', organizationId)
              .single();
            orgName = org?.name ?? 'tu restaurante';
          }

          const template = reportReadyEmail(
            userData.name,
            slug,
            orgName
          );
          await sendEmail({
            to: userData.email,
            subject: template.subject,
            html: template.html,
          });
        }
      } catch (emailError) {
        console.error('Failed to send report email:', emailError);
        // Don't fail the step — email is non-critical
      }
    });

    // Step 7: Evaluate alert rules (fire-and-forget)
    await step.run('evaluate-alert-rules', async () => {
      try {
        // Fetch completed report data
        const { data: completedReport } = await supabase
          .from('reports')
          .select('id, report_data, slug')
          .eq('id', reportId)
          .single();

        if (!completedReport?.report_data) return;

        // Fetch active alert rules for this user
        const { data: alertRules } = await supabase
          .from('alert_rules')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (!alertRules || alertRules.length === 0) return;

        const { evaluateAlerts } = await import('@/lib/alert-evaluator');
        const triggered = evaluateAlerts(alertRules, completedReport.report_data as any);

        if (triggered.length === 0) return;

        // Insert alert history records
        const historyRecords = triggered.map((t) => ({
          alert_rule_id: t.ruleId,
          report_id: completedReport.id,
          metric_value: t.actualValue,
          threshold_value: t.threshold,
          email_sent: false,
        }));

        await supabase.from('alert_history').insert(historyRecords);

        // Update last_triggered_at for each triggered rule
        for (const t of triggered) {
          await supabase
            .from('alert_rules')
            .update({ last_triggered_at: new Date().toISOString() })
            .eq('id', t.ruleId);
        }

        // Send alert email
        const { data: userData } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', userId)
          .single();

        if (userData?.email) {
          const { sendEmail } = await import('@/lib/email');
          const { alertTriggeredEmail } = await import('@/lib/email-templates');

          const template = alertTriggeredEmail(
            userData.name,
            completedReport.slug,
            triggered.map((t) => ({
              ruleName: t.ruleName,
              actualValue: Math.round(t.actualValue * 100) / 100,
              threshold: t.threshold,
            }))
          );

          await sendEmail({
            to: userData.email,
            subject: template.subject,
            html: template.html,
          });

          // Mark history records as email_sent
          const ruleIds = triggered.map((t) => t.ruleId);
          await supabase
            .from('alert_history')
            .update({ email_sent: true })
            .eq('report_id', completedReport.id)
            .in('alert_rule_id', ruleIds);
        }

        console.log(`[Alerts] ${triggered.length} alert(s) triggered for report ${completedReport.slug}`);
      } catch (alertError) {
        console.error('Failed to evaluate alert rules:', alertError);
        // Don't fail the step — alerts are non-critical
      }
    });

    // Step 8: Generate AI insights (fire-and-forget)
    await step.run('generate-ai-insights', async () => {
      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          console.log('[AI Insights] Skipped (no ANTHROPIC_API_KEY)');
          return;
        }

        const { data: completedReport } = await supabase
          .from('reports')
          .select('id, report_data')
          .eq('id', reportId)
          .single();

        if (!completedReport?.report_data) return;

        const { generateAIInsights } = await import('@/lib/ai-insights-generator');
        const insights = await generateAIInsights(completedReport.report_data as any);

        if (insights) {
          await supabase
            .from('reports')
            .update({ ai_insights: insights })
            .eq('id', completedReport.id);

          console.log(`[AI Insights] Saved for report ${reportId}`);
        }
      } catch (aiError) {
        console.error('Failed to generate AI insights:', aiError);
        // Don't fail the step — AI insights are non-critical
      }
    });

    return { slug: reportSlug };
  }
);
