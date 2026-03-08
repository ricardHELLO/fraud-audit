// --- Cash Discrepancy Calculator ---

export interface CashDiscrepancyLocal {
  name: string;
  total_discrepancy: number;
  days_with_shortage: number;
  total_days: number;
}

export interface CashDiscrepancyResult {
  locals: CashDiscrepancyLocal[];
  worst_local: string;
  alert_message: string;
}

// --- Deleted Invoices Calculator ---

export interface DeletedInvoicesByLocal {
  location: string;
  count: number;
  amount: number;
}

export interface DeletedInvoicesByEmployee {
  employee: string;
  location: string;
  count: number;
  amount: number;
}

export interface DeletedInvoicesResult {
  by_local: DeletedInvoicesByLocal[];
  by_employee: DeletedInvoicesByEmployee[];
  total_count: number;
  total_amount: number;
  concentration_alert: string;
}

// --- Deleted Products Calculator ---

export interface DeletedProductsByPhase {
  before_kitchen: { count: number; amount: number };
  after_kitchen: { count: number; amount: number };
  after_billing: { count: number; amount: number };
}

export interface DeletedProductsByLocal {
  location: string;
  count: number;
  amount: number;
  after_billing_percentage: number;
}

export interface DeletedProductsResult {
  total_eliminated: number;
  by_phase: DeletedProductsByPhase;
  by_local: DeletedProductsByLocal[];
  critical_alert: string;
}

// --- Waste Analysis Calculator ---

export interface WasteByLocal {
  location: string;
  total_waste: number;
  total_sales: number;
  waste_percentage: number;
}

export interface WasteAnalysisResult {
  total_waste: number;
  total_sales: number;
  waste_percentage: number;
  by_local: WasteByLocal[];
  benchmark_comparison: string;
  underreporting_alert: boolean;
}

// --- Inventory Deviation Calculator ---

export interface InventoryDeviationByMonth {
  month: string;
  total_deviation: number;
  product_count: number;
}

export interface InventoryDeviationByProduct {
  product_name: string;
  total_deviation: number;
  unit: string;
}

export interface InventoryDeviationRange {
  min: number;
  max: number;
}

export interface InventoryDeviationResult {
  by_month: InventoryDeviationByMonth[];
  by_product_top10: InventoryDeviationByProduct[];
  total_deviation_range: InventoryDeviationRange;
  main_cause: string;
}

// --- Correlation Calculator ---

export interface CorrelationScatterPoint {
  x: number;
  y: number;
  label: string;
}

export interface CorrelationPatternByLocal {
  location: string;
  pattern: string;
  strength: number;
}

export interface CorrelationResult {
  scatter_data: CorrelationScatterPoint[];
  correlation_exists: boolean;
  patterns_by_local: CorrelationPatternByLocal[];
}

// --- Conclusions Calculator ---

export interface Conclusion {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface ConclusionsResult {
  conclusions: Conclusion[];
  immediate_actions: string[];
  structural_actions: string[];
}

// --- Report Summary ---

export interface ReportSummary {
  organization_name: string;
  analysis_period: string;
  locations_count: number;
  overall_risk_level: 'critical' | 'high' | 'medium' | 'low';
  key_findings: string[];
}

// --- Full Report Data ---

export interface ReportData {
  summary: ReportSummary;
  cash_discrepancy: CashDiscrepancyResult;
  deleted_invoices: DeletedInvoicesResult;
  deleted_products: DeletedProductsResult;
  waste_analysis: WasteAnalysisResult;
  inventory_deviation: InventoryDeviationResult;
  correlation: CorrelationResult;
  conclusions: ConclusionsResult;
}
