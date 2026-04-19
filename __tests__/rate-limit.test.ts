import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit, identifierFromRequest, RATE_LIMITS } from '@/lib/rate-limit'

describe('rate-limit — sin UPSTASH env vars (graceful degradation)', () => {
  beforeEach(() => {
    // Aseguramos que los tests NO golpean a Upstash real. Sin las dos
    // env vars, el helper debe devolver `{ success: true }` siempre.
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    vi.resetModules()
  })

  it('devuelve success=true cuando Upstash no está configurado', async () => {
    // Este es el comportamiento crítico: en deploys sin las env vars
    // (incluyendo local + CI + previews antes de provisión), el código
    // de las rutas NO debe romperse. Si algún día este test falla,
    // `rateLimit` empezó a requerir credenciales → sería un breaking
    // change silencioso que tumbaría producción sin env vars.
    const { rateLimit: rl } = await import('@/lib/rate-limit')
    const result = await rl('upload', 'user:test-1')
    expect(result.success).toBe(true)
  })

  it('no lanza cuando se llama 100 veces seguidas sin Upstash', async () => {
    const { rateLimit: rl } = await import('@/lib/rate-limit')
    for (let i = 0; i < 100; i++) {
      const result = await rl('upload', `user:test-${i}`)
      expect(result.success).toBe(true)
    }
  })
})

describe('RATE_LIMITS config — presets', () => {
  it('analyze es el preset más estricto (Anthropic-cost-sensitive)', () => {
    // Si alguien sube el límite de analyze sin pensarlo, el coste de
    // Anthropic se dispara. Este test congela el valor actual para
    // forzar una decisión explícita al cambiarlo.
    expect(RATE_LIMITS.analyze.requests).toBe(5)
    expect(RATE_LIMITS.analyze.window).toBe('1 m')
  })

  it('bugReport usa una ventana larga (anti-spam)', () => {
    // Bug reports son texto libre → vector de spam. La ventana larga
    // (10m) discrimina bursts automatizados mejor que una ventana
    // corta con más tokens.
    expect(RATE_LIMITS.bugReport.window).toBe('10 m')
  })

  it('upload es generoso pero no ilimitado', () => {
    // 10 uploads/min deja margen a un analista que sube por lotes,
    // pero bloquea a un atacante que automatiza subidas de 50MB.
    expect(RATE_LIMITS.upload.requests).toBe(10)
  })
})

describe('identifierFromRequest — preferencia userId > IP > anonymous', () => {
  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request('https://example.test/', { headers })
  }

  it('prefiere userId cuando está presente', () => {
    const id = identifierFromRequest(makeRequest(), 'user_abc123')
    expect(id).toBe('user:user_abc123')
  })

  it('cae a X-Forwarded-For si no hay userId', () => {
    // X-Forwarded-For puede ser "ip1, ip2, ip3" (chain de proxies).
    // Tomamos solo el primero (cliente original); los demás son
    // intermediarios y no identifican al solicitante.
    const id = identifierFromRequest(
      makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }),
      null
    )
    expect(id).toBe('ip:203.0.113.5')
  })

  it('trimmea whitespace del primer XFF token', () => {
    const id = identifierFromRequest(
      makeRequest({ 'x-forwarded-for': '  203.0.113.5  , 10.0.0.1' }),
      null
    )
    expect(id).toBe('ip:203.0.113.5')
  })

  it('cae a "anonymous" cuando no hay nada', () => {
    const id = identifierFromRequest(makeRequest(), undefined)
    expect(id).toBe('anonymous')
  })
})
