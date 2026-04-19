import Anthropic from '@anthropic-ai/sdk'
import type { ReportData } from './types/report'
import type { AIInsights } from './types/ai-insights'

const SYSTEM_PROMPT = `Eres un auditor experto en fraude operativo de restaurantes en Espana.
Analiza los datos del informe y genera:
1. Una narrativa ejecutiva en espanol (3-5 parrafos) que explique los hallazgos principales, patrones detectados y riesgos.
2. Recomendaciones priorizadas con acciones concretas.
3. Anomalias detectadas con su severidad.

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "narrative": "string con la narrativa ejecutiva",
  "recommendations": [
    {
      "title": "titulo corto",
      "description": "descripcion detallada de la accion",
      "priority": "critical|high|medium|low",
      "category": "immediate|structural|monitoring"
    }
  ],
  "anomalies": [
    {
      "title": "titulo de la anomalia",
      "description": "que se detecto y por que es relevante",
      "severity": "critical|high|medium|low",
      "affected_area": "area afectada (ej: Caja, Inventario, Facturas)"
    }
  ]
}

Reglas:
- Narrativa en tono profesional pero accesible para gerentes de restaurante
- Maximo 5 recomendaciones, ordenadas por prioridad
- Maximo 5 anomalias
- Si no hay datos suficientes para una seccion, devuelve array vacio
- Los montos en euros, porcentajes con un decimal
- NO incluyas markdown en la narrativa, solo texto plano

REGLAS DE INTEGRIDAD NUMERICA (criticas, no negociables):
- Los calculators (cash_discrepancy, deleted_invoices, deleted_products, waste_analysis, inventory_deviation, correlation, conclusions) son la UNICA fuente de verdad numerica. Sus campos numericos estan pre-calculados de forma deterministica sobre los datos crudos del restaurante.
- NUNCA recalcules, redondees, agregues, promedies ni derives cifras nuevas a partir de los datos. Si un valor no esta en el ReportData, NO lo inventes.
- Cuando cites un numero en la narrativa o en description/title, usa el valor EXACTO que aparece en ReportData (mismos decimales, mismo signo, misma unidad). Ejemplo: si total_discrepancy es 1247.50 EUR, escribe "1247.50 EUR" o "1.247,50 EUR" sin alterar el valor — no "~1.250 EUR", no "aprox. 1.2K".
- Permitido: traducir el numero al formato de lectura espanol (coma decimal, punto de miles). PROHIBIDO: cambiar la magnitud.
- Las comparaciones (%, "mayor que", "x veces") solo son validas si ambos terminos vienen de ReportData. No inferir medias del sector, benchmarks ni estacionalidad si no vienen en el input.
- Si un campo es 0 o null, trata la seccion como "sin datos suficientes" en vez de fabricar una historia.
- Las anomalias SOLO pueden hacer referencia a areas y montos que aparecen en ReportData. No enumerar anomalias plausibles que no esten respaldadas por un calculator.`

// Max characters for the serialized report data sent to Claude.
// ~80k chars ≈ ~20k tokens, well within the 200k context window.
const MAX_PAYLOAD_CHARS = 80_000

/**
 * Generate AI-powered insights from a completed report.
 * Returns null if ANTHROPIC_API_KEY is not configured or on failure.
 * Errors are logged with structured detail for debugging.
 */
export async function generateAIInsights(
  reportData: ReportData
): Promise<AIInsights | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    console.warn('[AI Insights] ANTHROPIC_API_KEY is not set — skipping generation')
    return null
  }

  try {
    // INT-02: el SDK oficial deja el timeout abierto por defecto (~10 min),
    // lo que puede bloquear el step de Inngest si la API tiene latencia alta.
    // 60s es holgado para 2000 max_tokens con un prompt de ~80k chars.
    const client = new Anthropic({ apiKey, timeout: 60_000 })

    // Serialize and truncate if needed to avoid exceeding context limits
    let serialized = JSON.stringify(reportData, null, 2)
    if (serialized.length > MAX_PAYLOAD_CHARS) {
      console.warn(
        `[AI Insights] Report data too large (${serialized.length} chars), truncating to ${MAX_PAYLOAD_CHARS}`
      )
      serialized = serialized.slice(0, MAX_PAYLOAD_CHARS) + '\n... [truncado por tamaño]'
    }

    const userPrompt = `Analiza este informe de fraude operativo y genera insights:\n\n${serialized}`

    console.log(
      `[AI Insights] Calling Claude API (model: claude-sonnet-4-20250514, payload: ${serialized.length} chars)`
    )

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: SYSTEM_PROMPT,
    })

    // Extract text from the response
    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[AI Insights] No text block in response:', JSON.stringify(response.content))
      throw new Error('No text response from Claude')
    }

    // Parse JSON response — handle potential markdown code blocks
    let jsonText = textBlock.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(jsonText) as {
      narrative: string
      recommendations: AIInsights['recommendations']
      anomalies: AIInsights['anomalies']
    }

    // Validate required fields
    if (!parsed.narrative || !Array.isArray(parsed.recommendations) || !Array.isArray(parsed.anomalies)) {
      console.error('[AI Insights] Invalid structure:', Object.keys(parsed))
      throw new Error('Invalid AI response structure')
    }

    const insights: AIInsights = {
      narrative: parsed.narrative,
      recommendations: parsed.recommendations.slice(0, 5),
      anomalies: parsed.anomalies.slice(0, 5),
      generated_at: new Date().toISOString(),
    }

    console.log('[AI Insights] Generated successfully')
    return insights
  } catch (error: unknown) {
    // Structured error logging — surface the actual failure reason
    const errObj = error as Record<string, unknown>
    const statusCode = errObj?.status ?? errObj?.statusCode ?? 'N/A'
    const nestedError = errObj?.error as Record<string, unknown> | undefined
    const errType = nestedError?.type ?? errObj?.name ?? 'Unknown'
    const errMessage = errObj?.message ?? String(error)

    console.error(
      `[AI Insights] FAILED — status: ${statusCode}, type: ${errType}, message: ${errMessage}`
    )

    // Log full error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('[AI Insights] Full error:', error)
    }

    return null
  }
}
