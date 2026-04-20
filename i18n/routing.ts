import { defineRouting } from 'next-intl/routing'

/**
 * Routing config for next-intl.
 *
 * - `es` is the default locale and current only fully-translated one.
 * - `ca` and `en` are declared here so the infrastructure is ready, but the
 *   message files for those locales don't exist yet. They will fall back to
 *   `es.json` via the request config until properly translated.
 *
 * `localePrefix: 'as-needed'` keeps ES URLs clean (`/dashboard` stays
 * `/dashboard`), and prefixes only for `ca`/`en` (`/en/dashboard`). This
 * avoids breaking existing links shared with customers while we migrate.
 *
 * NOTE: this file is currently UNUSED. It becomes active when the follow-up
 * PR wires up `next.config.js`, `middleware.ts`, and moves `app/**` under
 * `app/[locale]/**`. See `docs/03_I18N_MIGRATION_PLAN.md`.
 */
export const routing = defineRouting({
  locales: ['es', 'ca', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
})

export type Locale = (typeof routing.locales)[number]
