import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Serialize workers. Fork pool with multiple workers was hitting
    // `Timeout waiting for worker to respond` on this machine; pinning
    // `maxWorkers` a 1 mantiene la ejecución determinista mientras
    // investigamos la causa raíz. (Vitest 4 solo expone `maxWorkers` en
    // el nivel superior; `minWorkers` nunca fue parte de InlineConfig.)
    pool: 'forks',
    maxWorkers: 1,
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
