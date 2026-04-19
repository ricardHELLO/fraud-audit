/**
 * Upload-related limits shared between the upload API route and the
 * client-side file picker. Keeping them here ensures both sides agree
 * on the same cap and tests can assert the value without mocking routes.
 */

/**
 * Hard cap on uploaded CSV size. `file.text()` without a check allows
 * arbitrary-size uploads (PERF-01 / BUG-API03).
 *
 * 50 MB is generous for 12 months × 50 locations of POS data, yet small
 * enough to bound the worst-case memory footprint of the Next.js worker.
 */
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024

/**
 * Human-readable form used in error messages shown to the user.
 */
export const UPLOAD_MAX_MB = UPLOAD_MAX_BYTES / 1024 / 1024

/**
 * Hard cap on parsed row count. `UPLOAD_MAX_BYTES` already bounds memory
 * at the byte level (PERF-01), but PapaParse expands each line into a
 * row object, and pathological inputs (very short lines, lots of empty
 * cells) can still materialise far more rows than the byte cap suggests.
 *
 * 500 000 gives ~3× headroom over a realistic byte-cap-limited input
 * (≈170k rows at avg 300 bytes/row), yet stays well under the Vercel
 * 1024 MB worker OOM threshold (~1.7M rows theoretical). Rejecting
 * earlier produces a clearer 413 error than letting the Inngest job OOM.
 *
 * PERF-02.
 */
export const UPLOAD_MAX_ROWS = 500_000
