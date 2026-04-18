import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Serialize workers. Fork pool with multiple workers was hitting
    // `Timeout waiting for worker to respond` on this machine; pinning to
    // one worker keeps the run deterministic while we investigate a root
    // cause. Vitest 4 removed `poolOptions` — `maxWorkers`/`minWorkers` now
    // live at the top level (see https://vitest.dev/guide/migration#pool-rework).
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    // Exclude editor-owned worktrees, build artifacts, and tooling state.
    // Without `.claude/**`, vitest would pick up test copies from git worktrees
    // and duplicate test runs, saturating the worker pool.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.claude/**',
      '**/.git/**',
      '**/coverage/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
