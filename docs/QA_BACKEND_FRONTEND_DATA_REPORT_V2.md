# QA Report v2 — 2026-03-28

## Verification of Previous Fixes (5 items)

All 5 previous fixes have been **VERIFIED as correctly implemented**.

### C-01: Server-side 1-demo-per-user limit (VERIFIED)
- **File**: `app/api/analyze/route.ts`, lines 54-67
- **Status**: RESOLVED ✓
- **Evidence**: 
  - Lines 56-60: Counts existing demo reports with `count: 'exact'` query
  - Line 62: Checks `(count ?? 0) > 0` to enforce max 1 demo per user
  - Lines 85-92: `is_demo` flag persisted to reports table
  - Lines 128: `serverTrackCreditSpent` called without guard for non-demo analysis

### C-02: Credit warning and canAnalyze logic (VERIFIED)
- **File**: `app/dashboard/upload/page.tsx`, lines 85-101, 184-191
- **Status**: RESOLVED ✓
- **Evidence**:
  - Lines 95: `setUserCredits(null)` in catch block (NOT 100) ✓
  - Lines 74: `isLoadingBalance` state guards loading
  - Line 97: `setIsLoadingBalance(false)` when complete
  - Lines 446-452: Warning alert guarded by `!isLoadingBalance && userCredits === null` ✓
  - Lines 190-191: `canAnalyze` includes `userCredits > 0` ✓

### C-03: intervalId assignment order (VERIFIED)
- **File**: `app/dashboard/processing/[reportId]/page.tsx`, lines 121-179
- **Status**: RESOLVED ✓
- **Evidence**:
  - Line 123: `intervalId` declared at top of useEffect
  - Lines 169-171: `timeoutId = setTimeout(() => { intervalId = setInterval(...) })`
  - Line 170: `pollStatus()` called immediately after interval creation
  - intervalId is available before setTimeout fires

### C-04: useEffect early return for unavailable status (VERIFIED)
- **File**: `components/report/AIInsightsTab.tsx`, lines 167-208
- **Status**: RESOLVED ✓
- **Evidence**:
  - Line 168: Early return condition includes `status === 'unavailable'`
  - Logic: `if (initialData || !reportId || status === 'ready' || status === 'unavailable') return`
  - Prevents polling loop when insights marked unavailable

### H-04: TIMEOUT_MS = 10 * 60_000 (VERIFIED)
- **File**: `app/api/reports/[reportId]/ai-insights/route.ts`, line 62
- **Status**: RESOLVED ✓
- **Evidence**:
  - Line 62: `const TIMEOUT_MS = 10 * 60_000 // 10 minutes grace period`
  - Was 60_000 (1 min), now correctly 10 * 60_000 (10 min)

---

## New Findings

### CRITICAL

#### NC-01: Missing user_id filter in alert deletion (CRITICAL)
- **File**: `app/api/alerts/[alertId]/route.ts`, lines 142-152
- **Severity**: CRITICAL
- **Description**: The DELETE endpoint removes alert history without filtering by user_id. An authenticated attacker could craft a request to delete alert_history records for OTHER users' alerts if they know the alertId.
- **Issue**: Line 145 uses only `.eq('alert_rule_id', alertId)` without verifying ownership
- **Impact**: Data deletion of other users' alert history; audit trail loss
- **Proposed Fix**: 
  ```typescript
  // Fetch the alert to verify ownership first
  const { data: rule } = await supabase
    .from('alert_rules')
    .select('id, user_id')
    .eq('id', alertId)
    .single()
  
  if (!rule || rule.user_id !== user.id) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }
  
  // Now safe to delete history
  ```

#### NC-02: Race condition in report external_views counter (CRITICAL)
- **File**: `app/informe/[slug]/page.tsx`, lines 93-100
- **Severity**: CRITICAL
- **Description**: The external_views counter is updated with `external_views + 1` read-then-update pattern. Two concurrent views will both read the same value and write back the same incremented value, losing one view count.
- **Issue**: Lines 94-97 use non-atomic read-modify-write: `(report.external_views ?? 0) + 1`
- **Impact**: Incorrect external view counts; analytics inaccuracy
- **Proposed Fix**: Use atomic PostgreSQL function:
  ```sql
  CREATE FUNCTION increment_external_views(p_report_id UUID) RETURNS INTEGER AS $$
  BEGIN
    UPDATE reports SET external_views = external_views + 1 
    WHERE id = p_report_id
    RETURNING external_views INTO v_new_views;
    RETURN v_new_views;
  END;
  $$ LANGUAGE plpgsql;
  ```

#### NC-03: Missing .eq() filter allows SQL wildcard injection in report comparison (CRITICAL)
- **File**: `app/api/compare/route.ts`, lines 50-54
- **Severity**: CRITICAL
- **Description**: Uses `.in('slug', [slugA, slugB])` without validating slug format. An attacker could craft a slug parameter like `%` to match multiple reports.
- **Issue**: No slug format validation; wildcards not escaped
- **Impact**: User could see other users' reports; data leakage
- **Proposed Fix**:
  ```typescript
  // Validate slug format
  const slugPattern = /^[a-zA-Z0-9_-]{12}$/
  if (!slugPattern.test(slugA) || !slugPattern.test(slugB)) {
    return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 })
  }
  ```

### HIGH

#### NH-01: No transaction rollback on Stripe webhook partial failure (HIGH)
- **File**: `app/api/webhooks/stripe/route.ts`, lines 65-121
- **Severity**: HIGH
- **Description**: If awardCreditsRaw succeeds but email fails, credits are awarded but user gets no confirmation email. If webhook retried, duplicate credits awarded (idempotency returns -1 but already credited).
- **Issue**: Email failure at line 119 doesn't rollback credits awarded
- **Impact**: Credit inconsistency; lost email confirmations
- **Proposed Fix**: Wrap email send in transaction with rollback, or mark credits as "pending_email_confirmation" pending async email delivery.

#### NH-02: Unguarded type casting in report comparison (HIGH)
- **File**: `app/api/compare/route.ts`, lines 87-92
- **Severity**: HIGH
- **Description**: `as ReportData` casts without validation. Malformed report_data JSONB could crash or cause undefined behavior.
- **Issue**: No schema validation before casting
- **Impact**: Service crash or undefined behavior on corrupted data
- **Proposed Fix**:
  ```typescript
  // Add runtime validation
  const reportAData = reportA.report_data as unknown
  if (!isValidReportData(reportAData)) {
    return NextResponse.json({ error: 'Invalid report data' }, { status: 400 })
  }
  ```

#### NH-03: Missing error boundary on report processing page (HIGH)
- **File**: `app/dashboard/processing/[reportId]/page.tsx`
- **Severity**: HIGH
- **Description**: Client component has no error boundary. Network errors in fetch calls cause unhandled promise rejection.
- **Issue**: Lines 130, 170, 174 have fetch calls without try-catch in all cases
- **Impact**: White screen on network failure; poor UX
- **Proposed Fix**: Wrap entire useEffect in try-catch, set error state on network failures

#### NH-04: Missing input validation for float threshold in alerts POST (HIGH)
- **File**: `app/api/alerts/route.ts`, lines 102-107
- **Severity**: HIGH
- **Description**: Validates `isNaN(threshold)` but allows Infinity, -Infinity, which could cause undefined comparison behavior in evaluateAlerts.
- **Issue**: No validation for `!isFinite(threshold)`
- **Impact**: Alert evaluation logic may crash or behave unexpectedly
- **Proposed Fix**:
  ```typescript
  if (typeof threshold !== 'number' || !isFinite(threshold)) {
    return NextResponse.json(
      { error: 'threshold must be a valid finite number' },
      { status: 400 }
    )
  }
  ```

#### NH-05: Missing null guard on organization_id in compare response (HIGH)
- **File**: `app/api/compare/route.ts`, lines 87-92
- **Severity**: HIGH
- **Description**: When comparing reports, if organization is null, compareReports may fail or return undefined organizational context
- **Issue**: No check that both reports belong to same organization before comparison
- **Impact**: Cross-organization data leakage; inconsistent comparison results
- **Proposed Fix**:
  ```typescript
  if (reportA.organization_id !== reportB.organization_id) {
    return NextResponse.json(
      { error: 'Reports must be from the same organization' },
      { status: 400 }
    )
  }
  ```

### MEDIUM

#### NM-01: Missing error handling on file deletion after upload failure (MEDIUM)
- **File**: `app/api/upload/route.ts`, lines 68-81
- **Severity**: MEDIUM
- **Description**: If database insert fails at line 124-130, the file is already uploaded to storage but upload record doesn't exist. No cleanup attempt.
- **Issue**: Orphaned files in storage
- **Impact**: Storage bloat; costs
- **Proposed Fix**:
  ```typescript
  if (dbError) {
    // Clean up uploaded file
    await supabase.storage.from('uploads').remove([storagePath])
    console.error('Database insert error, file cleaned up:', dbError.message)
    return NextResponse.json(...)
  }
  ```

#### NM-02: Stripe price lookup uses unvalidated env var (MEDIUM)
- **File**: `app/api/checkout/route.ts`, lines 39-48
- **Severity**: MEDIUM
- **Description**: `process.env[envVarName]` could return undefined if env var is not set. Returns 500 error but should validate at startup.
- **Issue**: No early validation of required env vars
- **Impact**: Silent config failures; poor debugging
- **Proposed Fix**: Add validation in server startup or separate health check endpoint

#### NM-03: AIInsightsTab polling exceeds timeout silently (MEDIUM)
- **File**: `components/report/AIInsightsTab.tsx`, lines 200-205
- **Severity**: MEDIUM
- **Description**: After 30 seconds (10 polls × 3s), polling stops and marks as unavailable. No logging of timeout event.
- **Issue**: Silent timeout; difficult to debug slow AI generations
- **Impact**: Analytics gap; hard to track slow systems
- **Proposed Fix**: Log timeout event to PostHog:
  ```typescript
  if (pollCount.current >= maxPolls) {
    serverTrackAIInsightsTimeout(reportId, { polls: pollCount.current })
    setStatus('unavailable')
  }
  ```

#### NM-04: Feedback form allows 0 accuracy_rating (MEDIUM)
- **File**: `app/api/feedback/route.ts`, lines 36-41
- **Severity**: MEDIUM
- **Description**: Check is `=== undefined || === null` but not ` === 0`. User can submit rating of 0 which is meaningless.
- **Issue**: Missing validation for falsy value
- **Impact**: Invalid feedback data
- **Proposed Fix**:
  ```typescript
  if (accuracy_rating === undefined || accuracy_rating === null || 
      accuracy_rating < 1 || accuracy_rating > 5) {
    return NextResponse.json(
      { error: 'accuracy_rating must be between 1 and 5' },
      { status: 400 }
    )
  }
  ```

#### NM-05: Volume detection error swallows exceptions (MEDIUM)
- **File**: `app/api/upload/route.ts`, lines 85-97
- **Severity**: MEDIUM
- **Description**: If volume detection throws, returns default `creditsRequired: 1`. User may need 10 credits but proceeds with 1, leading to insufficient credits error later.
- **Issue**: Silent fallback hides parsing errors; misleads UI
- **Impact**: User uploads file thinking cost is 1, then fails at analysis with "insufficient credits"
- **Proposed Fix**:
  ```typescript
  try {
    volumeInfo = detectVolume(fileContent, connectorType)
  } catch (err) {
    console.error('Volume detection failed:', err)
    return NextResponse.json(
      { error: 'Could not analyze file structure. Please verify CSV format.' },
      { status: 400 }
    )
  }
  ```

#### NM-06: RLS policies too permissive for authenticated role (MEDIUM)
- **File**: `supabase/migrations/20240109000000_enable_rls_policies.sql`, lines 44-87
- **Severity**: MEDIUM
- **Description**: Authenticated role policies use `USING (true)` to allow ALL authenticated users to read from all tables. This contradicts the comment that "Clerk auth bypasses RLS". If Supabase Auth is ever added, all users will see all other users' data.
- **Issue**: Overpermissive authenticated policies; future-proofing risk
- **Impact**: If Supabase Auth enabled, massive data leakage
- **Proposed Fix**:
  ```sql
  CREATE POLICY "Authenticated read own organizations"
    ON organizations FOR SELECT
    TO authenticated
    USING (id = auth.uid()); -- Owner check, not blanket true
  ```

### LOW

#### NL-01: No validation of reportId UUID format (LOW)
- **File**: `app/api/reports/[reportId]/status/route.ts`, lines 18-23
- **Severity**: LOW
- **Description**: Accepts any reportId string. Invalid UUIDs fail gracefully at DB layer but could be logged as attacks.
- **Issue**: No format validation
- **Impact**: Noise in logs; minor
- **Proposed Fix**:
  ```typescript
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(reportId)) {
    return NextResponse.json({ error: 'Invalid reportId format' }, { status: 400 })
  }
  ```

#### NL-02: Missing X-Frame-Options header (LOW)
- **File**: All responses
- **Severity**: LOW
- **Description**: PDF generation endpoint should set X-Frame-Options: DENY to prevent clickjacking.
- **Issue**: No security headers on download endpoints
- **Impact**: Theoretical clickjacking risk on public report pages
- **Proposed Fix**:
  ```typescript
  headers: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
  }
  ```

#### NL-03: Untracked processing time in Inngest (LOW)
- **File**: `lib/inngest/functions.ts`, line 101
- **Severity**: LOW
- **Description**: Comment says `// processing_time_seconds: 0` hardcoded because "Inngest doesn't easily expose total duration". Should use `step.run()` timing APIs.
- **Issue**: Analytics gap; can't track slow reports
- **Impact**: Missing observability metric
- **Proposed Fix**: Use Inngest's built-in step timing or manually track timestamps

#### NL-04: Missing loading skeleton for inventory volume preview (LOW)
- **File**: `app/dashboard/upload/page.tsx`, lines 427-432
- **Severity**: LOW
- **Description**: Inventory volume preview shows data immediately after file select, but if detection is slow, loading state is not shown (unlike POS which has Skeleton at lines 353-355).
- **Issue**: Inconsistent UX
- **Impact**: Minor UX inconsistency
- **Proposed Fix**: Add similar Skeleton loading state for inventory

#### NL-05: No client-side file size validation (LOW)
- **File**: `app/dashboard/upload/page.tsx`
- **Severity**: LOW
- **Description**: FileDropZone component has no max file size check. Large files waste bandwidth before being rejected server-side.
- **Issue**: No client-side size guard
- **Impact**: Poor UX on large files; bandwidth waste
- **Proposed Fix**:
  ```typescript
  if (file.size > 50 * 1024 * 1024) { // 50MB limit
    setError('File must be smaller than 50MB')
    return
  }
  ```

---

## Summary Table

| ID | Severity | Category | File | Issue | Status |
|---|----------|----------|------|-------|--------|
| NC-01 | CRITICAL | Backend/Auth | alerts/[alertId]/route.ts | Missing user_id filter in alert deletion | NEW |
| NC-02 | CRITICAL | Backend/DB | informe/[slug]/page.tsx | Race condition in external_views counter | NEW |
| NC-03 | CRITICAL | Backend/Security | api/compare/route.ts | Missing slug validation; wildcard injection risk | NEW |
| NH-01 | HIGH | Backend/Stripe | webhooks/stripe/route.ts | No transaction rollback on email failure | NEW |
| NH-02 | HIGH | Backend/Validation | api/compare/route.ts | Unguarded type casting of report_data | NEW |
| NH-03 | HIGH | Frontend/UX | dashboard/processing/[reportId]/page.tsx | Missing error boundary on network failures | NEW |
| NH-04 | HIGH | Backend/Validation | api/alerts/route.ts | Missing Infinity check on threshold | NEW |
| NH-05 | HIGH | Backend/Security | api/compare/route.ts | Missing cross-org validation | NEW |
| NM-01 | MEDIUM | Backend/Storage | api/upload/route.ts | Orphaned files on DB insert failure | NEW |
| NM-02 | MEDIUM | Backend/Config | api/checkout/route.ts | Unvalidated env var access | NEW |
| NM-03 | MEDIUM | Frontend/Analytics | components/AIInsightsTab.tsx | Silent polling timeout; missing logs | NEW |
| NM-04 | MEDIUM | Backend/Validation | api/feedback/route.ts | Allows zero accuracy_rating | NEW |
| NM-05 | MEDIUM | Backend/Error | api/upload/route.ts | Silent fallback hides parsing errors | NEW |
| NM-06 | MEDIUM | Backend/RLS | supabase/migrations/20240109 | Overpermissive authenticated RLS policies | NEW |
| NL-01 | LOW | Backend/Validation | api/reports/[reportId]/status/route.ts | No UUID format validation | NEW |
| NL-02 | LOW | Backend/Security | api/reports/[reportId]/pdf/route.ts | Missing X-Frame-Options header | NEW |
| NL-03 | LOW | Backend/Observability | lib/inngest/functions.ts | Untracked processing time | NEW |
| NL-04 | LOW | Frontend/UX | dashboard/upload/page.tsx | Missing inventory loading skeleton | NEW |
| NL-05 | LOW | Frontend/Validation | dashboard/upload/page.tsx | No client-side file size check | NEW |

---

## Summary Statistics

- **Total Issues Found**: 19 (5 previous fixes verified, 14 new findings)
- **Critical**: 3
- **High**: 5
- **Medium**: 6
- **Low**: 5

**Action Priority**: Address CRITICAL and HIGH issues before next deployment.
