import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

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
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  // Fall back to es.json for locales whose message files don't exist yet.
  // Swap this out once ca.json and en.json are translated.
  let messages: Record<string, unknown>
  try {
    messages = (await import(`../messages/${locale}.json`)).default
  } catch {
    messages = (await import('../messages/es.json')).default
  }

  return {
    locale,
    messages,
  }
})
