import { NormalizedInvoice } from '@/lib/types/normalized';
import {
  DeletedInvoicesResult,
  DeletedInvoicesByLocal,
  DeletedInvoicesByEmployee,
} from '@/lib/types/report';

const CONCENTRATION_THRESHOLD = 0.4;
// BUG-C04 fix: require a minimum absolute count before firing concentration alert.
// 1 invoice from 1 employee = 100% concentration → false alert with no context.
const MIN_DELETIONS_FOR_CONCENTRATION_ALERT = 5;

export function calculateDeletedInvoices(
  invoices: NormalizedInvoice[]
): DeletedInvoicesResult {
  // Filter only deleted invoices
  const deleted = invoices.filter((inv) => inv.status === 'deleted');

  // Group by local
  const localMap = new Map<string, { count: number; amount: number }>();
  for (const inv of deleted) {
    const entry = localMap.get(inv.location) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += inv.amount;
    localMap.set(inv.location, entry);
  }

  const byLocal: DeletedInvoicesByLocal[] = [];
  for (const [location, data] of localMap) {
    byLocal.push({
      location,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
    });
  }
  byLocal.sort((a, b) => b.amount - a.amount || a.location.localeCompare(b.location));

  // Group by employee (including their primary location)
  const employeeMap = new Map<
    string,
    { count: number; amount: number; locationCounts: Map<string, number> }
  >();
  for (const inv of deleted) {
    const entry = employeeMap.get(inv.employee) ?? {
      count: 0,
      amount: 0,
      locationCounts: new Map<string, number>(),
    };
    entry.count += 1;
    entry.amount += inv.amount;
    entry.locationCounts.set(
      inv.location,
      (entry.locationCounts.get(inv.location) ?? 0) + 1
    );
    employeeMap.set(inv.employee, entry);
  }

  const byEmployee: DeletedInvoicesByEmployee[] = [];
  for (const [employee, data] of employeeMap) {
    let primaryLocation = '';
    let maxCount = 0;
    for (const [loc, cnt] of data.locationCounts) {
      if (cnt > maxCount) {
        maxCount = cnt;
        primaryLocation = loc;
      }
    }

    byEmployee.push({
      employee,
      location: primaryLocation,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
    });
  }
  // Sort by amount descending for consistent ordering (count still available)
  byEmployee.sort((a, b) => b.amount - a.amount || a.employee.localeCompare(b.employee));

  const totalCount = deleted.length;
  const totalAmount =
    Math.round(deleted.reduce((sum, inv) => sum + inv.amount, 0) * 100) / 100;

  // BUG-C04 fix: require MIN_DELETIONS_FOR_CONCENTRATION_ALERT before alerting.
  // BUG-C05 fix: concentration based on AMOUNT (€), not count.
  //   3 invoices of 10€ (count: 60%) should not overshadow 2 invoices of 5000€ (amount: 44%).
  let concentrationAlert = '';
  if (
    byEmployee.length > 0 &&
    totalCount >= MIN_DELETIONS_FOR_CONCENTRATION_ALERT &&
    totalAmount > 0
  ) {
    // Find top employee by amount (byEmployee is already sorted by amount)
    const topByAmount = byEmployee[0];
    const topAmountPercentage = topByAmount.amount / totalAmount;

    if (topAmountPercentage > CONCENTRATION_THRESHOLD) {
      const pctFormatted = Math.round(topAmountPercentage * 100);
      concentrationAlert = `Concentraci\u00f3n an\u00f3mala en empleado ${topByAmount.employee} (${pctFormatted}% del importe de anulaciones: ${topByAmount.amount.toFixed(2)}\u20ac)`;
    }
  }

  return {
    by_local: byLocal,
    by_employee: byEmployee,
    total_count: totalCount,
    total_amount: totalAmount,
    concentration_alert: concentrationAlert,
  };
}
