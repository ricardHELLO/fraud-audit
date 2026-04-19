import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logger } from '@/lib/logger'

/**
 * El logger escribe a `console.log/warn/error`. Los tests interceptan esos
 * canales, parsean el JSON y hacen aserciones sobre la estructura. Así
 * protegemos el CONTRATO (qué campos aparecen, con qué nombres) sin
 * acoplarnos al formato literal.
 */

type Captured = { channel: 'log' | 'warn' | 'error'; payload: Record<string, unknown> }

function captureLogs(): { captured: Captured[]; restore: () => void } {
  const captured: Captured[] = []
  const spies = [
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      captured.push({ channel: 'log', payload: JSON.parse(String(line)) })
    }),
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      captured.push({ channel: 'warn', payload: JSON.parse(String(line)) })
    }),
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      captured.push({ channel: 'error', payload: JSON.parse(String(line)) })
    }),
  ]
  return {
    captured,
    restore: () => spies.forEach((s) => s.mockRestore()),
  }
}

describe('logger — contrato básico', () => {
  let cap: ReturnType<typeof captureLogs>

  beforeEach(() => {
    // Forzar nivel bajo para no perdernos debug/info en los tests.
    process.env.LOG_LEVEL = 'debug'
    delete process.env.SENTRY_DSN
    cap = captureLogs()
  })

  afterEach(() => {
    cap.restore()
  })

  it('emite JSON con level, ts y msg en todos los niveles', () => {
    logger.debug('d-msg')
    logger.info('i-msg')
    logger.warn('w-msg')
    logger.error('e-msg')

    expect(cap.captured).toHaveLength(4)
    const [d, i, w, e] = cap.captured
    expect(d.channel).toBe('log')
    expect(i.channel).toBe('log')
    expect(w.channel).toBe('warn')
    expect(e.channel).toBe('error')
    for (const { payload } of cap.captured) {
      expect(payload).toMatchObject({
        level: expect.stringMatching(/^(debug|info|warn|error)$/),
        ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        msg: expect.stringMatching(/-msg$/),
      })
    }
  })

  it('mergea meta opcional sin sobrescribir campos base', () => {
    logger.info('hi', { userId: 'u1', nested: { k: 'v' } })
    expect(cap.captured[0].payload).toMatchObject({
      level: 'info',
      msg: 'hi',
      userId: 'u1',
      nested: { k: 'v' },
    })
  })

  it('child() añade bindings y no contamina el root', () => {
    const child = logger.child({ route: '/api/upload', userId: 'u1' })
    child.error('boom')
    logger.error('root-boom')

    expect(cap.captured[0].payload).toMatchObject({
      msg: 'boom',
      route: '/api/upload',
      userId: 'u1',
    })
    expect(cap.captured[1].payload).toMatchObject({ msg: 'root-boom' })
    expect(cap.captured[1].payload.route).toBeUndefined()
  })

  it('exception() serializa Error preservando message y campos custom', () => {
    const err = Object.assign(new Error('DB down'), { code: 'PGRST500', hint: 'check RLS' })
    logger.exception(err, 'fetch failed', { userId: 'u1' })

    expect(cap.captured).toHaveLength(1)
    expect(cap.captured[0].channel).toBe('error')
    expect(cap.captured[0].payload).toMatchObject({
      level: 'error',
      msg: 'fetch failed',
      name: 'Error',
      message: 'DB down',
      code: 'PGRST500',
      hint: 'check RLS',
      userId: 'u1',
    })
  })

  it('exception() sobrevive valores no-Error (string, null, objeto plano)', () => {
    logger.exception('raw string err', 'weird1')
    logger.exception(null, 'weird2')
    logger.exception({ custom: true }, 'weird3')

    // Ninguno debe tirar; los tres deben loguear en error.
    expect(cap.captured).toHaveLength(3)
    expect(cap.captured.every((c) => c.channel === 'error')).toBe(true)
    expect(cap.captured[0].payload).toMatchObject({ msg: 'weird1', value: 'raw string err' })
    expect(cap.captured[1].payload).toMatchObject({ msg: 'weird2', value: 'null' })
    expect(cap.captured[2].payload).toMatchObject({ msg: 'weird3', custom: true })
  })

  it('respeta LOG_LEVEL descartando niveles inferiores', () => {
    process.env.LOG_LEVEL = 'warn'
    logger.debug('drop1')
    logger.info('drop2')
    logger.warn('keep1')
    logger.error('keep2')

    expect(cap.captured).toHaveLength(2)
    expect(cap.captured[0].payload.msg).toBe('keep1')
    expect(cap.captured[1].payload.msg).toBe('keep2')
  })

  it('no rompe con meta circular (fallback a línea mínima)', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    // No debe tirar.
    logger.info('cycle', circular)

    expect(cap.captured).toHaveLength(1)
    expect(cap.captured[0].payload).toMatchObject({
      level: 'info',
      msg: 'cycle',
      _serializationFailed: true,
    })
  })

  it('forRequest() usa x-vercel-id si existe', () => {
    const req = new Request('https://x/y', {
      headers: { 'x-vercel-id': 'iad::abc123' },
    })
    const log = logger.forRequest(req, { route: '/api/upload' })
    log.info('go')

    expect(cap.captured[0].payload).toMatchObject({
      msg: 'go',
      route: '/api/upload',
      requestId: 'iad::abc123',
    })
  })

  it('forRequest() genera requestId si no hay headers conocidos', () => {
    const req = new Request('https://x/y')
    const log = logger.forRequest(req)
    log.info('go')

    const { requestId } = cap.captured[0].payload as { requestId: string }
    expect(typeof requestId).toBe('string')
    expect(requestId.length).toBeGreaterThan(0)
  })
})
