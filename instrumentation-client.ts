/**
 * OBS-01: inicialización de Sentry en el navegador.
 *
 * Next.js 15 carga este fichero automáticamente (reemplaza el antiguo
 * `sentry.client.config.ts`). Usamos `NEXT_PUBLIC_SENTRY_DSN` porque las
 * variables leídas en el cliente deben tener el prefijo `NEXT_PUBLIC_`
 * para que Next las inyecte en el bundle.
 *
 * Si la variable no existe, no-op silencioso — mismo patrón que server.
 */

import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1
    ),

    // Replay: grabación de sesiones cuando hay un error. Útil para debug
    // pero caro y sensible (puede capturar datos del usuario). Lo dejamos
    // DESACTIVADO por defecto — activar sólo tras review de GDPR.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // En cliente no recibimos request bodies, pero sí URLs. Scrub de query
    // params con posibles tokens.
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          url.searchParams.delete('token');
          url.searchParams.delete('key');
          event.request.url = url.toString();
        } catch {
          // URL malformada — dejarla como está.
        }
      }
      return event;
    },

    ignoreErrors: [
      // Errores de extensiones del navegador ajenas a nuestra app.
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
    ],
  });
}

// Next.js 15 espera que este fichero exporte `onRouterTransitionStart`
// para capturar navegaciones del App Router como transacciones.
export const onRouterTransitionStart = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? Sentry.captureRouterTransitionStart
  : () => {};
