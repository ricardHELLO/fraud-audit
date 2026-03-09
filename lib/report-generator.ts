import { createServerClient } from './supabase'
import { NormalizedDataset } from './types/normalized'
import { runAnalysis } from './analysis-engine'

interface GenerateReportParams {
  userId: string
  organizationId: string | null
  dataset: NormalizedDataset
  slug: string
  posUploadId: string
  inventoryUploadId?: string
}

/**
 * Generate a fraud analysis report and persist it to the database.
 *
 * 1. Runs the full analysis pipeline on the normalized dataset
 * 2. Fetches the organization name for the report summary
 * 3. Saves the report to the `reports` table with status 'completed'
 * 4. Returns the report slug for URL construction
 */
export async function generateReport(
  params: GenerateReportParams
): Promise<string> {
  const {
    userId,
    organizationId,
    dataset,
    slug,
    posUploadId,
    inventoryUploadId,
  } = params

  const supabase = createServerClient()

  // Run the analysis
  const reportData = runAnalysis(dataset)

  // Fetch organization name to enrich the summary (skip if no org)
  let orgName = 'Tu restaurante'
  if (organizationId) {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single()

    orgName = orgData?.name ?? 'Tu restaurante'
  }

  reportData.summary.organization_name = orgName

  // Persist the report data (update existing record created by analyze API)
  const { error: updateError } = await supabase
    .from('reports')
    .update({
      status: 'completed',
      report_data: reportData,
      date_from: dataset.metadata.date_from,
      date_to: dataset.metadata.date_to,
      locations: dataset.metadata.locations,
      pos_connector: dataset.metadata.pos_connector,
      inventory_connector: dataset.metadata.inventory_connector ?? null,
    })
    .eq('slug', slug)

  if (updateError) {
    throw new Error(`Failed to save report: ${updateError.message}`)
  }

  return slug
}
