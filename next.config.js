/** @type {import('next').NextConfig} */

// SEC-06: Headers de seguridad HTTP estándar. Un informe de fraude con datos
// sensibles no debe poder embeberse en un iframe (clickjacking), y queremos
// limitar el acceso a APIs del navegador que no usamos.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Strict-Transport-Security lo añadimos sólo en producción: en dev (http://localhost)
  // el navegador ignora el header y en preview de Vercel ya viene forzado por la plataforma,
  // así que lo dejamos fuera para no sorprender en entornos locales.
];

const nextConfig = {
  experimental: {},
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
