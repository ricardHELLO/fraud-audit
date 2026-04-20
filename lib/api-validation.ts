/**
 * Módulo centralizado de validación de payloads para las rutas `app/api/*`.
 *
 * Motivación (fix P2):
 *   Antes, cada ruta llamaba `await req.json()` sin proteger, y luego
 *   destructuraba el cuerpo con comprobaciones manuales. Dos fallos típicos:
 *
 *     1. Si el cuerpo no era JSON válido → throw → outer catch → HTTP 500
 *        (cuando el error real era 400 "malformed body").
 *     2. Si el cuerpo era válido pero con tipos sutiles mal (`isDemo: "true"`
 *        como string en vez de boolean), los checks manuales no lo pillaban
 *        y llegaba al INSERT de Supabase, que fallaba con 500 lejos del
 *        origen.
 *
 *   Unificamos el punto de entrada: `parseJsonBody(req, Schema)`. Los
 *   schemas son zod, el handler solo ve `{ success: true, data }` o
 *   `{ success: false, response }` — cero posibilidad de throw que
 *   escape al outer catch.
 *
 * Contrato de la respuesta 400:
 *   {
 *     "error":   "Cuerpo de petición inválido",            // string humano
 *     "issues":  [{ "path": "posUploadId", "message": "Required" }]
 *   }
 *
 *   - `error` es el mismo shape que el resto de rutas (frontend hace
 *     `data.error || 'fallback'` y no se rompe).
 *   - `issues[]` es aditivo: clientes que no lo conocen lo ignoran;
 *     clientes que lo usen (formularios) pueden pintar errores por
 *     campo sin adivinar qué falló.
 *
 *   Los mensajes de zod van en inglés por defecto (es el contrato de la
 *   librería); el texto de `error` va en español para emparejar con el
 *   resto de mensajes de la app. Si algún día queremos i18n, centralizar
 *   aquí es trivial.
 */

import { NextResponse } from 'next/server'
import { z, type ZodError, type ZodTypeAny } from 'zod'
import {
  POS_CONNECTOR_IDS,
  INVENTORY_CONNECTOR_IDS,
} from '@/lib/types/connectors'
import {
  VALID_METRICS,
  VALID_OPERATORS,
  type AlertMetric,
  type AlertOperator,
} from '@/lib/types/alerts'

/* ------------------------------------------------------------------ */
/*  Shape de la respuesta 400 cuando la validación falla               */
/* ------------------------------------------------------------------ */

export interface ZodIssueDTO {
  /** Dot-path al campo inválido dentro del body, o `(root)` si aplica al objeto entero. */
  path: string
  /** Mensaje de zod (inglés). Orientado a devs, no a usuario final. */
  message: string
}

export interface ValidationErrorBody {
  error: string
  issues: ZodIssueDTO[]
}

function zodIssuesToDTO(error: ZodError): ZodIssueDTO[] {
  return error.issues.map((i) => ({
    path: i.path.map(String).join('.') || '(root)',
    message: i.message,
  }))
}

/* ------------------------------------------------------------------ */
/*  Helper runtime — parsea y valida el body o devuelve un 400 listo   */
/* ------------------------------------------------------------------ */

/**
 * Lee el body JSON y lo valida contra el schema de zod.
 *
 * Retorna un discriminated union para obligar al handler a distinguir
 * éxito de fallo:
 *
 *   const parsed = await parseJsonBody(req, AnalyzeBodySchema)
 *   if (!parsed.success) return parsed.response
 *   const { posUploadId, ... } = parsed.data   // ← tipado ya inferido por zod
 *
 * Nunca lanza. Si `req.json()` throwea (body no-JSON), se convierte en
 * un 400 limpio con `issues: []` (no hay path al que apuntar cuando el
 * parser de JSON rompe antes de llegar al schema).
 */
export async function parseJsonBody<T extends ZodTypeAny>(
  req: Request,
  schema: T
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; response: NextResponse<ValidationErrorBody> }
> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {
      success: false,
      response: NextResponse.json<ValidationErrorBody>(
        {
          error: 'Cuerpo de petición inválido (JSON malformado)',
          issues: [],
        },
        { status: 400 }
      ),
    }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json<ValidationErrorBody>(
        {
          error: 'Cuerpo de petición inválido',
          issues: zodIssuesToDTO(parsed.error),
        },
        { status: 400 }
      ),
    }
  }

  return { success: true, data: parsed.data }
}

/* ------------------------------------------------------------------ */
/*  Schemas por ruta                                                   */
/* ------------------------------------------------------------------ */

/**
 * POST /api/analyze
 *
 * `posUploadId` + `posConnector` son obligatorios. El resto es opcional;
 * `inventoryConnector` puede venir `null` explícito (el frontend lo manda
 * así cuando el usuario no seleccionó conector de inventario).
 */
export const AnalyzeBodySchema = z.object({
  posUploadId: z.string().min(1, 'posUploadId is required'),
  inventoryUploadId: z.string().min(1).nullable().optional(),
  posConnector: z.enum(
    [...POS_CONNECTOR_IDS] as [string, ...string[]],
    { errorMap: () => ({ message: `Must be one of: ${POS_CONNECTOR_IDS.join(', ')}` }) }
  ),
  inventoryConnector: z
    .enum(
      [...INVENTORY_CONNECTOR_IDS] as [string, ...string[]],
      { errorMap: () => ({ message: `Must be one of: ${INVENTORY_CONNECTOR_IDS.join(', ')}` }) }
    )
    .nullable()
    .optional(),
  restaurantName: z.string().trim().max(200).nullable().optional(),
  isDemo: z.boolean().optional(),
})
export type AnalyzeBody = z.infer<typeof AnalyzeBodySchema>

/**
 * POST /api/feedback
 *
 * `accuracy_rating` debe ser entero 1..5 (constraint CHECK en DB). El
 * resto son comentarios opcionales con tope de longitud para evitar
 * abuso de espacio en DB.
 */
export const FeedbackBodySchema = z.object({
  reportId: z.string().min(1, 'reportId is required'),
  accuracy_rating: z
    .number()
    .int('accuracy_rating must be an integer')
    .min(1)
    .max(5),
  most_useful_section: z.string().trim().max(500).nullable().optional(),
  missing_data: z.string().trim().max(1000).nullable().optional(),
  would_share: z.boolean().nullable().optional(),
  would_share_reason: z.string().trim().max(1000).nullable().optional(),
  general_comments: z.string().trim().max(2000).nullable().optional(),
})
export type FeedbackBody = z.infer<typeof FeedbackBodySchema>

/**
 * POST /api/alerts
 *
 * `threshold` acepta cualquier `number` finito (excluye NaN, +Inf, -Inf).
 * `name` se trimea y va de 1..100 chars.
 */
export const AlertRuleBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  metric: z.enum(VALID_METRICS as [AlertMetric, ...AlertMetric[]], {
    errorMap: () => ({ message: `Must be one of: ${VALID_METRICS.join(', ')}` }),
  }),
  operator: z.enum(VALID_OPERATORS as [AlertOperator, ...AlertOperator[]], {
    errorMap: () => ({ message: `Must be one of: ${VALID_OPERATORS.join(', ')}` }),
  }),
  threshold: z.number().finite('threshold must be a valid finite number'),
})
export type AlertRuleBody = z.infer<typeof AlertRuleBodySchema>

/**
 * POST /api/bug-report
 *
 * 1..2000 chars tras trim (anti-spam + protección contra blobs gigantes).
 */
export const BugReportBodySchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'description is required')
    .max(2000, 'description must be 2000 characters or less'),
})
export type BugReportBody = z.infer<typeof BugReportBodySchema>
