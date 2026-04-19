import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerClient } from '@/lib/supabase'
import { MAX_ALERT_RULES_PER_USER } from '@/lib/types/alerts'
import { rateLimit, identifierFromRequest, rateLimitHeaders } from '@/lib/rate-limit'
import { parseJsonBody, AlertRuleBodySchema } from '@/lib/api-validation'

/* ------------------------------------------------------------------ */
/*  GET /api/alerts — List user's alert rules                          */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient()

    // ERR-01: separar 404 "no existe" de 500 "DB rota".
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (alerts GET):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: rules, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch alert rules:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch alerts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ rules: rules ?? [] })
  } catch (err) {
    console.error('Alerts GET error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/alerts — Create a new alert rule                         */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SEC-04: rate limit por usuario.
    const rl = await rateLimit('alerts', identifierFromRequest(req, clerkId))
    // P3 (issue #3): X-RateLimit-* en todas las respuestas.
    const rlHeaders = rateLimitHeaders(rl)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Intenta en unos segundos.' },
        {
          status: 429,
          headers: {
            ...rlHeaders,
            ...(rl.reset
              ? { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) }
              : {}),
          },
        }
      )
    }

    // P2 fix: validación centralizada con zod. Cubre los 4 checks
    // manuales anteriores (required fields, metric allowlist, operator
    // allowlist, threshold finite) en una sola llamada; errores salen
    // como 400 con `issues[]` por campo.
    const parsed = await parseJsonBody(req, AlertRuleBodySchema)
    if (!parsed.success) return parsed.response
    const { name, metric, operator, threshold } = parsed.data

    const supabase = createServerClient()

    // ERR-01: idem GET.
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('DB error fetching user (alerts POST):', userError.message)
      return NextResponse.json({ error: 'Database error' }, { status: 500, headers: rlHeaders })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: rlHeaders })
    }

    // Pre-check: rechaza el caso "usuario ya en el límite" sin malgastar
    // un INSERT. Cierra ~99% de los casos; la ventana de race queda
    // cubierta por el post-check más abajo.
    const { count } = await supabase
      .from('alert_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= MAX_ALERT_RULES_PER_USER) {
      return NextResponse.json(
        { error: `Maximo ${MAX_ALERT_RULES_PER_USER} alertas por usuario` },
        { status: 400, headers: rlHeaders }
      )
    }

    // Create the rule
    const { data: rule, error } = await supabase
      .from('alert_rules')
      .insert({
        user_id: user.id,
        name: name.trim(),
        metric,
        operator,
        threshold,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create alert rule:', error.message)
      return NextResponse.json(
        { error: 'Failed to create alert' },
        { status: 500, headers: rlHeaders }
      )
    }

    // BIZ-08: dos POST concurrentes del mismo usuario pueden ambos leer
    // count=9 y ambos insertar, dejando 11 reglas. Con la restricción
    // actual de "no schema change", la opción atómica (UNIQUE INDEX
    // WHERE position <= 10 o RPC con pg_advisory_xact_lock) no aplica.
    // Compromiso: insertamos, recontamos, y si la cuenta final excede el
    // límite revertimos nuestra propia fila. Cierra la ventana de race
    // más común (double-click UI) sin tocar schema.
    const { count: finalCount } = await supabase
      .from('alert_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((finalCount ?? 0) > MAX_ALERT_RULES_PER_USER) {
      const { error: rollbackError } = await supabase
        .from('alert_rules')
        .delete()
        .eq('id', rule.id)

      if (rollbackError) {
        // El rollback falló — la fila queda. Logueamos para que monitoreo
        // detecte el caso raro de count > MAX persistente. Seguimos
        // devolviendo 400 al cliente (el INSERT fue considerado rechazado).
        console.error(
          'BIZ-08 race rollback failed (orphan alert_rule may persist):',
          rule.id,
          rollbackError.message
        )
      }

      return NextResponse.json(
        { error: `Maximo ${MAX_ALERT_RULES_PER_USER} alertas por usuario` },
        { status: 400, headers: rlHeaders }
      )
    }

    return NextResponse.json({ rule }, { status: 201, headers: rlHeaders })
  } catch (err) {
    console.error('Alerts POST error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
