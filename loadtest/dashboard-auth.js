/* eslint-disable */
/**
 * k6 authenticated load test — GET /api/dashboard.
 *
 * Qué valida:
 *   - El endpoint autenticado más consultado (dashboard) aguanta 10 VUs
 *     durante 1 minuto con p95 < 800 ms.
 *   - Sin errores > 1 %.
 *
 * Requisitos:
 *   Variable de entorno CLERK_SESSION_COOKIE con una cookie de sesión
 *   Clerk válida. Obtén una:
 *     1. Haz login en la app (modo development).
 *     2. DevTools → Application → Cookies → copia el valor de "__session".
 *     3. export CLERK_SESSION_COOKIE="ey..."
 *
 *   Si la variable falta, el test aborta con mensaje claro (no corre a
 *   ciegas ni genera falsos negativos).
 *
 * Uso:
 *   export CLERK_SESSION_COOKIE="ey..."
 *   BASE_URL=http://localhost:3000 k6 run loadtest/dashboard-auth.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { fail } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const SESSION = __ENV.CLERK_SESSION_COOKIE

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    // Dashboard hace auth + 1-2 consultas Supabase. 800 ms p95 deja holgura
    // pero detecta regresiones (N+1, índices perdidos).
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
}

export function setup() {
  if (!SESSION) {
    fail(
      'CLERK_SESSION_COOKIE no definida. Lee loadtest/README.md para instrucciones.'
    )
  }
  return { session: SESSION }
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/dashboard`, {
    headers: {
      Cookie: `__session=${data.session}`,
    },
  })

  check(res, {
    'status es 200': (r) => r.status === 200,
    'respuesta es JSON': (r) =>
      (r.headers['Content-Type'] || '').includes('application/json'),
    'body tiene shape esperado': (r) => {
      try {
        const body = JSON.parse(r.body)
        // dashboard devuelve al menos { user: {...} } o similar
        return typeof body === 'object' && body !== null
      } catch {
        return false
      }
    },
  })

  sleep(1)
}
