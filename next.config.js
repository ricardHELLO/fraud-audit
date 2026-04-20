/** @type {import('next').NextConfig} */

/* ------------------------------------------------------------------ */
/*  SEC-09 · Content Security Policy                                   */
/* ------------------------------------------------------------------ */

/**
 * Construye la CSP en función del entorno. Devolvemos una única
 * cadena con las directivas separadas por ';'.
 *
 * IMPORTANTE — estrategia de despliegue:
 *   Fase 1 (este PR):  Content-Security-Policy-Report-Only → la
 *     política se envía pero NO se aplica. El navegador reporta
 *     violaciones en la consola sin bloquear recursos. Así podemos
 *     medir la cobertura real antes de arriesgar un outage de auth.
 *   Fase 2 (siguiente PR, tras 1–2 semanas de observación): cambiar
 *     a `Content-Security-Policy` (enforcing). Ajustar el allowlist
 *     con lo aprendido.
 *
 * Orígenes permitidos (verificados manualmente contra el código):
 *   - Clerk: *.clerk.accounts.dev + *.clerk.com (auth SDK + API).
 *   - Supabase: *.supabase.co (REST + Realtime WSS).
 *   - Stripe: js.stripe.com + hooks.stripe.com + api.stripe.com.
 *   - PostHog: *.posthog.com (analytics ingest).
 *   - Sentry: *.sentry.io + *.ingest.sentry.io (errores + perf).
 *   - Cloudflare Turnstile: challenges.cloudflare.com (bot check de Clerk).
 *
 * `'unsafe-inline'` y `'unsafe-eval'` son un compromiso con Next.js
 * App Router: el framework inyecta scripts inline para hidratación
 * y evaluación dinámica para chunks de RSC. Eliminarlos requiere
 * nonces server-side — migración que no cabe en este PR.
 */
function buildContentSecurityPolicy() {
  const directives = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://js.stripe.com',
      'https://challenges.cloudflare.com',
      'https://*.clerk.accounts.dev',
      'https://*.clerk.com',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Tailwind JIT + CSS-in-JS de Next
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https:', // avatars de Clerk + OG images; restringir tras Phase 2
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.clerk.accounts.dev',
      'https://*.clerk.com',
      'https://api.clerk.com',
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api.stripe.com',
      'https://*.posthog.com',
      'https://*.sentry.io',
      'https://*.ingest.sentry.io',
    ],
    'frame-src': [
      "'self'",
      'https://challenges.cloudflare.com',
      'https://*.clerk.accounts.dev',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
    ],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"], // sin plugins Flash/Java
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"], // dobla el X-Frame-Options: DENY
    'upgrade-insecure-requests': [], // fuerza HTTPS en cualquier request http://
  };

  return Object.entries(directives)
    .map(([key, values]) =>
      values.length === 0 ? key : `${key} ${values.join(' ')}`
    )
    .join('; ');
}

// SEC-06: Headers de seguridad HTTP estándar. Un informe de fraude con datos
// sensibles no debe poder embeberse en un iframe (clickjacking), y queremos
// limitar el acceso a APIs del navegador que no usamos.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // SEC-09: CSP en Report-Only. Ver buildContentSecurityPolicy() para el
  // plan de migración a enforcing.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: buildContentSecurityPolicy(),
  },
  // Strict-Transport-Security lo añadimos sólo en producción: en dev (http://localhost)
  // el navegador ignora el header y en preview de Vercel ya viene forzado por la plataforma,
  // así que lo dejamos fuera para no sorprender en entornos locales.
];

const nextConfig = {
  experimental: {
    // B7: activate `instrumentation.ts` for boot-time env validation.
    // In Next 14 this hook is opt-in; Next 15 enables it by default.
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// OBS-01: Sentry. Solo envolvemos la config si el SDK está instalado y al
// menos una variable relevante está presente. Así mantenemos la
// degradación elegante: en dev local sin Sentry configurado, el build es
// idéntico al que era antes de esta PR.
function maybeWithSentry(config) {
  const sentryEnabled =
    !!process.env.SENTRY_DSN ||
    !!process.env.NEXT_PUBLIC_SENTRY_DSN ||
    !!process.env.SENTRY_AUTH_TOKEN;

  if (!sentryEnabled) return config;

  try {
    const { withSentryConfig } = require('@sentry/nextjs');
    return withSentryConfig(config, {
      // Suprime el log ruidoso de "upload skipped" cuando no hay auth token.
      silent: true,
      // org/project sólo se usan para subir source maps — opcionales.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Oculta los source maps del bundle público en producción.
      hideSourceMaps: true,
      // Tunnel de eventos vía /monitoring para esquivar ad-blockers.
      // Lo dejamos deshabilitado: añade latencia y no es crítico.
      // tunnelRoute: '/monitoring',
      disableLogger: true,
    });
  } catch {
    // @sentry/nextjs no instalado — no envolvemos.
    return config;
  }
}

module.exports = maybeWithSentry(nextConfig);
