import { describe, it, expect } from 'vitest'
import {
  parseJsonBody,
  AnalyzeBodySchema,
  FeedbackBodySchema,
  AlertRuleBodySchema,
  BugReportBodySchema,
} from '@/lib/api-validation'

/**
 * Tests de P2: schemas zod + helper `parseJsonBody`.
 *
 * Estos tests protegen dos contratos:
 *
 *   1. Body malformado → 400 (no 500). Esta era la razón del bug original:
 *      `await req.json()` throwea, y sin protección acaba en el outer catch
 *      como Internal Server Error.
 *
 *   2. Campos con tipo incorrecto → 400 con `issues[]` describiendo la
 *      violación. El frontend puede mapear `issues` a errores por campo;
 *      el string `error` se mantiene para retrocompatibilidad.
 */

/* ------------------------------------------------------------------ */
/*  Helper: construye un Request con JSON o con payload malformado     */
/* ------------------------------------------------------------------ */

function jsonRequest(body: unknown): Request {
  return new Request('https://example.test/api/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function rawRequest(body: string): Request {
  return new Request('https://example.test/api/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

/* ------------------------------------------------------------------ */
/*  parseJsonBody — casos de borde de la infraestructura               */
/* ------------------------------------------------------------------ */

describe('parseJsonBody — error handling', () => {
  it('devuelve 400 (no 500) cuando el body no es JSON válido', async () => {
    // Este es el caso que disparó el bug P2 original. Antes: throw en
    // `req.json()` → outer catch → 500 "Internal server error". Ahora:
    // 400 explícito con mensaje claro.
    const req = rawRequest('not-json-at-all {{{')
    const result = await parseJsonBody(req, BugReportBodySchema)
    expect(result.success).toBe(false)
    if (result.success) return // type narrow
    expect(result.response.status).toBe(400)
    const data = (await result.response.json()) as { error: string; issues: unknown[] }
    expect(data.error).toContain('JSON malformado')
    expect(data.issues).toEqual([])
  })

  it('devuelve 400 cuando el body es JSON válido pero falla el schema', async () => {
    // Body es parseable pero no cumple el schema. `issues[]` debe
    // poblarse con el campo que falló.
    const req = jsonRequest({ description: '' }) // min(1) fallará
    const result = await parseJsonBody(req, BugReportBodySchema)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.response.status).toBe(400)
    const data = (await result.response.json()) as {
      error: string
      issues: Array<{ path: string; message: string }>
    }
    expect(data.error).toBe('Cuerpo de petición inválido')
    expect(data.issues.length).toBeGreaterThan(0)
    expect(data.issues[0]?.path).toBe('description')
  })

  it('devuelve success=true con datos tipados cuando el body es válido', async () => {
    const req = jsonRequest({ description: 'El botón X no funciona' })
    const result = await parseJsonBody(req, BugReportBodySchema)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.description).toBe('El botón X no funciona')
  })

  it('trimea strings automáticamente cuando el schema lo especifica', async () => {
    // El schema de bug-report hace `.trim().min(1)`. Un string solo de
    // espacios debe fallar (queda vacío tras trim → min(1) rompe).
    const req = jsonRequest({ description: '   ' })
    const result = await parseJsonBody(req, BugReportBodySchema)
    expect(result.success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  AnalyzeBodySchema — casos específicos de /api/analyze              */
/* ------------------------------------------------------------------ */

describe('AnalyzeBodySchema', () => {
  it('acepta un body mínimo válido', () => {
    const parsed = AnalyzeBodySchema.safeParse({
      posUploadId: 'abc123',
      posConnector: 'lastapp',
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza posConnector fuera del allowlist', () => {
    // SEC-02: un connector inventado nunca debe llegar a Inngest.
    const parsed = AnalyzeBodySchema.safeParse({
      posUploadId: 'abc123',
      posConnector: 'connector-malicioso',
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues[0]?.path).toEqual(['posConnector'])
  })

  it('acepta inventoryConnector null (frontend lo manda así)', () => {
    // El formulario de upload envía `null` explícito cuando el usuario
    // no eligió conector de inventario. El schema debe aceptarlo sin
    // requerir que sea undefined.
    const parsed = AnalyzeBodySchema.safeParse({
      posUploadId: 'abc123',
      posConnector: 'lastapp',
      inventoryConnector: null,
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza posUploadId vacío (string con length 0)', () => {
    const parsed = AnalyzeBodySchema.safeParse({
      posUploadId: '',
      posConnector: 'lastapp',
    })
    expect(parsed.success).toBe(false)
  })

  it('rechaza body que no es objeto (string suelto, array, null)', () => {
    // Antes del fix P2, `const { posUploadId } = "cadena"` lanzaba
    // TypeError → 500. Ahora el schema rechaza antes de destructurar.
    expect(AnalyzeBodySchema.safeParse('string-suelto').success).toBe(false)
    expect(AnalyzeBodySchema.safeParse(['array']).success).toBe(false)
    expect(AnalyzeBodySchema.safeParse(null).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  FeedbackBodySchema — BIZ-07 regression                             */
/* ------------------------------------------------------------------ */

describe('FeedbackBodySchema', () => {
  it('acepta accuracy_rating entero 1..5', () => {
    for (const r of [1, 2, 3, 4, 5]) {
      const parsed = FeedbackBodySchema.safeParse({
        reportId: 'rpt_abc',
        accuracy_rating: r,
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('BIZ-07: rechaza accuracy_rating decimal (3.5 → 400, no 500)', () => {
    // Antes de BIZ-07, el check manual `typeof === 'number'` aceptaba
    // 3.5, pero el CHECK de DB lo rechazaba con 500. Ahora el schema
    // con `.int()` lo rechaza en la frontera con 400.
    const parsed = FeedbackBodySchema.safeParse({
      reportId: 'rpt_abc',
      accuracy_rating: 3.5,
    })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues[0]?.path).toEqual(['accuracy_rating'])
  })

  it('rechaza accuracy_rating fuera del rango 1..5', () => {
    expect(
      FeedbackBodySchema.safeParse({ reportId: 'r', accuracy_rating: 0 }).success
    ).toBe(false)
    expect(
      FeedbackBodySchema.safeParse({ reportId: 'r', accuracy_rating: 6 }).success
    ).toBe(false)
    expect(
      FeedbackBodySchema.safeParse({ reportId: 'r', accuracy_rating: -1 }).success
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  AlertRuleBodySchema — allowlists + threshold finito                */
/* ------------------------------------------------------------------ */

describe('AlertRuleBodySchema', () => {
  it('acepta una regla válida', () => {
    const parsed = AlertRuleBodySchema.safeParse({
      name: 'Caja descuadrada',
      metric: 'cash_discrepancy',
      operator: 'gt',
      threshold: 1000,
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.name).toBe('Caja descuadrada')
  })

  it('trimea el nombre (zod .trim() en el schema)', () => {
    const parsed = AlertRuleBodySchema.safeParse({
      name: '   Alerta con espacios   ',
      metric: 'cash_discrepancy',
      operator: 'gt',
      threshold: 1000,
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.name).toBe('Alerta con espacios')
  })

  it('rechaza metric fuera del allowlist', () => {
    const parsed = AlertRuleBodySchema.safeParse({
      name: 'x',
      metric: 'metric-inventada',
      operator: 'gt',
      threshold: 1,
    })
    expect(parsed.success).toBe(false)
  })

  it('rechaza threshold = Infinity (zod .finite())', () => {
    // Infinity llega como `number` y pasaría `typeof === 'number'`, pero
    // el INSERT en DB fallaría con 500. `z.number().finite()` lo pilla.
    const parsed = AlertRuleBodySchema.safeParse({
      name: 'x',
      metric: 'cash_discrepancy',
      operator: 'gt',
      threshold: Number.POSITIVE_INFINITY,
    })
    expect(parsed.success).toBe(false)
  })

  it('rechaza threshold = NaN', () => {
    const parsed = AlertRuleBodySchema.safeParse({
      name: 'x',
      metric: 'cash_discrepancy',
      operator: 'gt',
      threshold: Number.NaN,
    })
    expect(parsed.success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  BugReportBodySchema — trim + max length                            */
/* ------------------------------------------------------------------ */

describe('BugReportBodySchema', () => {
  it('acepta descripción válida', () => {
    const parsed = BugReportBodySchema.safeParse({
      description: 'El gráfico de caja no carga en Safari.',
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza descripción > 2000 chars', () => {
    const parsed = BugReportBodySchema.safeParse({
      description: 'a'.repeat(2001),
    })
    expect(parsed.success).toBe(false)
  })

  it('acepta descripción de exactamente 2000 chars', () => {
    const parsed = BugReportBodySchema.safeParse({
      description: 'a'.repeat(2000),
    })
    expect(parsed.success).toBe(true)
  })
})
