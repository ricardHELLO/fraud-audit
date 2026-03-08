import { NormalizedInvoice } from '@/lib/types/normalized';
import {
  DeletedInvoicesResult,
  DeletedInvoicesByLocal,
  DeletedInvoicesByEmployee,
} from '@/lib/types/report';

const CONCENTRATION_THRESHOLD = 0.4;

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
  byLocal.sort((a, b) => b.amount - a.amount);

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
    // Determine primary location for this employee
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
  byEmployee.sort((a, b) => b.count - a.count);

  // Total count and amount
  const totalCount = deleted.length;
  const totalAmount =
    Math.round(deleted.reduce((sum, inv) => sum + inv.amount, 0) * 100) / 100;

  // Concentration alert: check if the top employee has > 40% of deletions
  let concentrationAlert = '';
  if (byEmployee.length > 0 && totalCount > 0) {
    const topEmployee = byEmployee[0];
    const topPercentage = topEmployee.count / totalCount;

    if (topPercentage > CONCENTRATION_THRESHOLD) {
      const pctFormatted = Math.round(topPercentage * 100);
      concentrationAlert = `Concentraci\u00f3n an\u00f3mala en empleado ${topEmployee.employee} (${pctFormatted}% de las anulaciones)`;
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
