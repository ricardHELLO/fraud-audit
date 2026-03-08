import { NormalizedDailySales } from '@/lib/types/normalized';
import { CashDiscrepancyResult, CashDiscrepancyLocal } from '@/lib/types/report';

const SHORTAGE_THRESHOLD = -10;
const CRITICAL_SHORTAGE_THRESHOLD = 500;
const MODERATE_SHORTAGE_THRESHOLD = 200;

export function calculateCashDiscrepancy(
  sales: NormalizedDailySales[]
): CashDiscrepancyResult {
  // Group sales by location
  const locationMap = new Map<
    string,
    { totalDiscrepancy: number; daysWithShortage: number; totalDays: number }
  >();

  for (const sale of sales) {
    const entry = locationMap.get(sale.location) ?? {
      totalDiscrepancy: 0,
      daysWithShortage: 0,
      totalDays: 0,
    };

    entry.totalDiscrepancy += sale.cash_discrepancy;
    entry.totalDays += 1;

    if (sale.cash_discrepancy < SHORTAGE_THRESHOLD) {
      entry.daysWithShortage += 1;
    }

    locationMap.set(sale.location, entry);
  }

  // Build locals array
  const locals: CashDiscrepancyLocal[] = [];
  for (const [name, data] of locationMap) {
    locals.push({
      name,
      total_discrepancy: Math.round(data.totalDiscrepancy * 100) / 100,
      days_with_shortage: data.daysWithShortage,
      total_days: data.totalDays,
    });
  }

  // Sort by total_discrepancy ascending (most negative first)
  locals.sort((a, b) => a.total_discrepancy - b.total_discrepancy);

  // Find worst local (most negative total discrepancy)
  const worstLocal =
    locals.length > 0 ? locals[0].name : 'Sin datos';

  // Generate alert message based on severity
  const hasAnyCritical = locals.some(
    (l) => l.total_discrepancy < -CRITICAL_SHORTAGE_THRESHOLD
  );
  const hasAnyModerate = locals.some(
    (l) => l.total_discrepancy < -MODERATE_SHORTAGE_THRESHOLD
  );

  let alertMessage: string;
  if (hasAnyCritical) {
    alertMessage =
      'ALERTA CR\u00cdTICA: Descuadres significativos detectados';
  } else if (hasAnyModerate) {
    alertMessage = 'ALERTA: Descuadres moderados detectados';
  } else {
    alertMessage = 'Descuadres dentro de rangos normales';
  }

  return {
    locals,
    worst_local: worstLocal,
    alert_message: alertMessage,
  };
}
