/**
 * ERR-03: logger estructurado.
 *
 * Objetivo: reemplazar los `console.error('msg:', err)` de texto libre por
 * logs JSON con campos comunes. Vercel los indexa como JSON automáticamente
 * y eso permite filtrar en el dashboard por `route`, `userId`, `code` sin
 * hacer grep de strings.
 *
 * Diseño:
 *   - Sin dependencias externas. `JSON.stringify` basta y es auditable.
 *   - Mismo patrón de degradación que `lib/rate-limit.ts` / `lib/email.ts`:
 *     si el logger falla por cualquier razón, NO tira la request.
 *   - NO integra Sentry automáticamente en `logger.error`. Queremos una
 *     separación explícita entre "loggear" y "reportar a Sentry":
 *       - `logger.error(...)` → solo log. Para errores esperados (DB no
 *         encuentra user, rate limit hit) que no necesitan alerta.
 *       - `logger.exception(err, ...)` → log + Sentry capture. Para errores
 *         realmente inesperados que merecen investigación.
 *     Rationale: auto-capturar TODO en Sentry inundaba el feed con ruido
 *     operativo. La distinción la decide el autor del call site — el
 *     logger no adivina. Ver DECISIONS.md #ERR-03.
 *   - Formato: una línea JSON por log, campos estándar al principio
 *     (level, ts, msg) y luego meta arbitrario.
 *   - En `NODE_ENV=development` pretty-print ligero para DX.
 *
 * Uso típico en una API route:
 *
 *     const log = logger.forRequest(req, { route: '/api/upload', userId });
 *     log.info('upload accepted', { bytes: file.size });
 *     log.error('DB error fetching user', { code: userError.code });
 *
 * El child logger lleva los campos base (route, userId, requestId) en cada
 * emisión sin que tengas que repetirlos.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Meta serializable a JSON. No aceptamos `Error` directamente — usar `exception()`. */
type LogMeta = Record<string, unknown>

/**
 * Prioridad numérica para filtrado por `LOG_LEVEL`. Mayor = más severo.
 * `debug` = 10 permite silenciarlo en producción poniendo `LOG_LEVEL=info`.
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function minLevel(): number {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel
  if (raw in LEVEL_PRIORITY) return LEVEL_PRIORITY[raw]
  // Default: info en producción, debug en dev. Los tests quedan en info
  // para no llenar la salida con chatter.
  return process.env.NODE_ENV === 'production' ? LEVEL_PRIORITY.info : LEVEL_PRIORITY.debug
}

/**
 * Saca un objeto serializable desde un `unknown`. `Error` y similares
 * pierden propiedades al pasar por `JSON.stringify` porque sus campos son
 * no-enumerables. Aquí normalizamos a `{ name, message, stack, ...rest }`.
 */
function serializeError(err: unknown): LogMeta {
  if (err instanceof Error) {
    const out: LogMeta = {
      name: err.name,
      message: err.message,
    }
    // Stack solo en dev — en prod inunda los logs y ya lo tiene Sentry.
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      out.stack = err.stack
    }
    // Campos custom (ej. Supabase le añade `code`, `details`, `hint`).
    for (const key of Object.keys(err) as Array<keyof typeof err>) {
      if (key !== 'stack') out[key as string] = (err as Record<string, unknown>)[key as string]
    }
    return out
  }
  if (typeof err === 'object' && err !== null) {
    // Ya es un objeto plano — lo dejamos tal cual.
    return err as LogMeta
  }
  return { value: String(err) }
}

/**
 * Emite una línea. Captura cualquier fallo de serialización (ej. meta con
 * ciclos) para que el logger JAMÁS rompa el flujo del caller.
 */
function emit(level: LogLevel, msg: string, base: LogMeta, extra: LogMeta | undefined): void {
  if (LEVEL_PRIORITY[level] < minLevel()) return

  const payload: LogMeta = {
    level,
    ts: new Date().toISOString(),
    msg,
    ...base,
    ...extra,
  }

  let line: string
  try {
    line = JSON.stringify(payload)
  } catch {
    // Fallback si `extra` tiene ciclos u objetos no serializables.
    line = JSON.stringify({ level, ts: payload.ts, msg, _serializationFailed: true })
  }

  // Canal por nivel para que las integraciones de Vercel (que clasifican
  // stdout vs stderr) reflejen la severidad. `warn` y `error` → stderr.
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line)
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line)
  } else {
    // eslint-disable-next-line no-console
    console.log(line)
  }
}

/**
 * La API pública es un logger "root" más un `child()` para añadir contexto
 * sin mutar el root. Mismo patrón que pino/bunyan pero sin dependencia.
 */
export interface Logger {
  debug(msg: string, meta?: LogMeta): void
  info(msg: string, meta?: LogMeta): void
  warn(msg: string, meta?: LogMeta): void
  error(msg: string, meta?: LogMeta): void
  /**
   * Log + reporte a Sentry. Usar cuando el error es inesperado y queremos
   * que dispare alerta. El 2º argumento es el mensaje humano; el err va
   * como meta normalizada vía `serializeError`.
   */
  exception(err: unknown, msg: string, meta?: LogMeta): void
  /** Devuelve un logger con los `bindings` añadidos como base. */
  child(bindings: LogMeta): Logger
  /**
   * Shortcut para API routes. Extrae un requestId razonable y lo fija
   * como binding junto al `route` explícito.
   */
  forRequest(req: Request, extra?: LogMeta): Logger
}

function buildLogger(base: LogMeta): Logger {
  return {
    debug: (msg, meta) => emit('debug', msg, base, meta),
    info: (msg, meta) => emit('info', msg, base, meta),
    warn: (msg, meta) => emit('warn', msg, base, meta),
    error: (msg, meta) => emit('error', msg, base, meta),
    exception(err, msg, meta) {
      const errMeta = serializeError(err)
      emit('error', msg, base, { ...errMeta, ...meta })
      // Best-effort Sentry. Import dinámico para no forzar el bundle si
      // Sentry no está instalado. Si falla (ej. Sentry sin DSN), no rompe.
      if (process.env.SENTRY_DSN) {
        import('@sentry/nextjs')
          .then((Sentry) => {
            Sentry.captureException(err, {
              extra: { ...base, ...meta },
              tags: base.route ? { route: String(base.route) } : undefined,
            })
          })
          .catch(() => {
            /* Sentry no disponible — ya loggeamos arriba. */
          })
      }
    },
    child(bindings) {
      return buildLogger({ ...base, ...bindings })
    },
    forRequest(req, extra) {
      // Vercel añade `x-vercel-id` en cada request. Si no (dev), generamos uno.
      const requestId =
        req.headers.get('x-vercel-id') ??
        req.headers.get('x-request-id') ??
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `req_${Date.now().toString(36)}`)
      return buildLogger({ ...base, requestId, ...extra })
    },
  }
}

/** Logger raíz. Los call sites normalmente hacen `logger.child({ route: ... })`. */
export const logger: Logger = buildLogger({})
