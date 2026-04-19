/**
 * OBS-01: inicialización de Sentry en el runtime Node.js (API routes,
 * server components renderizados en node, middleware en node).
 *
 * Si `SENTRY_DSN` no está definido, `init` no se llama → SDK queda inerte
 * y ninguna captura se envía. Mismo patrón que `lib/rate-limit.ts`.
 */

import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Muestreo de performance (spans/transactions). Errores se envían SIEMPRE.
    // 0.1 = 10% de las transacciones. Subir si el volumen es bajo y queremos
    // más visibilidad; bajar si Sentry empieza a saturar cuota.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // `environment` aparece en el UI de Sentry como filtro — distingue
    // errores de preview vs producción.
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    // `release` permite asociar errores a un deploy concreto (source maps).
    // Vercel expone el SHA del commit en `VERCEL_GIT_COMMIT_SHA`.
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // OBS-01 · privacidad: un informe de fraude contiene datos sensibles.
    // `sendDefaultPii: false` (default) ya evita que Sentry incluya IPs y
    // cookies automáticamente. Este `beforeSend` es una red adicional:
    // eliminamos headers de auth y cualquier cuerpo de request por si
    // alguna integración futura los añadiera.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-clerk-session-token'];
      }
      // Nunca enviar el body de la request — puede contener datos de POS.
      if (event.request) {
        delete event.request.data;
      }
      return event;
    },

    // Ruido conocido que no queremos ver en el dashboard.
    ignoreErrors: [
      // Clerk lanza esto cuando el token expira — comportamiento esperado,
      // no es un bug.
      'ClerkAPIResponseError',
      // Abortos de usuario al cerrar la pestaña durante una request larga.
      'AbortError',
    ],
  });
}
