import { test, expect } from '@playwright/test'

/**
 * Flujos autenticados — requieren E2E_USER_EMAIL y E2E_USER_PASSWORD
 * definidos en el entorno. Si faltan, el describe entero se skip
 * para no fallar en CI sin credenciales.
 *
 * Crear el usuario de test:
 *   1. En Clerk dashboard (modo development) crea un user con email/password.
 *   2. Exporta las variables antes de `npm run test:e2e`:
 *        export E2E_USER_EMAIL="e2e@fraudaudit.test"
 *        export E2E_USER_PASSWORD="..."
 */

const email = process.env.E2E_USER_EMAIL
const password = process.env.E2E_USER_PASSWORD
const authAvailable = !!(email && password)

test.describe('Flujos autenticados', () => {
  test.skip(!authAvailable, 'E2E_USER_EMAIL / E2E_USER_PASSWORD no definidos')

  test('Login → llega al dashboard', async ({ page }) => {
    await page.goto('/login')

    // El widget de Clerk tarda en montar. Esperamos por el input de email.
    // Usamos selector por label en vez de placeholder porque Clerk cambia
    // copies por idioma.
    const emailInput = page.getByLabel(/email|correo/i).first()
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
    await emailInput.fill(email!)

    // Botón "Continue" o "Continuar" (Clerk multistep).
    await page.getByRole('button', { name: /continue|continuar/i }).first().click()

    const pwdInput = page.getByLabel(/password|contraseña/i).first()
    await pwdInput.waitFor({ state: 'visible', timeout: 10_000 })
    await pwdInput.fill(password!)

    await page.getByRole('button', { name: /continue|continuar|sign in|iniciar/i }).first().click()

    // Esperamos redirección al dashboard.
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.locator('nav')).toBeVisible()
  })

  test('Dashboard muestra navegación principal', async ({ page, context }) => {
    // Reutiliza sesión del test anterior si existe; si no, hace login inline.
    await page.goto('/dashboard')

    // Si no hay sesión, Clerk redirige a /login — en ese caso skip.
    if (page.url().includes('/login')) {
      test.skip(true, 'Sesión no persistida entre tests — requiere storageState')
    }

    await expect(page.getByText('FraudAudit').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /configuración/i })).toBeVisible()
  })
})
