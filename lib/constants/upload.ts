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
