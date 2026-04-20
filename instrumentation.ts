/**
 * Next.js instrumentation hook.
 *
 * Next.js llama a `register()` una sola vez por runtime al arrancar, antes
 * de servir ninguna request. Hacemos dos cosas aquí:
 *
 *   1. (B7) Importar `lib/env.ts` para validar variables requeridas al
 *      arranque. Si falta algo crítico, el server falla con error claro
 *      en vez de servir 500s en la primera request real.
 *
 *   2. (OBS-01) Inicializar Sentry con configs específicas por runtime
 *      (`sentry.server.config` / `sentry.edge.config`). Ambas configs
 *      hacen no-op silencioso si `SENTRY_DSN` no está definido, siguiendo
 *      el mismo patrón de degradación que `lib/rate-limit.ts`.
 *
 * Para activar Sentry en producción:
 *   1. Crear proyecto en sentry.io (platform: Next.js).
 *   2. En Vercel Env: SENTRY_DSN=https://...@...ingest.sentry.io/...
 *   3. Redeploy.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Importando por efecto secundario: `required()` en lib/env.ts lanza
    // sincrónicamente si falta algo, y Next.js propaga la excepción como
    // fallo de arranque (B7).
    await import('./lib/env');
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
