import Papa from 'papaparse';
import {
  NormalizedDailySales,
  NormalizedInvoice,
  NormalizedDeletedProduct,
  NormalizedDataset,
} from '@/lib/types/normalized';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Spanish-formatted date string (DD/MM/YYYY or DD-MM-YYYY) to
 * ISO date (YYYY-MM-DD). Returns an empty string when the input cannot be
 * parsed so down-stream callers can decide how to handle it.
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

  // Already in YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  return '';
}

/**
 * Parse a numeric value that may use Spanish locale formatting:
 *   - thousands separator: `.` (dot)
 *   - decimal separator:   `,` (comma)
 * Falls back to plain parseFloat for standard English formatting.
 */
function parseNumber(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;

  const trimmed = String(raw).trim();
  if (trimmed === '' || trimmed === '-') return 0;

  // Remove currency symbols, whitespace, and other non-numeric noise
  let cleaned = trimmed.replace(/[€$\s]/g, '');

  // Detect Spanish locale: if there is a comma AND it is after the last dot
  // (e.g. "1.234,56") treat comma as decimal separator.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Spanish format: dots are thousands separators, comma is decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    // English format with comma as thousands separator
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma present -- treat as decimal if digits after comma <= 2
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
 * Normalise a column header so we can do resilient matching.
 * Lower-cases, strips accents/diacritics, trims, and collapses whitespace.
 */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tiny helper to look up a value from a row using a set of candidate keys. */
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

/**
 * Map a Spanish deletion-phase label to our normalised enum.
 */
function mapDeletionPhase(
  raw: string,
): 'before_kitchen' | 'after_kitchen' | 'after_billing' {
  const lower = normalizeHeader(raw);

  if (lower.includes('antes') && lower.includes('cocina')) return 'before_kitchen';
  if (lower.includes('despues') && lower.includes('cocina')) return 'after_kitchen';
  if (lower.includes('antes') && lower.includes('envio')) return 'before_kitchen';
  if (lower.includes('despues') && (lower.includes('cobro') || lower.includes('factura')))
    return 'after_billing';
  if (lower.includes('before') && lower.includes('kitchen')) return 'before_kitchen';
  if (lower.includes('after') && lower.includes('kitchen')) return 'after_kitchen';
  if (lower.includes('after') && lower.includes('billing')) return 'after_billing';

  // Default to the most concerning phase when unrecognised
  return 'after_billing';
}

/**
 * Map a Spanish invoice status to our normalised enum.
 */
function mapInvoiceStatus(raw: string): 'active' | 'deleted' {
  const lower = normalizeHeader(raw);
  if (lower.includes('eliminad') || lower.includes('deleted') || lower.includes('anulad') || lower.includes('cancel')) {
    return 'deleted';
  }
  return 'active';
}

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------

/**
 * Last.app exports may contain multiple sections within the same CSV
 * separated by blank rows or section headers. This function attempts to
 * detect which "type" of data a row belongs to by inspecting headers or
 * row content.
 */
type SectionType = 'sales' | 'invoices' | 'unknown';

function detectSection(headers: string[]): SectionType {
  const joined = headers.map(normalizeHeader).join(' ');

  // Sales section heuristics
  if (
    (joined.includes('ventas bruta') || joined.includes('gross_sales') || joined.includes('ventas neta')) &&
    (joined.includes('efectivo') || joined.includes('cash') || joined.includes('descuadre') || joined.includes('discrepancy'))
  ) {
    return 'sales';
  }

  // Invoice section heuristics
  if (
    (joined.includes('factura') || joined.includes('invoice')) &&
    (joined.includes('empleado') || joined.includes('employee') || joined.includes('importe') || joined.includes('amount'))
  ) {
    return 'invoices';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function parseLastApp(csvContent: string): Partial<NormalizedDataset> {
  // Reset counter for each parse run
  idCounter = 0;

  if (!csvContent || typeof csvContent !== 'string' || csvContent.trim().length === 0) {
    throw new Error('Last.app parser received empty or invalid CSV content.');
  }

  // ----- Phase 1: split on blank-line boundaries to detect multiple sections -----
  // Some Last.app exports stack multiple report tables vertically separated by
  // one or more blank lines.  We split on those boundaries and parse each
  // section independently.
  const sectionTexts = csvContent.split(/\n\s*\n/).filter((s) => s.trim().length > 0);

  const dailySales: NormalizedDailySales[] = [];
  const invoices: NormalizedInvoice[] = [];
  const deletedProducts: NormalizedDeletedProduct[] = [];
  const allDates: string[] = [];
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

    if (section === 'sales') {
      parseSalesRows(parseResult.data, dailySales, allDates, allLocations);
    } else if (section === 'invoices') {
      parseInvoiceRows(parseResult.data, invoices, deletedProducts, allDates, allLocations);
    } else {
      // Try both -- ambiguous section; parse whichever matches
      parseSalesRows(parseResult.data, dailySales, allDates, allLocations);
      parseInvoiceRows(parseResult.data, invoices, deletedProducts, allDates, allLocations);
    }
  }

  // If splitting on blank lines produced nothing useful, try single-pass parse
  if (dailySales.length === 0 && invoices.length === 0) {
    const parseResult = Papa.parse<Record<string, string>>(csvContent.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parseResult.data && parseResult.data.length > 0) {
      const headers = parseResult.meta.fields ?? Object.keys(parseResult.data[0] || {});
      const section = detectSection(headers);

      if (section === 'sales' || section === 'unknown') {
        parseSalesRows(parseResult.data, dailySales, allDates, allLocations);
      }
      if (section === 'invoices' || section === 'unknown') {
        parseInvoiceRows(parseResult.data, invoices, deletedProducts, allDates, allLocations);
      }
    }
  }

  // Build metadata
  const sortedDates = allDates.filter(Boolean).sort();

  return {
    daily_sales: dailySales,
    invoices,
    deleted_products: deletedProducts,
    metadata: {
      date_from: sortedDates[0] || '',
      date_to: sortedDates[sortedDates.length - 1] || '',
      locations: Array.from(allLocations),
      pos_connector: 'lastapp',
    },
  };
}

// ---------------------------------------------------------------------------
// Sales rows
// ---------------------------------------------------------------------------

function parseSalesRows(
  rows: Record<string, string>[],
  dailySales: NormalizedDailySales[],
  allDates: string[],
  allLocations: Set<string>,
): void {
  for (const row of rows) {
    try {
      const dateRaw = getField(row, [
        'Fecha', 'fecha', 'Date', 'date',
      ]);
      const date = parseSpanishDate(dateRaw);
      if (!date) continue; // Skip rows without a valid date

      const location = getField(row, [
        'Local', 'Centro', 'local', 'centro', 'Location', 'location', 'Establecimiento',
      ]);

      const grossSales = parseNumber(
        getField(row, ['Ventas Brutas', 'ventas brutas', 'Gross Sales', 'gross_sales', 'Ventas brutas']),
      );
      const netSales = parseNumber(
        getField(row, ['Ventas Netas', 'ventas netas', 'Net Sales', 'net_sales', 'Ventas netas']),
      );
      const expectedCash = parseNumber(
        getField(row, [
          'Efectivo Esperado', 'efectivo esperado', 'Expected Cash', 'expected_cash',
          'Efectivo esperado', 'Cash Expected',
        ]),
      );
      const actualCash = parseNumber(
        getField(row, [
          'Efectivo Real', 'efectivo real', 'Actual Cash', 'actual_cash',
          'Efectivo real', 'Cash Actual',
        ]),
      );
      const cashDiscrepancy = parseNumber(
        getField(row, [
          'Descuadre', 'descuadre', 'Cash Discrepancy', 'cash_discrepancy',
          'Diferencia', 'Discrepancy',
        ]),
      );

      // Only add if we have at least some numeric data
      if (grossSales === 0 && netSales === 0 && expectedCash === 0 && actualCash === 0) {
        continue;
      }

      dailySales.push({
        date,
        location: location || 'Unknown',
        gross_sales: grossSales,
        net_sales: netSales,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        cash_discrepancy:
          cashDiscrepancy !== 0 ? cashDiscrepancy : actualCash - expectedCash,
      });

      allDates.push(date);
      if (location) allLocations.add(location);
    } catch {
      // Skip malformed row and continue
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Invoice / deleted-product rows
// ---------------------------------------------------------------------------

function parseInvoiceRows(
  rows: Record<string, string>[],
  invoices: NormalizedInvoice[],
  deletedProducts: NormalizedDeletedProduct[],
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

      const invoiceId = getField(row, [
        'N\u00BA Factura', 'Nº Factura', 'No Factura', 'Factura',
        'Invoice', 'Invoice Number', 'invoice_id', 'ID',
        'Numero Factura', 'Num Factura',
      ]);
      if (!invoiceId) continue; // Not an invoice row

      const location = getField(row, [
        'Local', 'Centro', 'local', 'centro', 'Location', 'location', 'Establecimiento',
      ]);
      const employee = getField(row, [
        'Empleado', 'empleado', 'Employee', 'employee', 'Camarero', 'Cajero',
      ]);
      const amount = parseNumber(
        getField(row, ['Importe', 'importe', 'Amount', 'amount', 'Total', 'total']),
      );
      const statusRaw = getField(row, [
        'Estado', 'estado', 'Status', 'status',
      ]);
      const status = mapInvoiceStatus(statusRaw);

      const deletionPhaseRaw = getField(row, [
        'Fase Eliminacion', 'Fase Eliminación', 'fase eliminacion',
        'Deletion Phase', 'deletion_phase', 'Fase',
      ]);

      const invoice: NormalizedInvoice = {
        id: invoiceId || nextId('inv'),
        date,
        location: location || 'Unknown',
        employee: employee || 'Unknown',
        amount,
        status,
        ...(status === 'deleted' && deletionPhaseRaw
          ? { deletion_phase: mapDeletionPhase(deletionPhaseRaw) }
          : {}),
      };

      invoices.push(invoice);
      allDates.push(date);
      if (location) allLocations.add(location);

      // If the row also contains product-level data and is deleted, create a
      // NormalizedDeletedProduct entry.
      if (status === 'deleted') {
        const productName = getField(row, [
          'Producto', 'producto', 'Product', 'product', 'Descripcion', 'Artículo',
          'Articulo', 'Nombre Producto',
        ]);
        const quantity = parseNumber(
          getField(row, ['Cantidad', 'cantidad', 'Quantity', 'quantity', 'Qty', 'Uds']),
        );
        const unitPrice = parseNumber(
          getField(row, [
            'Precio Unitario', 'precio unitario', 'Unit Price', 'unit_price',
            'Precio', 'PVP',
          ]),
        );

        if (productName) {
          const totalAmount = quantity && unitPrice ? quantity * unitPrice : amount;

          deletedProducts.push({
            id: nextId('del'),
            date,
            location: location || 'Unknown',
            employee: employee || 'Unknown',
            product_name: productName,
            quantity: quantity || 1,
            unit_price: unitPrice || amount,
            total_amount: totalAmount,
            phase: deletionPhaseRaw
              ? mapDeletionPhase(deletionPhaseRaw)
              : 'after_billing',
          });
        }
      }
    } catch {
      // Skip malformed row and continue
      continue;
    }
  }
}
