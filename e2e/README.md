# E2E tests (Playwright)

Scaffold mínimo de tests end-to-end. Cubre:

- **`smoke.spec.ts`** — rutas públicas (landing, login, signup, healthcheck opcional). Corre siempre.
- **`auth.spec.ts`** — flujos autenticados. Se skipea si faltan `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`.

## Setup inicial (una sola vez)

```bash
# Instalar dependencias (si no lo está ya)
npm install

# Descargar el navegador Chromium (~170 MB)
npx playwright install --with-deps chromium
```

## Ejecución

### Contra dev server local (auto-arranca `npm run dev`)

```bash
npm run test:e2e
```

### Contra preview de Vercel (PR) o producción

```bash
E2E_BASE_URL=https://fraud-audit-git-<branch>.vercel.app npm run test:e2e
```

### Modo UI interactivo (debug)

```bash
npm run test:e2e:ui
```

### Sólo smoke (sin flujos autenticados)

```bash
npx playwright test smoke
```

## Flujos autenticados

Requieren un usuario de test creado previamente en Clerk (modo development):

```bash
export E2E_USER_EMAIL="e2e@fraudaudit.test"
export E2E_USER_PASSWORD="..."
npm run test:e2e
```

Sin esas variables, `auth.spec.ts` se marca como skipped para no fallar en CI sin credenciales.

## Estructura de informes

- `playwright-report/` — HTML report (tras cada run local).
- `test-results/` — traces, screenshots y videos de fallos (`trace: retain-on-failure`).

Ambos están en `.gitignore`.

## Extensión futura

Cuando se amplíe la suite, añadir:

- Proyecto `firefox` / `webkit` en `playwright.config.ts` para cobertura multi-browser.
- `storageState` autenticado generado una vez en `global-setup.ts` para no repetir login por test.
- Mock de Stripe con `page.route('**/checkout.stripe.com/**', …)` para flujos de upgrade.
- Workflow de GitHub Actions `e2e.yml` disparado en PR con `E2E_BASE_URL` apuntando al preview de Vercel.
