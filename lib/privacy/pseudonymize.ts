import type { ReportData } from '@/lib/types/report'
import type { AIInsights } from '@/lib/types/ai-insights'

/**
 * PII pseudonymization for LLM payloads.
 *
 * Context (GDPR Art. 4, recital 26): employee names are personal data. When
 * we serialize `ReportData` and send it to an external LLM (Claude), we must
 * not transmit PII in clear. We substitute employee names with deterministic
 * opaque pseudonyms before the request, and restore the real names in the
 * response so the user-facing narrative reads naturally.
 *
 * Scope decision (see DECISIONS.md ADR-009 and this PR's commit message):
 * - Pseudonymized: `deleted_invoices.by_employee[].employee` and any
 *   `correlation.scatter_data[].label` that matches a known employee name.
 * - NOT pseudonymized: organization name and location names. These are
 *   the client's own business data (not personal data of a third party),
 *   and removing them would make the narrative unusable.
 *
 * Pseudonym format: `__EMP_<n>__` (double underscore sentinels to avoid
 * collisions with natural text). Claude is instructed via the system prompt
 * to treat these as opaque tokens; we restore them post-response.
 */

export interface PseudonymizedPayload {
  /** Safe-to-send copy of ReportData with PII replaced by opaque tokens. */
  pseudonymized: ReportData
  /** Pseudonym token -> original employee name. Used to restore the response. */
  reverseMap: Map<string, string>
}

// TODO(human): implement pseudonymizeReportData
//
// Signature:
//   export function pseudonymizeReportData(reportData: ReportData): PseudonymizedPayload
//
// Requirements:
//   1. Preserve the `ReportData` structure. Do not mutate the input (return
//      a new object with the same shape).
//   2. Build a Map<string, string> from each distinct employee name encountered
//      in `reportData.deleted_invoices.by_employee` to a pseudonym of the form
//      `__EMP_1__`, `__EMP_2__`, ... (1-indexed, deterministic by insertion
//      order).
//   3. Replace the employee field in each by_employee entry with its pseudonym.
//   4. ALSO scan `reportData.correlation.scatter_data[].label`: if a label
//      exactly matches a name already in the map (from step 2), replace it
//      with the same pseudonym. Do NOT introduce new pseudonyms from labels
//      (labels sometimes reference locations, not people — we only substitute
//      when we're confident it's an employee).
//   5. Return both the pseudonymized data and the reverse map (pseudonym ->
//      original name) for use by `depseudonymizeInsights`.
//
// Edge cases to handle:
//   - Empty or undefined employee names: pass through unchanged (do not
//     create `__EMP_1__` for "").
//   - Duplicate names in by_employee (shouldn't happen, but be defensive):
//     reuse the same pseudonym.
//   - `correlation.scatter_data` or `by_employee` being empty arrays: no-op
//     on those branches.
//
// Example:
//   Input: deleted_invoices.by_employee = [
//     { employee: "Juan García", count: 5, amount: 120, location: "Local A" },
//     { employee: "María López", count: 3, amount: 80, location: "Local B" },
//   ]
//   Output pseudonymized: [
//     { employee: "__EMP_1__", count: 5, amount: 120, location: "Local A" },
//     { employee: "__EMP_2__", count: 3, amount: 80, location: "Local B" },
//   ]
//   Output reverseMap: Map { "__EMP_1__" => "Juan García", "__EMP_2__" => "María López" }
export function pseudonymizeReportData(reportData: ReportData): PseudonymizedPayload {
  // Normalize-key -> pseudonym. We use trimmed input as the key so that
  // "Juan García" and "Juan García " (trailing whitespace from a TPV export)
  // resolve to the same pseudonym, but we preserve the *first-seen* form as
  // the restoration target in the reverseMap.
  const nameToPseudonym = new Map<string, string>()
  const reverseMap = new Map<string, string>()
  let counter = 0

  const getPseudonym = (rawName: string | undefined | null): string | undefined => {
    // Defensive: pass through empty/undefined unchanged. We never want to
    // create `__EMP_1__` for "" because depseudonymize would then replace
    // the empty string globally — catastrophic.
    if (rawName === undefined || rawName === null) return rawName ?? undefined
    const trimmed = rawName.trim()
    if (trimmed === '') return rawName

    const existing = nameToPseudonym.get(trimmed)
    if (existing) return existing

    counter += 1
    const pseudonym = `__EMP_${counter}__`
    nameToPseudonym.set(trimmed, pseudonym)
    // Preserve the first-seen form (may have internal whitespace we want to
    // keep). We restore to the original, not the trimmed version.
    reverseMap.set(pseudonym, rawName)
    return pseudonym
  }

  // 1. Pseudonymize deleted_invoices.by_employee. Iterate in array order so
  //    __EMP_1__ is deterministically the first employee row in the input —
  //    critical for test snapshots and reproducibility across runs.
  const pseudonymizedByEmployee = reportData.deleted_invoices.by_employee.map(
    (entry) => {
      const pseudonym = getPseudonym(entry.employee)
      return {
        ...entry,
        employee: pseudonym ?? entry.employee,
      }
    }
  )

  // 2. Scan correlation.scatter_data labels. We only substitute labels that
  //    EXACTLY match an already-known employee name (case-sensitive). We do
  //    NOT introduce new pseudonyms from labels because labels may reference
  //    locations — pseudonymizing "Local A" would break the narrative without
  //    any privacy benefit (locations aren't PII).
  const pseudonymizedScatterData = reportData.correlation.scatter_data.map(
    (point) => {
      const trimmedLabel = point.label?.trim?.() ?? point.label
      const pseudonym = nameToPseudonym.get(trimmedLabel)
      return pseudonym ? { ...point, label: pseudonym } : point
    }
  )

  const pseudonymized: ReportData = {
    ...reportData,
    deleted_invoices: {
      ...reportData.deleted_invoices,
      by_employee: pseudonymizedByEmployee,
    },
    correlation: {
      ...reportData.correlation,
      scatter_data: pseudonymizedScatterData,
    },
  }

  return { pseudonymized, reverseMap }
}

/**
 * Restores real employee names in the AI response by substituting pseudonyms
 * back with their originals using the reverseMap from `pseudonymizeReportData`.
 *
 * We walk every user-visible string field (narrative, titles, descriptions,
 * affected_area) and do a global string replace per pseudonym.
 *
 * If Claude hallucinates a pseudonym that isn't in the map (e.g. `__EMP_99__`
 * when we only generated `__EMP_1__` and `__EMP_2__`), that token will remain
 * in the final output — detectable with a post-process regex if we want to
 * alert on it (see POST_PROCESS_PSEUDONYM_REGEX below).
 */
export function depseudonymizeInsights(
  insights: AIInsights,
  reverseMap: Map<string, string>
): AIInsights {
  const restore = (text: string): string => {
    let result = text
    for (const [pseudonym, realName] of reverseMap) {
      // split/join is faster than replaceAll for small maps and avoids
      // needing to escape regex metacharacters in the pseudonym.
      result = result.split(pseudonym).join(realName)
    }
    return result
  }

  return {
    narrative: restore(insights.narrative),
    recommendations: insights.recommendations.map((r) => ({
      ...r,
      title: restore(r.title),
      description: restore(r.description),
    })),
    anomalies: insights.anomalies.map((a) => ({
      ...a,
      title: restore(a.title),
      description: restore(a.description),
      affected_area: restore(a.affected_area),
    })),
    generated_at: insights.generated_at,
  }
}

/**
 * Detects pseudonyms left un-restored in the final output (Claude hallucinated
 * a token outside our map, or a substitution missed a field). Use this for
 * telemetry — not for validation. A positive match indicates a bug.
 */
export const POST_PROCESS_PSEUDONYM_REGEX = /__EMP_\d+__/g
