import { NormalizedDataset } from './types/normalized'
import {
  ReportData,
  ReportSummary,
  CashDiscrepancyResult,
  DeletedInvoicesResult,
  DeletedProductsResult,
  WasteAnalysisResult,
  InventoryDeviationResult,
  CorrelationResult,
  ConclusionsResult,
  Conclusion,
} from './types/report'
import { calculateCashDiscrepancy } from './calculators/cash-discrepancy'
import { calculateDeletedInvoices } from './calculators/deleted-invoices'
import { calculateDeletedProducts } from './calculators/deleted-products'
import { calculateWasteAnalysis } from './calculators/waste-analysis'
import { calculateInventoryDeviation } from './calculators/inventory-deviation'
import { calculateCorrelation } from './calculators/correlation'
import { generateConclusions } from './calculators/conclusions'

/**
 * Determine the overall risk level based on the highest severity
 * found in the conclusions.
 */
function determineOverallRisk(
  conclusions: Conclusion[]
): 'critical' | 'high' | 'medium' | 'low' {
  const severityOrder: Array<'critical' | 'high' | 'medium' | 'low'> = [
    'critical',
    'high',
    'medium',
    'low',
  ]

  for (const level of severityOrder) {
    if (conclusions.some((c) => c.severity === level)) {
      return level
    }
  }

  return 'low'
}

/**
 * Extract the top key findings from the conclusions list.
 * Returns titles of the most severe conclusions (up to 5).
 */
function extractKeyFindings(conclusions: Conclusion[]): string[] {
  const severityWeight: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }

  const sorted = [...conclusions].sort(
    (a, b) =>
      (severityWeight[b.severity] ?? 0) - (severityWeight[a.severity] ?? 0) || a.title.localeCompare(b.title)
  )

  return sorted.slice(0, 5).map((c) => c.title)
}

/**
 * Build the report summary from the dataset metadata and conclusions.
 */
function buildSummary(
  dataset: NormalizedDataset,
  conclusionsResult: ConclusionsResult
): ReportSummary {
  const { metadata } = dataset
  const { conclusions } = conclusionsResult

  return {
    organization_name: '', // Will be populated by report-generator with org data
    analysis_period: `${metadata.date_from} - ${metadata.date_to}`,
    locations_count: metadata.locations.length,
    overall_risk_level: determineOverallRisk(conclusions),
    key_findings: extractKeyFindings(conclusions),
  }
}

/**
 * Run the full fraud analysis pipeline on a normalized dataset.
 *
 * Calls each individual calculator module and combines their results
 * into a complete ReportData object with a computed summary.
 */
export function runAnalysis(dataset: NormalizedDataset): ReportData {
  // Run each calculator with the appropriate data slices
  const cashDiscrepancy: CashDiscrepancyResult =
    calculateCashDiscrepancy(dataset.daily_sales)

  const deletedInvoices: DeletedInvoicesResult =
    calculateDeletedInvoices(dataset.invoices)

  const deletedProducts: DeletedProductsResult =
    calculateDeletedProducts(dataset.deleted_products)

  const wasteAnalysis: WasteAnalysisResult = calculateWasteAnalysis(
    dataset.waste,
    dataset.daily_sales
  )

  const inventoryDeviation: InventoryDeviationResult =
    calculateInventoryDeviation(dataset.inventory_deviations)

  const correlation: CorrelationResult = calculateCorrelation(
    cashDiscrepancy,
    deletedInvoices,
    inventoryDeviation
  )

  // Conclusions need all previous results
  const conclusions: ConclusionsResult = generateConclusions({
    cash: cashDiscrepancy,
    invoices: deletedInvoices,
    products: deletedProducts,
    waste: wasteAnalysis,
    inventory: inventoryDeviation,
    correlation,
  })

  // Build the summary
  const summary = buildSummary(dataset, conclusions)

  return {
    summary,
    cash_discrepancy: cashDiscrepancy,
    deleted_invoices: deletedInvoices,
    deleted_products: deletedProducts,
    waste_analysis: wasteAnalysis,
    inventory_deviation: inventoryDeviation,
    correlation,
    conclusions,
  }
}
