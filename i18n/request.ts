import { getRequestConfig } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import { routing, type Locale } from './routing'

/**
 * Server-side request config for next-intl.
 *
 * Loads the message bundle for the active locale. Non-ES locales fall back to
 * `es.json` until their own files are translated — this lets the app boot in
 * any declared locale without crashing on missing keys during the rollout.
 *
 * NOTE: this file is currently UNUSED. It is referenced by
 * `createNextIntlPlugin('./i18n/request.ts')` in `next.config.js`, which is
 * NOT yet wired. See `docs/03_I18N_MIGRATION_PLAN.md`.
 */

/**
 * Type guard replacing next-intl's `hasLocale`. That helper is only
 * exported from next-intl v4.x; the project is still on Next 14 which
 * requires next-intl v3.x. This inline guard gives us the same narrowing
 * (`string | undefined` -> `Locale`) without the version bump.
 * When we upgrade to next-intl v4, swap this back to the library export.
 */
function isSupportedLocale(x: string | undefined): x is Locale {
  if (!x) return false
  return (routing.locales as readonly string[]).includes(x)
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isSupportedLocale(requested) ? requested : routing.defaultLocale

  // Fall back to es.json for locales whose message files don't exist yet.
  // Swap this out once ca.json and en.json are translated.
  //
  // Type note: next-intl expects `AbstractIntlMessages` (recursive
  // `string | AbstractIntlMessages`), NOT `Record<string, unknown>`.
  // A JSON module's `.default` is typed as `any`, so we cast once on
  // assignment instead of at the return site — keeps the type narrow
  // inside the function and avoids a second cast for the fallback branch.
  let messages: AbstractIntlMessages
  try {
    messages = (await import(`../messages/${locale}.json`)).default as AbstractIntlMessages
  } catch {
    messages = (await import('../messages/es.json')).default as AbstractIntlMessages
  }

  return {
    locale,
    messages,
  }
})
