/* eslint-disable */
/**
 * k6 rate-limit test — valida que la capa de auth rechaza rápido y el
 * servidor no se colapsa bajo intentos sin credenciales.
 *
 * Qué valida:
 *   - 100 % de requests sin token reciben 401 (NO 500, NO timeout).
 *   - p99 < 300 ms — el path 401 debe ser barato, no llega a tocar Anthropic
 *     ni Supabase writes.
 *   - Spike de 1 → 50 VUs en 10s sin degradar latencia.
 *
 * Pensado como adversarial check: simula un atacante hammering el endpoint
 * más caro (/api/upload) sin token, comprobando que Clerk + rate-limiter
 * de Upstash aguantan sin regresiones.
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 k6 run loadtest/rate-limit.js
 */

import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export const options = {
  // Ramp-up agresivo 1 → 50 VUs en 10s, hold 30s, ramp-down 10s.
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    // Todas las respuestas deben venir bajo 300 ms en p99 — el camino 401
    // debe ser barato (sin DB, sin LLM).
    http_req_duration: ['p(99)<300'],
    // El 100 % de requests DEBEN recibir status 401 o 429 — cualquier otro
    // (incluido 500) es una regresión.
    'checks{tag:expected_status}': ['rate>0.99'],
  },
}

export default function () {
  // POST a /api/upload sin header Authorization.
  // Payload dummy — no debe llegar nunca al parser de CSV porque Clerk corta antes.
  const res = http.post(
    `${BASE_URL}/api/upload`,
    JSON.stringify({ dummy: true }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  )

  check(
    res,
    {
      'rechazado con 401 o 429': (r) => r.status === 401 || r.status === 429,
      'no 500': (r) => r.status !== 500,
    },
    { tag: 'expected_status' }
  )
}
