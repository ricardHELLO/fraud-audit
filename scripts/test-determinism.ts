/**
 * Determinism Test — runs runAnalysis() N times on the same CSV
 * and reports any differences in the resulting report_data JSON.
 *
 * Usage: npx tsx scripts/test-determinism.ts [csv-path] [runs]
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseLastApp } from '@/lib/parsers/lastapp'
import { runAnalysis } from '@/lib/analysis-engine'
import type { NormalizedDataset } from '@/lib/types/normalized'

const csvPath =
  process.argv[2] ||
  path.join(__dirname, '..', 'test-data', 'dataset-1-paella-dorada.csv')
const RUNS = parseInt(process.argv[3] || '5', 10)

console.log(`\n🔬 Determinism Test`)
console.log(`   CSV: ${path.basename(csvPath)}`)
console.log(`   Runs: ${RUNS}\n`)

// Read CSV once
const csvContent = fs.readFileSync(csvPath, 'utf-8')

// Run N times and collect results
const results: string[] = []

for (let i = 0; i < RUNS; i++) {
  const parsed = parseLastApp(csvContent)

  // Build a minimal NormalizedDataset
  const dataset: NormalizedDataset = {
    daily_sales: parsed.daily_sales ?? [],
    invoices: parsed.invoices ?? [],
    deleted_products: parsed.deleted_products ?? [],
    waste: parsed.waste ?? [],
    inventory_deviations: parsed.inventory_deviations ?? [],
    metadata: {
      pos_connector: 'lastapp',
      inventory_connector: undefined,
      locations: parsed.metadata?.locations ?? [],
      date_from: parsed.metadata?.date_from ?? '',
      date_to: parsed.metadata?.date_to ?? '',
    },
  }

  const reportData = runAnalysis(dataset)
  results.push(JSON.stringify(reportData))
  process.stdout.write(`   Run ${i + 1}/${RUNS} ✓\n`)
}

// Compare all results against the first
const baseline = results[0]
let allIdentical = true
const diffs: { run: number; path: string; baseline: unknown; actual: unknown }[] = []

for (let i = 1; i < results.length; i++) {
  if (results[i] !== baseline) {
    allIdentical = false
    // Deep diff to find exactly what changed
    const a = JSON.parse(baseline)
    const b = JSON.parse(results[i])
    findDiffs(a, b, '', i + 1, diffs)
  }
}

function findDiffs(
  a: unknown,
  b: unknown,
  prefix: string,
  run: number,
  out: typeof diffs
) {
  if (a === b) return
  if (typeof a !== typeof b) {
    out.push({ run, path: prefix, baseline: a, actual: b })
    return
  }
  if (a === null || b === null) {
    out.push({ run, path: prefix, baseline: a, actual: b })
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      findDiffs(a[i], b[i], `${prefix}[${i}]`, run, out)
    }
    return
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const allKeys = new Set([...Object.keys(a as Record<string, unknown>), ...Object.keys(b as Record<string, unknown>)])
    for (const key of allKeys) {
      findDiffs(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key,
        run,
        out
      )
    }
    return
  }
  // Primitive mismatch
  out.push({ run, path: prefix, baseline: a, actual: b })
}

// Report
console.log('\n' + '═'.repeat(60))
if (allIdentical) {
  console.log(`✅ ALL ${RUNS} RUNS PRODUCED IDENTICAL RESULTS`)
} else {
  console.log(`❌ NON-DETERMINISTIC OUTPUT DETECTED`)
  console.log(`   ${diffs.length} difference(s) found:\n`)
  for (const d of diffs.slice(0, 30)) {
    console.log(`   Run ${d.run} | ${d.path}`)
    console.log(`     baseline: ${JSON.stringify(d.baseline)}`)
    console.log(`     actual:   ${JSON.stringify(d.actual)}`)
    console.log()
  }
  if (diffs.length > 30) {
    console.log(`   ... and ${diffs.length - 30} more differences`)
  }
}
console.log('═'.repeat(60) + '\n')

process.exit(allIdentical ? 0 : 1)
