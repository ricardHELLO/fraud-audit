/**
 * OBS-01: inicialización de Sentry en el runtime Edge.
 *
 * En este proyecto no usamos rutas edge hoy, pero Next.js puede promocionar
 * middleware o rutas a edge automáticamente (p.ej. `middleware.ts` si se
 * configura). Cubrimos el caso para que un futuro cambio no deje un agujero
 * de observabilidad.
 *
 * Misma degradación elegante: sin DSN, no-op.
 */

import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}
