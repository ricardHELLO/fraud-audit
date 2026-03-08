import { NormalizedDeletedProduct } from '@/lib/types/normalized';
import {
  DeletedProductsResult,
  DeletedProductsByPhase,
  DeletedProductsByLocal,
} from '@/lib/types/report';

type Phase = 'before_kitchen' | 'after_kitchen' | 'after_billing';

const CRITICAL_AFTER_BILLING_THRESHOLD = 0.2;

export function calculateDeletedProducts(
  products: NormalizedDeletedProduct[]
): DeletedProductsResult {
  const totalEliminated = products.length;

  // Aggregate by phase
  const phaseAccumulator: Record<Phase, { count: number; amount: number }> = {
    before_kitchen: { count: 0, amount: 0 },
    after_kitchen: { count: 0, amount: 0 },
    after_billing: { count: 0, amount: 0 },
  };

  for (const product of products) {
    const entry = phaseAccumulator[product.phase];
    entry.count += 1;
    entry.amount += product.total_amount;
  }

  const byPhase: DeletedProductsByPhase = {
    before_kitchen: {
      count: phaseAccumulator.before_kitchen.count,
      amount:
        Math.round(phaseAccumulator.before_kitchen.amount * 100) / 100,
    },
    after_kitchen: {
      count: phaseAccumulator.after_kitchen.count,
      amount:
        Math.round(phaseAccumulator.after_kitchen.amount * 100) / 100,
    },
    after_billing: {
      count: phaseAccumulator.after_billing.count,
      amount:
        Math.round(phaseAccumulator.after_billing.amount * 100) / 100,
    },
  };

  // Aggregate by local, tracking phase distribution per location
  const localMap = new Map<
    string,
    {
      count: number;
      amount: number;
      phaseCounts: Record<Phase, number>;
    }
  >();

  for (const product of products) {
    const entry = localMap.get(product.location) ?? {
      count: 0,
      amount: 0,
      phaseCounts: { before_kitchen: 0, after_kitchen: 0, after_billing: 0 },
    };
    entry.count += 1;
    entry.amount += product.total_amount;
    entry.phaseCounts[product.phase] += 1;
    localMap.set(product.location, entry);
  }

  const byLocal: DeletedProductsByLocal[] = [];
  for (const [location, data] of localMap) {
    // Calculate after_billing percentage for this location
    const afterBillingPct =
      data.count > 0
        ? Math.round((data.phaseCounts.after_billing / data.count) * 10000) /
          100
        : 0;

    byLocal.push({
      location,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
      after_billing_percentage: afterBillingPct,
    });
  }
  byLocal.sort((a, b) => b.amount - a.amount);

  // Critical alert: if after_billing > 20% of total
  let criticalAlert = '';
  if (totalEliminated > 0) {
    const afterBillingRatio =
      phaseAccumulator.after_billing.count / totalEliminated;
    if (afterBillingRatio > CRITICAL_AFTER_BILLING_THRESHOLD) {
      const pctFormatted = Math.round(afterBillingRatio * 100);
      criticalAlert = `CR\u00cdTICO: Alto porcentaje de eliminaciones post-facturaci\u00f3n (${pctFormatted}%)`;
    }
  }

  return {
    total_eliminated: totalEliminated,
    by_phase: byPhase,
    by_local: byLocal,
    critical_alert: criticalAlert,
  };
}
