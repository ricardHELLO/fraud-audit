import { NormalizedInventoryDeviation } from '@/lib/types/normalized';
import {
  InventoryDeviationResult,
  InventoryDeviationByMonth,
  InventoryDeviationByProduct,
  InventoryDeviationRange,
} from '@/lib/types/report';

const TOP_PRODUCTS_LIMIT = 10;
const DOMINANT_PRODUCT_THRESHOLD = 0.3;

export function calculateInventoryDeviation(
  deviations: NormalizedInventoryDeviation[]
): InventoryDeviationResult {
  // --- By month ---
  const monthMap = new Map<
    string,
    { totalDeviation: number; products: Set<string> }
  >();

  for (const d of deviations) {
    const entry = monthMap.get(d.month) ?? {
      totalDeviation: 0,
      products: new Set<string>(),
    };
    entry.totalDeviation += Math.abs(d.deviation);
    entry.products.add(d.product_name);
    monthMap.set(d.month, entry);
  }

  const byMonth: InventoryDeviationByMonth[] = [];
  for (const [month, data] of monthMap) {
    byMonth.push({
      month,
      total_deviation: Math.round(data.totalDeviation * 100) / 100,
      product_count: data.products.size,
    });
  }
  byMonth.sort((a, b) => a.month.localeCompare(b.month));

  // --- By product top 10 ---
  const productMap = new Map<
    string,
    { totalDeviation: number; unit: string }
  >();

  for (const d of deviations) {
    const entry = productMap.get(d.product_name) ?? {
      totalDeviation: 0,
      unit: d.unit,
    };
    entry.totalDeviation += Math.abs(d.deviation);
    productMap.set(d.product_name, entry);
  }

  const allProducts: InventoryDeviationByProduct[] = [];
  for (const [productName, data] of productMap) {
    allProducts.push({
      product_name: productName,
      total_deviation: Math.round(data.totalDeviation * 100) / 100,
      unit: data.unit,
    });
  }
  allProducts.sort((a, b) => b.total_deviation - a.total_deviation || a.product_name.localeCompare(b.product_name));

  const byProductTop10 = allProducts.slice(0, TOP_PRODUCTS_LIMIT);

  // --- Total deviation range across months ---
  let totalDeviationRange: InventoryDeviationRange;
  if (byMonth.length > 0) {
    const monthDeviations = byMonth.map((m) => m.total_deviation);
    totalDeviationRange = {
      min: Math.min(...monthDeviations),
      max: Math.max(...monthDeviations),
    };
  } else {
    totalDeviationRange = { min: 0, max: 0 };
  }

  // --- Main cause heuristic ---
  const totalAbsoluteDeviation = allProducts.reduce(
    (sum, p) => sum + p.total_deviation,
    0
  );

  let mainCause: string;
  if (
    byProductTop10.length > 0 &&
    totalAbsoluteDeviation > 0 &&
    byProductTop10[0].total_deviation / totalAbsoluteDeviation >
      DOMINANT_PRODUCT_THRESHOLD
  ) {
    const topProduct = byProductTop10[0];
    const pct = Math.round(
      (topProduct.total_deviation / totalAbsoluteDeviation) * 100
    );
    mainCause = `Producto dominante: ${topProduct.product_name} (${pct}% de la desviaci\u00f3n total)`;
  } else {
    mainCause = 'Desviaciones distribuidas entre m\u00faltiples productos';
  }

  return {
    by_month: byMonth,
    by_product_top10: byProductTop10,
    total_deviation_range: totalDeviationRange,
    main_cause: mainCause,
  };
}
