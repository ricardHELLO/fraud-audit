import Papa from 'papaparse';
import {
  NormalizedWaste,
  NormalizedInventoryDeviation,
  NormalizedDataset,
} from '@/lib/types/normalized';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Spanish-formatted date string (DD/MM/YYYY or DD-MM-YYYY) to
 * ISO date (YYYY-MM-DD).  Also handles YYYY-MM-DD pass-through.
 */
function parseSpanishDate(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  const trimmed = raw.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Already ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  return '';
}

/**
 * Parse a month field. T-Spoon Lab may export months as:
 *   - "Enero 2024", "Febrero 2024", etc. (Spanish month + year)
 *   - "01/2024", "2024-01" (numeric)
 *   - "January 2024" (English)
 * Normalised output: YYYY-MM
 */
function parseMonth(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  const trimmed = raw.trim();

  // Already YYYY-MM
  const isoMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return trimmed;

  // MM/YYYY
  const slashMonth = trimmed.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (slashMonth) {
    const [, month, year] = slashMonth;
    return `${year}-${month.padStart(2, '0')}`;
  }

  // YYYY/MM
  const reverseSlash = trimmed.match(/^(\d{4})[/\-](\d{1,2})$/);
  if (reverseSlash) {
    const [, year, month] = reverseSlash;
    return `${year}-${month.padStart(2, '0')}`;
  }

  // Spanish month name + year
  const spanishMonths: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  };

  const englishMonths: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };

  const lower = trimmed.toLowerCase();
  for (const [name, num] of Object.entries({ ...spanishMonths, ...englishMonths })) {
    if (lower.includes(name)) {
      const yearMatch = trimmed.match(/(\d{4})/);
      if (yearMatch) return `${yearMatch[1]}-${num}`;
    }
  }

  return '';
}

/**
 * Parse a numeric value that may use Spanish locale formatting.
 */
function parseNumber(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;

  const trimmed = String(raw).trim();
  if (trimmed === '' || trimmed === '-') return 0;

  let cleaned = trimmed.replace(/[€$\s]/g, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    const afterComma = cleaned.substring(lastComma + 1);
    if (afterComma.length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(',', '');
    }
  }

  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Normalise a column header for resilient matching.
 */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Lookup a value from a row using candidate column names. */
function getField(row: Record<string, string>, candidates: string[]): string {
  for (const candidate of candidates) {
    for (const key of Object.keys(row)) {
      if (normalizeHeader(key) === normalizeHeader(candidate)) {
        return (row[key] ?? '').trim();
      }
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------

type SectionType = 'waste' | 'inventory' | 'unknown';

function detectSection(headers: string[]): SectionType {
  const joined = headers.map(normalizeHeader).join(' ');

  // Waste heuristics -- look for cost-related columns alongside product/quantity
  if (
    (joined.includes('coste') || joined.includes('cost') || joined.includes('merma') || joined.includes('desperdicio')) &&
    (joined.includes('producto') || joined.includes('product')) &&
    (joined.includes('cantidad') || joined.includes('quantity'))
  ) {
    return 'waste';
  }

  // Inventory deviation heuristics
  if (
    (joined.includes('consumo teorico') || joined.includes('theoretical') || joined.includes('teorico')) &&
    (joined.includes('consumo real') || joined.includes('actual') || joined.includes('desviacion') || joined.includes('deviation'))
  ) {
    return 'inventory';
  }

  // Additional check: if "mes" or "month" appears with "desviacion" or "deviation"
  if (
    (joined.includes('mes') || joined.includes('month')) &&
    (joined.includes('desviacion') || joined.includes('deviation'))
  ) {
    return 'inventory';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseTSpoonLab(csvContent: string): Partial<NormalizedDataset> {
  // Reset counter for each parse run
  idCounter = 0;

  if (!csvContent || typeof csvContent !== 'string' || csvContent.trim().length === 0) {
    throw new Error('T-Spoon Lab parser received empty or invalid CSV content.');
  }

  // Split on blank-line boundaries to handle multi-section exports
  const sectionTexts = csvContent.split(/\n\s*\n/).filter((s) => s.trim().length > 0);

  const waste: NormalizedWaste[] = [];
  const inventoryDeviations: NormalizedInventoryDeviation[] = [];
  const allDates: string[] = [];
  const allMonths: string[] = [];
  const allLocations = new Set<string>();

  for (const sectionText of sectionTexts) {
    const parseResult = Papa.parse<Record<string, string>>(sectionText.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (!parseResult.data || parseResult.data.length === 0) continue;

    const headers = parseResult.meta.fields ?? Object.keys(parseResult.data[0] || {});
    const section = detectSection(headers);

    if (section === 'waste') {
      parseWasteRows(parseResult.data, waste, allDates, allLocations);
    } else if (section === 'inventory') {
      parseInventoryRows(parseResult.data, inventoryDeviations, allMonths, allLocations);
    } else {
      // Ambiguous: try both
      parseWasteRows(parseResult.data, waste, allDates, allLocations);
      parseInventoryRows(parseResult.data, inventoryDeviations, allMonths, allLocations);
    }
  }

  // Fallback single-pass parse if section splitting found nothing
  if (waste.length === 0 && inventoryDeviations.length === 0) {
    const parseResult = Papa.parse<Record<string, string>>(csvContent.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parseResult.data && parseResult.data.length > 0) {
      const headers = parseResult.meta.fields ?? Object.keys(parseResult.data[0] || {});
      const section = detectSection(headers);

      if (section === 'waste' || section === 'unknown') {
        parseWasteRows(parseResult.data, waste, allDates, allLocations);
      }
      if (section === 'inventory' || section === 'unknown') {
        parseInventoryRows(parseResult.data, inventoryDeviations, allMonths, allLocations);
      }
    }
  }

  // Compute date range from waste dates and inventory months
  const sortedDates = allDates.filter(Boolean).sort();
  const sortedMonths = allMonths.filter(Boolean).sort();

  let dateFrom = sortedDates[0] || '';
  let dateTo = sortedDates[sortedDates.length - 1] || '';

  // If we only have month-level data, synthesise date boundaries
  if (!dateFrom && sortedMonths.length > 0) {
    dateFrom = `${sortedMonths[0]}-01`;
  }
  if (!dateTo && sortedMonths.length > 0) {
    const lastMonth = sortedMonths[sortedMonths.length - 1];
    // BUG-P10 fix: compute the real last day of the month instead of hardcoding 28.
    // Day 0 of month+1 = last day of lastMonth.
    const [y, m] = lastMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate(); // getDate() on day 0 of next month
    dateTo = `${lastMonth}-${String(lastDay).padStart(2, '0')}`;
  }

  return {
    waste,
    inventory_deviations: inventoryDeviations,
    metadata: {
      date_from: dateFrom,
      date_to: dateTo,
      locations: Array.from(allLocations),
      pos_connector: '',
      inventory_connector: 'tspoonlab',
    },
  };
}

// ---------------------------------------------------------------------------
// Waste rows
// ---------------------------------------------------------------------------

function parseWasteRows(
  rows: Record<string, string>[],
  waste: NormalizedWaste[],
  allDates: string[],
  allLocations: Set<string>,
): void {
  for (const row of rows) {
    try {
      const dateRaw = getField(row, [
        'Fecha', 'fecha', 'Date', 'date',
      ]);
      const date = parseSpanishDate(dateRaw);
      if (!date) continue;

      const location = getField(row, [
        'Local', 'Centro', 'local', 'centro', 'Location', 'location',
        'Establecimiento', 'Restaurante',
      ]);

      const productName = getField(row, [
        'Producto', 'producto', 'Product', 'product', 'Artículo', 'Articulo',
        'Nombre', 'Descripcion',
      ]);
      if (!productName) continue;

      const quantity = parseNumber(
        getField(row, ['Cantidad', 'cantidad', 'Quantity', 'quantity', 'Qty', 'Uds']),
      );
      const unit = getField(row, [
        'Unidad', 'unidad', 'Unit', 'unit', 'Ud', 'Medida',
      ]) || 'ud';

      const unitCost = parseNumber(
        getField(row, [
          'Coste Unitario', 'coste unitario', 'Unit Cost', 'unit_cost',
          'Precio Unitario', 'Coste unitario', 'Cost',
        ]),
      );
      const totalCost = parseNumber(
        getField(row, [
          'Coste Total', 'coste total', 'Total Cost', 'total_cost',
          'Coste', 'Total', 'Importe',
        ]),
      );

      waste.push({
        id: nextId('wst'),
        date,
        location: location || 'Unknown',
        product_name: productName,
        quantity: quantity || 1,
        unit,
        unit_cost: unitCost !== 0 ? unitCost : (totalCost !== 0 && quantity ? totalCost / quantity : 0),
        // BUG-P11 fix: use !== 0 instead of || to allow legitimate total_cost=0.
        // Previously totalCost=0 (falsy) was silently overwritten with unitCost*quantity.
        total_cost: totalCost !== 0 ? totalCost : unitCost * (quantity || 1),
      });

      allDates.push(date);
      if (location) allLocations.add(location);
    } catch {
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Inventory deviation rows
// ---------------------------------------------------------------------------

function parseInventoryRows(
  rows: Record<string, string>[],
  inventoryDeviations: NormalizedInventoryDeviation[],
  allMonths: string[],
  allLocations: Set<string>,
): void {
  for (const row of rows) {
    try {
      const monthRaw = getField(row, [
        'Mes', 'mes', 'Month', 'month', 'Periodo', 'periodo', 'Period',
      ]);
      const month = parseMonth(monthRaw);
      if (!month) continue;

      const location = getField(row, [
        'Local', 'Centro', 'local', 'centro', 'Location', 'location',
        'Establecimiento', 'Restaurante',
      ]);

      const productName = getField(row, [
        'Producto', 'producto', 'Product', 'product', 'Artículo', 'Articulo',
        'Nombre', 'Ingrediente',
      ]);
      if (!productName) continue;

      const theoreticalConsumption = parseNumber(
        getField(row, [
          'Consumo Teorico', 'Consumo Teórico', 'consumo teorico',
          'Theoretical Consumption', 'theoretical_consumption',
          'Consumo teorico', 'Teorico',
        ]),
      );

      const actualConsumption = parseNumber(
        getField(row, [
          'Consumo Real', 'consumo real', 'Actual Consumption', 'actual_consumption',
          'Real', 'Consumo real',
        ]),
      );

      const deviationRaw = getField(row, [
        'Desviacion', 'Desviación', 'desviacion', 'Deviation', 'deviation',
        'Diferencia', 'Diff',
      ]);

      // BUG-P12 fix: validate CSV deviation against calculated value.
      // If they differ by more than rounding tolerance, trust the calculation.
      const calculatedDeviation = actualConsumption - theoreticalConsumption;
      let deviation: number;
      if (deviationRaw) {
        const csvDeviation = parseNumber(deviationRaw);
        const discrepancy = Math.abs(csvDeviation - calculatedDeviation);
        // Allow ≤1 unit rounding error; beyond that, prefer the calculated value
        deviation = discrepancy <= 1 ? csvDeviation : calculatedDeviation;
      } else {
        deviation = calculatedDeviation;
      }

      const unit = getField(row, [
        'Unidad', 'unidad', 'Unit', 'unit', 'Ud', 'Medida',
      ]) || 'ud';

      // Skip rows where we have no meaningful consumption data
      if (theoreticalConsumption === 0 && actualConsumption === 0) continue;

      inventoryDeviations.push({
        month,
        location: location || 'Unknown',
        product_name: productName,
        theoretical_consumption: theoreticalConsumption,
        actual_consumption: actualConsumption,
        deviation,
        unit,
      });

      allMonths.push(month);
      if (location) allLocations.add(location);
    } catch {
      continue;
    }
  }
}
