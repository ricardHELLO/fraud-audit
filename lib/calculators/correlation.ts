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

// BUG-C08 fix: Spearman is statistically invalid with n < 4.
// With n=2, rho = 1 - (6*0)/(2*3) = 1.0 always → guaranteed false positive.
const MIN_LOCATIONS_FOR_CORRELATION = 4;

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

  // Collect all unique location names across datasets
  const allLocations = new Set<string>([
    ...cashByLocal.keys(),
    ...invoicesByLocal.keys(),
  ]);

  // --- Scatter data ---
  // x = deleted invoice amount, y = cash discrepancy (absolute value)
  const sortedLocations = [...allLocations].sort((a, b) => a.localeCompare(b));
  const scatterData: CorrelationScatterPoint[] = [];
  for (const location of sortedLocations) {
    const deletedAmount = invoicesByLocal.get(location) ?? 0;
    const cashDiscrepancy = cashByLocal.get(location) ?? 0;

    scatterData.push({
      x: Math.round(deletedAmount * 100) / 100,
      y: Math.round(Math.abs(cashDiscrepancy) * 100) / 100,
      label: location,
    });
  }

  // --- Correlation heuristic (Spearman rank correlation) ---
  let correlationExists = false;

  // BUG-C08 fix: require MIN_LOCATIONS_FOR_CORRELATION (4) for statistical validity
  if (scatterData.length >= MIN_LOCATIONS_FOR_CORRELATION) {
    const sortedByX = [...scatterData].sort((a, b) => b.x - a.x || a.label.localeCompare(b.label));
    const rankByX = new Map<string, number>();
    sortedByX.forEach((p, i) => rankByX.set(p.label, i));

    const sortedByY = [...scatterData].sort((a, b) => b.y - a.y || a.label.localeCompare(b.label));
    const rankByY = new Map<string, number>();
    sortedByY.forEach((p, i) => rankByY.set(p.label, i));

    let sumDSquared = 0;
    const n = scatterData.length;
    for (const point of scatterData) {
      const d = (rankByX.get(point.label) ?? 0) - (rankByY.get(point.label) ?? 0);
      sumDSquared += d * d;
    }
    const rho = 1 - (6 * sumDSquared) / (n * (n * n - 1));
    correlationExists = rho > 0.5;
  }

  // --- Patterns by local ---
  const patternsByLocal: CorrelationPatternByLocal[] = [];
  for (const location of allLocations) {
    const cashVal = Math.abs(cashByLocal.get(location) ?? 0);
    const invoiceVal = invoicesByLocal.get(location) ?? 0;

    const riskFactors: string[] = [];

    if (cashVal > 500) {
      riskFactors.push('Descuadres de caja cr\u00edticos');
    } else if (cashVal > 200) {
      riskFactors.push('Descuadres de caja moderados');
    }

    if (invoiceVal > 1000) {
      riskFactors.push('Alto volumen de facturas anuladas');
    } else if (invoiceVal > 500) {
      riskFactors.push('Volumen moderado de facturas anuladas');
    }

    if (cashVal > 200 && invoiceVal > 500) {
      riskFactors.push('Correlaci\u00f3n entre anulaciones y descuadres');
    }

    // BUG-C09 fix: inventory.total_deviation_range.max is GLOBAL (not per-local),
    // so normalizeToScale(globalMax, 0, globalMax) = 100 for ALL locals.
    // Disable inventory component (set to 0) until by_local data is available.
    // Rebalance weights: 50% cash + 50% invoices.
    const maxCash = Math.max(...[...cashByLocal.values()].map(Math.abs), 1);
    const maxInvoice = Math.max(...[...invoicesByLocal.values()], 1);

    const cashScore = normalizeToScale(cashVal, 0, maxCash) * 0.5;
    const invoiceScore = normalizeToScale(invoiceVal, 0, maxInvoice) * 0.5;
    // inventoryScore omitted (BUG-C09): will be re-enabled when by_local exists

    const combinedScore = Math.round(cashScore + invoiceScore);

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

  patternsByLocal.sort((a, b) => b.strength - a.strength || a.location.localeCompare(b.location));

  return {
    scatter_data: scatterData,
    correlation_exists: correlationExists,
    patterns_by_local: patternsByLocal,
  };
}
