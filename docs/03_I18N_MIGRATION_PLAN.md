# i18n — plan de migración a next-intl

**Estado:** scaffolding mergeado en PR #14. Infra presente, **no activa**. Flip switch en PR #15 (o posterior).

**Última actualización:** 2026-04-19
**Owner:** Ricard
**Dependencias:** ninguna (scaffolding es aditivo y no toca rutas existentes).

---

## 0. Por qué next-intl (resumen de la decisión)

- First-class App Router: funciona en Server Components sin JS al cliente.
- Autocompletado TypeScript de claves.
- Soporte ICU (plurales, género, formato numérico, moneda).
- Docs maduras, comunidad grande.

Alternativas descartadas: `next-i18next` (Pages Router nativo), `react-i18next` solo (obliga a client components).

---

## 1. Qué trae este PR (#14)

Scaffolding aditivo, cero behavior change:

| Archivo | Qué es |
|---|---|
| `messages/es.json` | ~150 strings ES extraídos de la UI actual, agrupados por feature (landing, dashboard, upload, processing, report, compare, settings, onboarding, common). |
| `i18n/routing.ts` | Config de locales (`es`/`ca`/`en`), default `es`, prefix `as-needed`. |
| `i18n/navigation.ts` | Wrappers locale-aware de `Link`, `redirect`, `useRouter`, `usePathname`. |
| `i18n/request.ts` | Loader de messages por locale con fallback a `es.json` para locales sin traducir. |
| `docs/03_I18N_MIGRATION_PLAN.md` | Este documento. |

**Qué NO trae este PR** (intencional):

- No instala `next-intl` como dependencia (`package.json` sin cambios).
- No modifica `next.config.js`.
- No modifica `middleware.ts`.
- No mueve `app/**` a `app/[locale]/**`.
- No refactoriza ningún componente existente.

**Por qué este alcance**: el scaffolding solo es leer-y-tirar hasta que el switch esté listo. Separar el "sube el catálogo" del "activa el routing" permite revisar el catálogo sin riesgo, y dar bandwidth al refactor cuando haya tiempo.

---

## 2. PR #15 — activar el routing (~45-90 min plumbing + 2-4 h refactor pages)

### 2.1 Instalar dependencia

```bash
npm install next-intl
```

### 2.2 Modificar `next.config.js`

```javascript
// next.config.js
const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const securityHeaders = [ /* ...sin cambios... */ ]

const nextConfig = {
  experimental: {},
  async headers() { return [{ source: '/:path*', headers: securityHeaders }] },
}

module.exports = withNextIntl(nextConfig)
```

### 2.3 Modificar `middleware.ts`

**Cuidado orden vs Clerk**: next-intl debe ejecutarse ANTES de `auth.protect()` para que el redirect de locale ocurra primero.

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

const isProtectedRoute = createRouteMatcher([
  '/(es|ca|en)/dashboard(.*)',
  '/dashboard(.*)',
  '/(es|ca|en)/onboarding(.*)',
  '/onboarding(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl

  // API routes: no i18n, solo Clerk.
  if (pathname.startsWith('/api') || pathname.startsWith('/trpc')) {
    if (isProtectedRoute(req)) await auth.protect()
    return NextResponse.next()
  }

  // Redirect legacy /reports/:slug → /informe/:slug (preservar comportamiento).
  if (pathname.startsWith('/reports/')) {
    const slug = pathname.replace('/reports/', '')
    const url = req.nextUrl.clone()
    url.pathname = `/informe/${slug}`
    return NextResponse.redirect(url, 301)
  }

  if (isProtectedRoute(req)) await auth.protect()

  return intlMiddleware(req)
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

### 2.4 Mover `app/**` → `app/[locale]/**`

```bash
mkdir -p app/\[locale\]
git mv app/page.tsx         app/\[locale\]/page.tsx
git mv app/layout.tsx       app/\[locale\]/layout.tsx
git mv app/dashboard        app/\[locale\]/dashboard
git mv app/onboarding       app/\[locale\]/onboarding
git mv app/login            app/\[locale\]/login
git mv app/signup           app/\[locale\]/signup
git mv app/informe          app/\[locale\]/informe
# NO mover: app/api (API routes quedan en app/api/**)
# NO mover: app/global-error.tsx (si existe, va en la raíz)
# NO mover: app/error.tsx si es específico (puede ir bajo [locale])
```

### 2.5 Actualizar `app/[locale]/layout.tsx`

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ClerkProvider } from '@clerk/nextjs'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as any)) notFound()

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <ClerkProvider>
      <html lang={locale}>
        <body>
          <NextIntlClientProvider messages={messages} locale={locale}>
            {children}
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

### 2.6 TypeScript autocompletar claves

```typescript
// global.d.ts (raíz del repo)
import type messages from './messages/es.json'

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
    Locale: 'es' | 'ca' | 'en'
  }
}
```

---

## 3. Refactor de páginas — patrón

### 3.1 Server Component (la mayoría de `app/**`)

**Antes:**

```tsx
export default function LandingPage() {
  return (
    <section>
      <h1>Detecta fraude operativo en tu restaurante en minutos</h1>
      <Button>Genera tu informe gratis</Button>
    </section>
  )
}
```

**Después:**

```tsx
import { getTranslations } from 'next-intl/server'

export default async function LandingPage() {
  const t = await getTranslations('landing.hero')
  return (
    <section>
      <h1>{t('title')}</h1>
      <Button>{t('ctaPrimary')}</Button>
    </section>
  )
}
```

### 3.2 Client Component

**Antes:**

```tsx
'use client'
export default function UploadPage() {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const res = await fetch('/api/analyze', { method: 'POST' })
    if (!res.ok) setError('No se pudo analizar el archivo…')
  }

  return (
    <form>
      <h1>Subir datos para analisis</h1>
      <button>Analizar</button>
      {error && <Alert>{error}</Alert>}
    </form>
  )
}
```

**Después:**

```tsx
'use client'
import { useTranslations } from 'next-intl'

export default function UploadPage() {
  const t = useTranslations('upload')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const res = await fetch('/api/analyze', { method: 'POST' })
    if (!res.ok) setError(t('errors.invalidFile'))
  }

  return (
    <form>
      <h1>{t('title')}</h1>
      <button>{t('submit')}</button>
      {error && <Alert>{error}</Alert>}
    </form>
  )
}
```

### 3.3 Variables dinámicas (ICU)

```json
"report": { "slugLabel": "Slug: {slug}" }
```

```tsx
t('slugLabel', { slug: report.slug })
// → "Slug: abc-123"
```

### 3.4 Plurales (añadir cuando aparezcan)

```json
"dashboard": {
  "reportsCount": "{count, plural, =0 {Sin informes} one {# informe} other {# informes}}"
}
```

### 3.5 Formato moneda / fecha

```tsx
import { useFormatter } from 'next-intl'
const format = useFormatter()
format.number(1247.5, { style: 'currency', currency: 'EUR' })
```

> **Respeto a BIZ-04**: `useFormatter` se puede usar libremente para **presentación**, pero los valores siempre vienen del `ReportData` sin recalcular. La regla "no-touch calculators" no prohíbe reformato locale — prohíbe cambiar la magnitud. Ver `docs/02_BUSINESS_RULES.md#biz-04`.

---

## 4. Orden de refactor recomendado (incremental, no big-bang)

Para evitar tener la app rota durante días:

1. **PR #15**: setup infra (`npm install next-intl`, `next.config.js`, `middleware.ts`, `app/[locale]/layout.tsx`, TypeScript global). No rompe páginas todavía — solo mueve `app/page.tsx` y refactoriza la landing. Deploy. Verificar que `/` sirve la landing en ES con `localePrefix: 'as-needed'`.
2. **PR #16-20**: una página por PR, en orden de tráfico:
   - `app/[locale]/dashboard/page.tsx`
   - `app/[locale]/dashboard/upload/page.tsx`
   - `app/[locale]/informe/[slug]/page.tsx`
   - `app/[locale]/dashboard/settings/page.tsx`
   - `app/[locale]/dashboard/comparar/page.tsx`
   - `app/[locale]/dashboard/processing/[reportId]/page.tsx`
   - `app/[locale]/onboarding/page.tsx`
3. **PR #21**: añadir `messages/ca.json` copiando `es.json` → envío a traductor.
4. **PR #22**: añadir `messages/en.json` idem.
5. **PR #23**: componente `<LocaleSwitcher />` en navbar.

---

## 5. Tests

Smoke test anti-regresión de strings hardcodeadas (añadir cuando se haga el refactor):

```typescript
// __tests__/i18n-coverage.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'app', '[locale]')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(tsx|ts)$/.test(entry)) out.push(p)
  }
  return out
}

describe('i18n coverage', () => {
  const forbidden = [
    />Iniciar sesion</i,
    />Analizar</i,
    />Comparar Informes</i,
    /Detecta fraude operativo/i,
  ]

  for (const file of walk(ROOT)) {
    it(`no hardcoded ES in ${file.replace(process.cwd(), '')}`, () => {
      const src = readFileSync(file, 'utf8')
      for (const re of forbidden) expect(src).not.toMatch(re)
    })
  }
})
```

No exhaustivo — es safety net, no el único guard. El guard real es TypeScript + code review.

---

## 6. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| `git mv app/** → app/[locale]/**` rompe links compartidos por email / redes | `localePrefix: 'as-needed'` mantiene URLs ES intactas. Si aparecen 404s, redirects en `next.config.js`. |
| Clerk middleware + next-intl middleware se pisan | Orden explícito en sección 2.3: next-intl corre DESPUÉS de `auth.protect()` y SOLO en rutas no-API. |
| Traducciones CA/EN desalineadas con ES durante rollout | `request.ts` cae a `es.json` si la clave o el archivo faltan. La app nunca crashea por missing key. |
| Bundle size | ~8 KB gzipped extra por locale cargada. Aceptable. |
| PDFs (`@react-pdf/renderer`) tienen su propio sistema de i18n | Fuera del alcance de esta migración. Se tratará en PR separado si hay demanda CA/EN para PDFs. |

---

## 7. Checklist PR #15

- [ ] `npm install next-intl`
- [ ] Modificar `next.config.js` con `createNextIntlPlugin`
- [ ] Modificar `middleware.ts` con orden Clerk → next-intl (ver 2.3)
- [ ] Crear `global.d.ts` con types de messages
- [ ] `git mv` de `app/**` a `app/[locale]/**` (excepto `app/api`)
- [ ] Actualizar `app/[locale]/layout.tsx` con `NextIntlClientProvider` y `setRequestLocale`
- [ ] Refactor `app/[locale]/page.tsx` (landing) — primer smoke test visual
- [ ] `npm run build` sin errores TS
- [ ] `npm test` verde (seguir con las 51 suites existentes)
- [ ] Deploy a preview, verificar que `/` sirve landing, `/dashboard` pide login (middleware OK)
- [ ] Merge → main → deploy a producción

---

**Relacionado:**
- Scaffolding: `messages/es.json`, `i18n/routing.ts`, `i18n/navigation.ts`, `i18n/request.ts`
- BIZ-04 (compatible con i18n): `docs/02_BUSINESS_RULES.md`
- Decision log: `DECISIONS.md`
