import { test, expect } from '@playwright/test'

/**
 * Smoke tests — rutas públicas que NO requieren autenticación.
 * Estos tests corren siempre (local + CI + preview Vercel) porque
 * sólo dependen del HTML servido por Next.
 */

test.describe('Rutas públicas', () => {
  test('Landing carga y muestra marca + CTA principal', async ({ page }) => {
    await page.goto('/')

    // La marca aparece en header y footer.
    await expect(page.getByText('FraudAudit').first()).toBeVisible()

    // El CTA principal apunta a /login (hay varios botones "Empezar" en la
    // landing, así que comprobamos al menos uno con ese href).
    const loginLinks = page.locator('a[href="/login"]')
    await expect(loginLinks.first()).toBeVisible()
  })

  test('Login page carga el widget de Clerk', async ({ page }) => {
    await page.goto('/login')

    // Clerk renderiza iframe o bloque con data-clerk-*. Aceptamos cualquiera
    // de las señales posibles para no acoplarnos a la versión exacta.
    const clerkMarkers = page.locator(
      'iframe[src*="clerk"], [data-clerk-sign-in], [data-clerk-component]'
    )
    await expect(clerkMarkers.first()).toBeVisible({ timeout: 10_000 })
  })

  test('Signup page responde 200', async ({ page }) => {
    const response = await page.goto('/signup')
    expect(response?.status()).toBeLessThan(400)
  })

  test('API /api/healthcheck devuelve JSON válido si existe', async ({ request }) => {
    // Test defensivo: si el endpoint existe, debe responder JSON.
    // Si no existe (404), lo marcamos como skip para no mentir en verde.
    const res = await request.get('/api/healthcheck', { failOnStatusCode: false })
    if (res.status() === 404) {
      test.skip(true, '/api/healthcheck no implementado — opcional')
    }
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeTruthy()
  })
})
