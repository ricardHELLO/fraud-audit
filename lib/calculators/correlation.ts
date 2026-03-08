import {
  CashDiscrepancyResult,
  DeletedInvoicesResult,
  InventoryDeviationResult,
  CorrelationResult,
  CorrelationScatterPoint,
  CorrelationPatternByLocal,
} from '@/lib/types/report';

/**
 * Normalizes a value to 0-100 scale given a min and max.
 * Returns 0 if min === max (no variation).
 */
function normalizeToScale(
  value: number,
  min: number,
  max: number
): number {
  if (max === min) return 0;
  return ((value - min) / (max - min)) * 100;
}

export function calculateCorrelation(
  cash: CashDiscrepancyResult,
  invoices: DeletedInvoicesResult,
  inventory: InventoryDeviationResult
): CorrelationResult {
  // Build lookup maps by location name

  // Cash discrepancy by local
  const cashByLocal = new Map<string, number>();
  for (const local of cash.locals) {
    cashByLocal.set(local.name, local.total_discrepancy);
  }

  // Deleted invoices amount by local
  const invoicesByLocal = new Map<string, number>();
  for (const local of invoices.by_local) {
    invoicesByLocal.set(local.location, local.amount);
  }

  // Inventory deviation by local (aggregate from by_month is not per-location,
  // so we use total deviation range as a reference; but for per-local correlation
  // we need to extract from the top products or accept limitation)
  // Since InventoryDeviationResult does not have by_local, we use the overall
  // deviation range max as a proxy for inventory risk.

  // Collect all unique location names across datasets
  const allLocations = new Set<string>([
    ...cashByLocal.keys(),
    ...invoicesByLocal.keys(),
  ]);

  // --- Scatter data ---
  // x = deleted invoice amount, y = cash discrepancy (absolute value)
  const scatterData: CorrelationScatterPoint[] = [];
  for (const location of allLocations) {
    const deletedAmount = invoicesByLocal.get(location) ?? 0;
    const cashDiscrepancy = cashByLocal.get(location) ?? 0;

    scatterData.push({
      x: Math.round(deletedAmount * 100) / 100,
      y: Math.round(Math.abs(cashDiscrepancy) * 100) / 100,
      label: location,
    });
  }

  // --- Correlation heuristic ---
  // Check if locals with high deletions also tend to have high discrepancies.
  // Simple approach: rank locals by both metrics and check if rankings align.
  let correlationExists = false;

  if (scatterData.length >= 2) {
    // Sort by x (deleted invoices) and assign rank
    const sortedByX = [...scatterData].sort((a, b) => b.x - a.x);
    const rankByX = new Map<string, number>();
    sortedByX.forEach((p, i) => rankByX.set(p.label, i));

    // Sort by y (cash discrepancy absolute) and assign rank
    const sortedByY = [...scatterData].sort((a, b) => b.y - a.y);
    const rankByY = new Map<string, number>();
    sortedByY.forEach((p, i) => rankByY.set(p.label, i));

    // Compute Spearman rank correlation coefficient
    let sumDSquared = 0;
    const n = scatterData.length;
    for (const point of scatterData) {
      const d = (rankByX.get(point.label) ?? 0) - (rankByY.get(point.label) ?? 0);
      sumDSquared += d * d;
    }
    // Spearman: rho = 1 - (6 * sum(d^2)) / (n * (n^2 - 1))
    const rho = 1 - (6 * sumDSquared) / (n * (n * n - 1));

    // Consider correlation exists if rho > 0.5 (moderate positive correlation)
    correlationExists = rho > 0.5;
  }

  // --- Patterns by local ---
  // Determine risk factors and combined score for each location
  const inventoryDeviationMax = inventory.total_deviation_range.max;

  const patternsByLocal: CorrelationPatternByLocal[] = [];
  for (const location of allLocations) {
    const cashVal = Math.abs(cashByLocal.get(location) ?? 0);
    const invoiceVal = invoicesByLocal.get(location) ?? 0;

    const riskFactors: string[] = [];

    // Cash discrepancy risk
    if (cashVal > 500) {
      riskFactors.push('Descuadres de caja cr\u00edticos');
    } else if (cashVal > 200) {
      riskFactors.push('Descuadres de caja moderados');
    }

    // Invoice deletion risk
    if (invoiceVal > 1000) {
      riskFactors.push('Alto volumen de facturas anuladas');
    } else if (invoiceVal > 500) {
      riskFactors.push('Volumen moderado de facturas anuladas');
    }

    // If both cash and invoice issues exist, note the correlation
    if (cashVal > 200 && invoiceVal > 500) {
      riskFactors.push('Correlaci\u00f3n entre anulaciones y descuadres');
    }

    // Combined risk score (0-100)
    // Weighted: 40% cash discrepancy, 40% invoice deletions, 20% inventory
    const maxCash = Math.max(...[...cashByLocal.values()].map(Math.abs), 1);
    const maxInvoice = Math.max(...[...invoicesByLocal.values()], 1);
    const maxInventory = Math.max(inventoryDeviationMax, 1);

    const cashScore = normalizeToScale(cashVal, 0, maxCash) * 0.4;
    const invoiceScore = normalizeToScale(invoiceVal, 0, maxInvoice) * 0.4;
    const inventoryScore =
      normalizeToScale(inventoryDeviationMax, 0, maxInventory) * 0.2;

    const combinedScore = Math.round(cashScore + invoiceScore + inventoryScore);

    // Determine overall pattern description
    let pattern: string;
    if (riskFactors.length === 0) {
      pattern = 'Sin anomal\u00edas significativas';
    } else if (riskFactors.length >= 3) {
      pattern = 'M\u00faltiples indicadores de riesgo convergentes';
    } else {
      pattern = riskFactors.join('; ');
    }

    patternsByLocal.push({
      location,
      pattern,
      strength: combinedScore,
    });
  }

  patternsByLocal.sort((a, b) => b.strength - a.strength);

  return {
    scatter_data: scatterData,
    correlation_exists: correlationExists,
    patterns_by_local: patternsByLocal,
  };
}
