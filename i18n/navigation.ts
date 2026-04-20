import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/**
 * Locale-aware navigation primitives.
 *
 * Replace imports of `next/link` and `next/navigation` with these wrappers in
 * all components under `app/[locale]/**` so that `<Link href="/dashboard">`
 * automatically resolves to the correct locale-prefixed URL.
 *
 * NOTE: this file is currently UNUSED. See `docs/03_I18N_MIGRATION_PLAN.md`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
