/**
 * OBS-01: entry point de instrumentación para Sentry en Next.js 15 App Router.
 *
 * Next.js llama a `register()` una sola vez al arrancar el runtime (server o
 * edge). Delegamos a ficheros de config separados por runtime porque el SDK
 * carga dependencias distintas en cada uno (p.ej. edge no tiene `fs`).
 *
 * Patrón de degradación elegante — IDÉNTICO al de `lib/rate-limit.ts`:
 * los ficheros de config leen `SENTRY_DSN` y si no está definido hacen
 * no-op silenciosamente. Esto permite desplegar este código ahora y
 * activar Sentry más tarde provisionando la variable en Vercel sin
 * tocar ningún fichero.
 *
 * Para activar en producción:
 *   1. Crear proyecto en sentry.io (platform: Next.js).
 *   2. Copiar el DSN.
 *   3. En Vercel Env: SENTRY_DSN=https://...@...ingest.sentry.io/...
 *   4. Redeploy.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// `onRequestError` permite a Sentry capturar errores de rutas RSC / server
// actions automáticamente. Sin esto, solo se reportarían errores dentro de
// `try/catch` explícitos o en API routes.
export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
  }
) {
  // Import dinámico para no cargar Sentry si no está activado.
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(err, request, context);
}
