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

  // BUG-C01 + BUG-C02 fix: Sort by Math.abs(total_discrepancy) descending
  // so worst_local is the largest absolute deviation (faltante OR sobrante)
  locals.sort(
    (a, b) =>
      Math.abs(b.total_discrepancy) - Math.abs(a.total_discrepancy) ||
      a.name.localeCompare(b.name)
  );

  const worstLocal = locals.length > 0 ? locals[0].name : 'Sin datos';

  // BUG-C01 fix: use Math.abs() to detect both shortages AND surpluses
  const hasAnyCritical = locals.some(
    (l) => Math.abs(l.total_discrepancy) > CRITICAL_SHORTAGE_THRESHOLD
  );
  const hasAnyModerate = locals.some(
    (l) => Math.abs(l.total_discrepancy) > MODERATE_SHORTAGE_THRESHOLD
  );

  // Distinguish direction for more informative message
  const worstValue = locals.length > 0 ? locals[0].total_discrepancy : 0;
  const alertType = worstValue < 0 ? 'faltante' : 'sobrante';

  let alertMessage: string;
  if (hasAnyCritical) {
    alertMessage = `ALERTA CR\u00cdTICA: Descuadres significativos detectados (${alertType} superior a ${CRITICAL_SHORTAGE_THRESHOLD}\u20ac)`;
  } else if (hasAnyModerate) {
    alertMessage = `ALERTA: Descuadres moderados detectados (${alertType})`;
  } else {
    alertMessage = 'Descuadres dentro de rangos normales';
  }

  return {
    locals,
    worst_local: worstLocal,
    alert_message: alertMessage,
  };
}
