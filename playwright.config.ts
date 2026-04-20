import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config para FraudAudit.
 *
 * Variables de entorno relevantes:
 *   E2E_BASE_URL      URL de la app a testear (default: http://localhost:3000)
 *   E2E_USER_EMAIL    Credencial de test para flujos autenticados (opcional)
 *   E2E_USER_PASSWORD Credencial de test para flujos autenticados (opcional)
 *   CI                Si está presente, activa retries y reporter line
 *
 * Modo local:
 *   - Si no se define E2E_BASE_URL, arrancamos `npm run dev` automáticamente.
 * Modo remoto (preview Vercel):
 *   - Definir E2E_BASE_URL=https://fraud-audit-git-<branch>.vercel.app
 *     y los tests corren contra ese deploy sin arrancar server local.
 */

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  /** Tiempo máximo por test individual (30s). */
  timeout: 30_000,
  /** Tiempo máximo para expect(...).toXxx() por paso (5s). */
  expect: { timeout: 5_000 },

  /** Paralelismo: en CI secuencial para evitar rate-limits; local full parallel. */
  fullyParallel: !isCI,
  workers: isCI ? 1 : undefined,

  /** Retries sólo en CI; local queremos ver el fallo inmediato. */
  retries: isCI ? 2 : 0,

  /** Reporter compacto en CI, HTML + lista en local. */
  reporter: isCI ? 'line' : [['list'], ['html', { open: 'never' }]],

  /** Evitar fallos silenciosos: si hay test sin assertions, peta. */
  forbidOnly: isCI,

  use: {
    baseURL,
    /** Captura traces sólo si el test falla — útil para post-mortem. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /** Locale consistente con la app (ES). */
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // firefox/webkit se pueden añadir cuando la suite crezca; de momento
    // mantenemos un solo navegador para que la instalación sea ligera.
  ],

  /** Sólo arrancamos dev server si trabajamos contra localhost. */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
})
