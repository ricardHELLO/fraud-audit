import Papa from 'papaparse'

export interface VolumeInfo {
  dateFrom: string
  dateTo: string
  locations: string[]
  totalRows: number
  monthsCovered: number
  creditsRequired: number
}

const DATE_COLUMN_NAMES = ['fecha', 'date', 'Fecha', 'Date', 'FECHA']
const LOCATION_COLUMN_NAMES = [
  'local',
  'location',
  'restaurante',
  'Local',
  'Location',
  'Centro',
  'centro',
]

/**
 * Find the first column name in the row that matches one of the candidate names.
 */
function findColumn(
  headers: string[],
  candidates: string[]
): string | undefined {
  return headers.find((h) => candidates.includes(h.trim()))
}

/**
 * Parse a date string in common formats (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
 * and return a Date object. Returns null if parsing fails.
 */
function parseDate(raw: string): Date | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? null : d
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10)
    const year = parseInt(dmyMatch[3], 10)

    // Heuristic: if first number > 12, it's definitely day-first
    if (day > 12 || month <= 12) {
      const d = new Date(year, month - 1, day)
      return isNaN(d.getTime()) ? null : d
    }
  }

  // Fallback: let Date constructor try
  const fallback = new Date(trimmed)
  return isNaN(fallback.getTime()) ? null : fallback
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate the number of months between two dates (inclusive of both endpoints).
 */
function monthsBetween(from: Date, to: Date): number {
  const yearDiff = to.getFullYear() - from.getFullYear()
  const monthDiff = to.getMonth() - from.getMonth()
  return yearDiff * 12 + monthDiff + 1
}

/**
 * Analyze the uploaded CSV file content and detect the volume of data
 * (date range, locations, row count) to determine credits required.
 */
export function detectVolume(
  fileContent: string,
  _connectorType: string
): VolumeInfo {
  const parsed = Papa.parse<Record<string, string>>(fileContent, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(
      `CSV parsing failed: ${parsed.errors.map((e) => e.message).join(', ')}`
    )
  }

  const rows = parsed.data
  const totalRows = rows.length

  if (totalRows === 0) {
    return {
      dateFrom: '',
      dateTo: '',
      locations: [],
      totalRows: 0,
      monthsCovered: 0,
      creditsRequired: 1,
    }
  }

  const headers = parsed.meta.fields ?? []

  // --- Detect date range ---
  const dateCol = findColumn(headers, DATE_COLUMN_NAMES)
  let minDate: Date | null = null
  let maxDate: Date | null = null

  if (dateCol) {
    for (const row of rows) {
      const d = parseDate(row[dateCol])
      if (d) {
        if (!minDate || d < minDate) minDate = d
        if (!maxDate || d > maxDate) maxDate = d
      }
    }
  }

  const dateFrom = minDate ? formatDate(minDate) : ''
  const dateTo = maxDate ? formatDate(maxDate) : ''

  // --- Detect locations ---
  const locationCol = findColumn(headers, LOCATION_COLUMN_NAMES)
  const locationsSet = new Set<string>()

  if (locationCol) {
    for (const row of rows) {
      const loc = row[locationCol]?.trim()
      if (loc) {
        locationsSet.add(loc)
      }
    }
  }

  const locations = Array.from(locationsSet).sort()

  // --- Calculate months covered ---
  const monthsCovered =
    minDate && maxDate ? monthsBetween(minDate, maxDate) : 1

  // --- Calculate credits required ---
  // Formula: ceil(months / 3) * ceil(locations / 5)
  const monthBlocks = Math.ceil(monthsCovered / 3)
  const locationBlocks = Math.ceil(Math.max(locations.length, 1) / 5)
  const creditsRequired = monthBlocks * locationBlocks

  return {
    dateFrom,
    dateTo,
    locations,
    totalRows,
    monthsCovered,
    creditsRequired,
  }
}
