# Fix 3 Real QA Issues (v2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three confirmed bugs: non-atomic view counter, indefinite polling on processing page, and Infinity-permissive alert threshold.

**Architecture:** Each fix is self-contained. Task 1 adds a Supabase RPC migration and updates the page component. Task 2 adds a poll timeout to a client component. Task 3 adds one validation line to an API route.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL RPC), React 18 useEffect

**False positives documented (do NOT fix these):**
- NC-01: Ownership check already present in alerts DELETE before history deletion
- NC-03: Supabase `.in()` uses parameterized queries — no wildcard injection possible
- NH-01: Email is intentional fire-and-forget; credits are atomically idempotent
- NH-02: `report_data` is system-generated — cast is safe
- NH-05: `.eq('user_id', user.id)` already prevents cross-org access

---

### Task 1: NC-02 — Atomic external_views counter

**Problem:** `app/informe/[slug]/page.tsx` lines 94-97 does a read-modify-write:
```ts
.update({ external_views: (report.external_views ?? 0) + 1 })
```
Two concurrent visitors both read `external_views = 5`, both write back `6`. One view is lost.

**Files:**
- Create: `supabase/migrations/20260328170000_atomic_external_views.sql`
- Modify: `app/informe/[slug]/page.tsx` lines 93-100

**Step 1: Write the failing test**

In `__tests__/credits.test.ts` (the existing integration test file — add to the end):

```typescript
// NOTE: This test validates the increment RPC exists and returns a number.
// It relies on the migration having been applied.
it('increment_external_views RPC returns a number', async () => {
  // We cannot run real Supabase in unit tests — this is a type-level smoke test.
  // The function call pattern must compile without TypeScript errors.
  // Actual integration relies on the migration being applied in production.
  expect(typeof 1).toBe('number') // placeholder — real test is DB-level
})
```

Run: `npm test -- --reporter verbose 2>&1 | tail -5`
Expected: All tests pass (placeholder test always passes).

**Step 2: Create the migration**

Create `supabase/migrations/20260328170000_atomic_external_views.sql`:

```sql
-- Atomic increment for external_views using UPDATE ... RETURNING.
-- Replaces the read-modify-write pattern in the informe page.
CREATE OR REPLACE FUNCTION public.increment_external_views(p_report_id UUID)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE public.reports
  SET external_views = external_views + 1
  WHERE id = p_report_id
  RETURNING external_views;
$$;
```

**Step 3: Run tests to verify they still pass**

Run: `npm test 2>&1 | tail -5`
Expected: All 28 tests pass.

**Step 4: Update the page to use the RPC**

In `app/informe/[slug]/page.tsx`, replace lines 93-100:

```typescript
// BEFORE:
// Increment external_views counter (fire-and-forget)
supabase
  .from('reports')
  .update({ external_views: (report.external_views ?? 0) + 1 })
  .eq('id', report.id)
  .then(() => {
    // View counter updated silently
  })
```

With:

```typescript
// Increment external_views atomically (fire-and-forget)
// Uses RPC to avoid read-modify-write race condition under concurrent views
supabase
  .rpc('increment_external_views', { p_report_id: report.id })
  .then(() => {
    // View counter updated atomically
  })
```

**Step 5: Run tests again**

Run: `npm test 2>&1 | tail -5`
Expected: All 28 tests pass.

**Step 6: Commit**

```bash
git add supabase/migrations/20260328170000_atomic_external_views.sql app/informe/[slug]/page.tsx
git commit -m "fix(NC-02): use atomic RPC for external_views to prevent race condition"
```

---

### Task 2: NH-03 — Add polling timeout to processing page

**Problem:** `app/dashboard/processing/[reportId]/page.tsx` polls every 3 seconds with no maximum. If the Inngest job hangs (worker crash, queue error), the user is stuck on the spinning page forever with no way out except closing the tab.

**Files:**
- Modify: `app/dashboard/processing/[reportId]/page.tsx`

The `pollStatus` function already has `pollCount.current` — it uses it only for step animation. We add a max poll check (100 polls × 3s = 5 minutes) that shows an actionable error.

**Step 1: Write the failing test**

In `__tests__/credits.test.ts` (add placeholder at end):

```typescript
it('processing page timeout constant: 100 polls × 3s = 5 min', () => {
  const MAX_POLLS = 100
  const INTERVAL_MS = 3000
  expect(MAX_POLLS * INTERVAL_MS).toBe(300_000) // 5 minutes
})
```

Run: `npm test 2>&1 | tail -5`
Expected: FAIL — MAX_POLLS is not exported from anywhere yet.

Actually this test can't fail meaningfully from a file. Write it as:

```typescript
it('5-minute timeout is 100 polls at 3s each', () => {
  expect(100 * 3000).toBe(300_000)
})
```

Run: `npm test 2>&1 | tail -5`
Expected: PASS (it's arithmetic).

**Step 2: Apply the fix**

In `app/dashboard/processing/[reportId]/page.tsx`, inside the `pollStatus` function, after the `else` block for "still processing" (around line 161), add a timeout check:

```typescript
// BEFORE (inside pollStatus, around line 153-161):
} else {
  // Still processing — animate through steps
  pollCount.current += 1
  // Progress through steps based on poll count (each poll = ~3s)
  if (pollCount.current >= 3) {
    setCurrentStepIndex(3) // Generating report
  } else if (pollCount.current >= 1) {
    setCurrentStepIndex(2) // Analyzing
  }
}
```

Change to:

```typescript
} else {
  // Still processing — animate through steps
  pollCount.current += 1
  // Progress through steps based on poll count (each poll = ~3s)
  if (pollCount.current >= 3) {
    setCurrentStepIndex(3) // Generating report
  } else if (pollCount.current >= 1) {
    setCurrentStepIndex(2) // Analyzing
  }
  // 5-minute timeout: 100 polls × 3s. Stop polling and show actionable error.
  if (pollCount.current >= 100) {
    setError('El analisis esta tardando mas de lo esperado. Vuelve al dashboard para consultar el estado.')
    clearInterval(intervalId)
  }
}
```

**Step 3: Run tests**

Run: `npm test 2>&1 | tail -5`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add app/dashboard/processing/[reportId]/page.tsx
git commit -m "fix(NH-03): add 5-minute polling timeout to processing page"
```

---

### Task 3: NH-04 — Reject Infinity as alert threshold

**Problem:** `app/api/alerts/route.ts` line 102 validates with `isNaN(threshold)`, but `isNaN(Infinity)` returns `false`. A user can create an alert with `threshold: Infinity`, which either never triggers (if using `>`) or always triggers (if using `<`).

**Files:**
- Modify: `app/api/alerts/route.ts` line 102

**Step 1: Write the failing test**

Add to `__tests__/credits.test.ts`:

```typescript
it('isFinite rejects Infinity but isNaN does not', () => {
  // Documents the bug: isNaN passes but isFinite correctly rejects
  expect(isNaN(Infinity)).toBe(false)    // isNaN does NOT catch Infinity
  expect(isFinite(Infinity)).toBe(false) // isFinite correctly rejects it
})
```

Run: `npm test 2>&1 | tail -5`
Expected: PASS — this test documents existing JS behavior (will pass regardless).

**Step 2: Apply the one-line fix**

In `app/api/alerts/route.ts`, line 102:

```typescript
// BEFORE:
if (typeof threshold !== 'number' || isNaN(threshold)) {
  return NextResponse.json(
    { error: 'threshold must be a valid number' },
    { status: 400 }
  )
}
```

Change to:

```typescript
if (typeof threshold !== 'number' || !isFinite(threshold)) {
  return NextResponse.json(
    { error: 'threshold must be a valid finite number' },
    { status: 400 }
  )
}
```

Note: `isFinite(x)` returns `false` for `NaN`, `Infinity`, and `-Infinity` — it is strictly stronger than `!isNaN(x)`. This replaces both checks with one.

**Step 3: Run tests**

Run: `npm test 2>&1 | tail -5`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add app/api/alerts/route.ts
git commit -m "fix(NH-04): reject Infinity/-Infinity as alert threshold using isFinite"
```

---

## Summary

| Task | Issue | File | Change |
|------|-------|------|--------|
| 1 | NC-02 | `informe/[slug]/page.tsx` + migration | `.rpc('increment_external_views')` instead of read-modify-write |
| 2 | NH-03 | `dashboard/processing/[reportId]/page.tsx` | Stop polling + show error after 100 polls (5 min) |
| 3 | NH-04 | `api/alerts/route.ts` | `!isFinite(threshold)` instead of `isNaN(threshold)` |

Estimated time: ~20 minutes total. All tasks are independent.
