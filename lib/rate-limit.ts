/**
 * SEC-04: rate limiting centralizado. Usa Upstash Redis REST (serverless,
 * compatible con Vercel functions sin conexiones persistentes).
 *
 * Patrón de degradación elegante — MISMO que `lib/email.ts`:
 * si las env vars `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
 * no están configuradas, `rateLimit()` devuelve `{ success: true }`
 * silenciosamente. Esto permite desplegar el código ahora y activarlo
 * más tarde provisionando el Upstash sin tocar ningún fichero.
 *
 * Para activar en producción:
 *   1. Crear base de datos en upstash.com (free tier: 10k cmd/día).
 *   2. Región eu-west-1 (para emparejar con Supabase + Vercel).
 *   3. En Vercel Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 *   4. Redeploy.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type LimitConfig = {
  /** Requests permitidas en la ventana */
  requests: number
  /** Ventana en formato Upstash (ej. "10 s", "1 m", "1 h") */
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
}

/**
 * Presets por familia de endpoint. Afinar estos valores no requiere tocar
 * las rutas — solo este fichero.
 */
export const RATE_LIMITS = {
  /**
   * Uploads: costosos (Storage + parsing + Inngest step). Protege contra
   * un atacante que dispara cientos de uploads con ficheros grandes.
   */
  upload: { requests: 10, window: '1 m' },
  /**
   * Análisis: el más caro (Anthropic API, ~30-60s, cuesta dinero).
   * Límite muy conservador.
   */
  analyze: { requests: 5, window: '1 m' },
  /**
   * Feedback: ligero pero el flujo normal es 1 por report. 20/min protege
   * de bots sin molestar a usuarios reales.
   */
  feedback: { requests: 20, window: '1 m' },
  /**
   * Alert rules CRUD: user-initiated, UI-bound. 30/min es generoso.
   */
  alerts: { requests: 30, window: '1 m' },
  /**
   * Bug reports: anti-spam. Un humano no envía más de 5 bug reports en
   * 10 minutos.
   */
  bugReport: { requests: 5, window: '10 m' },
} satisfies Record<string, LimitConfig>

export type RateLimitKey = keyof typeof RATE_LIMITS

/* ------------------------------------------------------------------ */
/*  Singleton Redis + memoized Ratelimit instances                     */
/* ------------------------------------------------------------------ */

let redisSingleton: Redis | null = null
const limiters = new Map<RateLimitKey, Ratelimit>()

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  if (!redisSingleton) {
    redisSingleton = new Redis({ url, token })
  }
  return redisSingleton
}

function getLimiter(key: RateLimitKey): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  const cached = limiters.get(key)
  if (cached) return cached
  const cfg = RATE_LIMITS[key]
  const limiter = new Ratelimit({
    redis,
    // Sliding window aproximada: buen compromiso entre precisión y
    // memoria. Fixed window deja pasar 2× en el cambio de ventana.
    limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
    // Prefix distingue deploys (dev/preview/prod comparten Redis si
    // reusamos el mismo token — el prefix lo aísla).
    prefix: `fraudaudit:${key}`,
    analytics: true,
  })
  limiters.set(key, limiter)
  return limiter
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export type RateLimitResult = {
  success: boolean
  /** Cuántas requests quedan en la ventana actual (undefined si el rate limit está desactivado) */
  remaining?: number
  /** Timestamp ms en el que se resetea la ventana */
  reset?: number
  /** Límite configurado para esta familia */
  limit?: number
}

/**
 * Comprueba si una request puede proceder bajo el rate limit de `key`,
 * identificando al solicitante por `identifier` (preferiblemente el
 * userId autenticado; si es una ruta sin auth, pasar la IP).
 *
 * Si Upstash no está configurado, devuelve `{ success: true }` — el
 * llamante no tiene que saberlo.
 */
export async function rateLimit(
  key: RateLimitKey,
  identifier: string
): Promise<RateLimitResult> {
  const limiter = getLimiter(key)
  if (!limiter) {
    // Sin Upstash configurado: pass-through silencioso.
    return { success: true }
  }
  try {
    const result = await limiter.limit(identifier)
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
    }
  } catch (err) {
    // Si Redis cae, NO bloqueamos tráfico legítimo — fail-open. La
    // alternativa (fail-closed) convierte un outage de Upstash en un
    // outage del producto. Monitoreo debería alertar sobre esto.
    console.error(
      `[rate-limit] Upstash error for ${key} (fail-open):`,
      err instanceof Error ? err.message : err
    )
    return { success: true }
  }
}

/**
 * Helper para extraer un identificador razonable de una NextRequest.
 * Preferencia: userId autenticado → X-Forwarded-For → "anonymous".
 */
export function identifierFromRequest(
  req: Request,
  userId?: string | null
): string {
  if (userId) return `user:${userId}`
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return `ip:${xff.split(',')[0].trim()}`
  return 'anonymous'
}
