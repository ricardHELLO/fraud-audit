import { NormalizedWaste, NormalizedDailySales } from '@/lib/types/normalized';
import { WasteAnalysisResult, WasteByLocal } from '@/lib/types/report';

const INDUSTRY_BENCHMARK_PCT = 3;
const BENCHMARK_TOLERANCE = 0.5;
const UNDERREPORTING_THRESHOLD_PCT = 1;

export function calculateWasteAnalysis(
  waste: NormalizedWaste[],
  sales: NormalizedDailySales[]
): WasteAnalysisResult {
  // Total waste
  const totalWaste =
    Math.round(waste.reduce((sum, w) => sum + w.total_cost, 0) * 100) / 100;

  // Total sales (net)
  const totalSales =
    Math.round(sales.reduce((sum, s) => sum + s.net_sales, 0) * 100) / 100;

  // Overall waste percentage
  const wastePercentage =
    totalSales > 0
      ? Math.round((totalWaste / totalSales) * 10000) / 100
      : 0;

  // Aggregate waste by location
  const wasteByLocationMap = new Map<string, number>();
  for (const w of waste) {
    wasteByLocationMap.set(
      w.location,
      (wasteByLocationMap.get(w.location) ?? 0) + w.total_cost
    );
  }

  // Aggregate sales by location
  const salesByLocationMap = new Map<string, number>();
  for (const s of sales) {
    salesByLocationMap.set(
      s.location,
      (salesByLocationMap.get(s.location) ?? 0) + s.net_sales
    );
  }

  // Collect all locations from both datasets
  const allLocations = new Set<string>([
    ...wasteByLocationMap.keys(),
    ...salesByLocationMap.keys(),
  ]);

  const byLocal: WasteByLocal[] = [];
  for (const location of allLocations) {
    const locWaste = wasteByLocationMap.get(location) ?? 0;
    const locSales = salesByLocationMap.get(location) ?? 0;
    const locPct =
      locSales > 0 ? Math.round((locWaste / locSales) * 10000) / 100 : 0;

    byLocal.push({
      location,
      total_waste: Math.round(locWaste * 100) / 100,
      total_sales: Math.round(locSales * 100) / 100,
      waste_percentage: locPct,
    });
  }
  byLocal.sort((a, b) => b.waste_percentage - a.waste_percentage);

  // Benchmark comparison against 3% industry standard
  let benchmarkComparison: string;
  if (wastePercentage < INDUSTRY_BENCHMARK_PCT - BENCHMARK_TOLERANCE) {
    benchmarkComparison = 'Por debajo del benchmark';
  } else if (wastePercentage > INDUSTRY_BENCHMARK_PCT + BENCHMARK_TOLERANCE) {
    benchmarkComparison = 'Por encima del benchmark';
  } else {
    benchmarkComparison = 'En l\u00ednea con el benchmark';
  }

  // Underreporting alert: suspiciously low waste
  const underreportingAlert = wastePercentage < UNDERREPORTING_THRESHOLD_PCT;

  return {
    total_waste: totalWaste,
    total_sales: totalSales,
    waste_percentage: wastePercentage,
    by_local: byLocal,
    benchmark_comparison: benchmarkComparison,
    underreporting_alert: underreportingAlert,
  };
}
