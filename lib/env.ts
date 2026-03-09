/**
 * Environment variable validation — runs at build time and on first import.
 * Ensures all required configuration is present before the app starts serving.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value === 'placeholder' || value.endsWith('_placeholder')) {
    throw new Error(
      `❌ Missing or placeholder environment variable: ${name}\n` +
      `   Set it in .env.local (dev) or Vercel Environment Variables (prod).`
    )
  }
  return value
}

function optional(name: string, fallback: string = ''): string {
  return process.env[name] || fallback
}

// --- Validate & export all env vars ---

export const env = {
  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: required('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
  CLERK_SECRET_KEY: required('CLERK_SECRET_KEY'),
  CLERK_WEBHOOK_SECRET: required('CLERK_WEBHOOK_SECRET'),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: required('NEXT_PUBLIC_SUPABASE_URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),

  // Stripe (optional — disabled during free beta)
  STRIPE_SECRET_KEY: optional('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: optional('STRIPE_WEBHOOK_SECRET'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optional('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  STRIPE_PRICE_5_CREDITS: optional('STRIPE_PRICE_5_CREDITS'),
  STRIPE_PRICE_15_CREDITS: optional('STRIPE_PRICE_15_CREDITS'),
  STRIPE_PRICE_50_CREDITS: optional('STRIPE_PRICE_50_CREDITS'),

  // Inngest
  INNGEST_EVENT_KEY: required('INNGEST_EVENT_KEY'),
  INNGEST_SIGNING_KEY: required('INNGEST_SIGNING_KEY'),

  // Resend (optional — emails degrade gracefully)
  RESEND_API_KEY: optional('RESEND_API_KEY'),

  // PostHog (optional — analytics degrade gracefully)
  NEXT_PUBLIC_POSTHOG_KEY: optional('NEXT_PUBLIC_POSTHOG_KEY'),
  NEXT_PUBLIC_POSTHOG_HOST: optional('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.posthog.com'),

  // Anthropic (optional — AI insights degrade gracefully)
  ANTHROPIC_API_KEY: optional('ANTHROPIC_API_KEY'),

  // App
  NEXT_PUBLIC_APP_URL: required('NEXT_PUBLIC_APP_URL'),
} as const
