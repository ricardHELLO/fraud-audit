/* eslint-disable */
/**
 * k6 smoke test — rutas públicas.
 *
 * Qué valida:
 *   - El servidor responde < 500ms p95 sobre landing y /login cuando
 *     hay 5 VUs concurrentes durante 30s.
 *   - Error rate < 1 %.
 *
 * Pensado como baseline rápido para detectar regresiones de TTFB
 * o memory leaks tras despliegues.
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 k6 run loadtest/smoke.js
 *   BASE_URL=https://fraud-audit-git-<branch>.vercel.app k6 run loadtest/smoke.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    // p95 de cualquier request < 500 ms
    http_req_duration: ['p(95)<500'],
    // Menos del 1 % de requests fallidas (status >= 400 o timeout)
    http_req_failed: ['rate<0.01'],
  },
}

export default function () {
  // Mix 70 % landing, 30 % login — representa el embudo típico de visita → conversión.
  const target = Math.random() < 0.7 ? '/' : '/login'
  const res = http.get(`${BASE_URL}${target}`)

  check(res, {
    'status es 200': (r) => r.status === 200,
    'contiene FraudAudit': (r) => r.body && r.body.includes('FraudAudit'),
  })

  // Pausa corta para simular usuario real, no bombardeo síncrono.
  sleep(1)
}
