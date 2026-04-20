# Load tests (k6)

Scripts de carga mínimos con [Grafana k6](https://k6.io/). Pensados para:

1. **Baseline** — detectar regresiones de rendimiento tras un deploy.
2. **Defensa** — validar que los paths 401/429 son baratos y el servidor no cae bajo adversarial load.
3. **Capacity check manual** — estimar cuándo escalar (ej. ¿aguanta 10 VUs el plan actual de Vercel + Supabase?).

## Scripts

| Script | Target | Carga | Requisitos |
|--------|--------|-------|------------|
| `smoke.js` | `/`, `/login` | 5 VU × 30 s | Ninguno — público |
| `rate-limit.js` | `POST /api/upload` sin token | 1 → 50 VU spike × 50 s | Ninguno — valida 401/429 |
| `dashboard-auth.js` | `GET /api/dashboard` | 10 VU × 60 s | `CLERK_SESSION_COOKIE` |

**No incluidos** (intencionalmente):

- `POST /api/analyze` load test — quemaría créditos reales y $ de Anthropic. Si se necesita, montar mock de Anthropic primero.
- `POST /api/upload` autenticado — subida real de CSV generaría cientos de filas de test que ensucian Supabase. Requiere entorno `development` separado con DB efímera.

## Instalación de k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k && \
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 && \
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && \
  sudo apt update && sudo apt install k6

# Docker (sin instalación local)
docker run --rm -i --network=host -e BASE_URL=http://localhost:3000 grafana/k6 run - <loadtest/smoke.js
```

## Ejecución

### Contra dev local

```bash
# 1. Arrancar la app
npm run dev

# 2. En otra terminal
BASE_URL=http://localhost:3000 k6 run loadtest/smoke.js
BASE_URL=http://localhost:3000 k6 run loadtest/rate-limit.js
```

### Contra preview de Vercel

```bash
BASE_URL=https://fraud-audit-git-<branch>.vercel.app k6 run loadtest/smoke.js
```

### Contra producción (solo baseline, NUNCA spike)

```bash
# Sólo smoke.js — carga ligera, indetectable para usuarios reales.
# NO correr rate-limit.js en prod (cuenta contra cuotas Upstash reales).
BASE_URL=https://fraudaudit.com k6 run loadtest/smoke.js
```

### Con credenciales (dashboard-auth)

```bash
# 1. Login en la app en modo development
# 2. DevTools → Application → Cookies → copia el valor de "__session"
export CLERK_SESSION_COOKIE="ey..."
BASE_URL=http://localhost:3000 k6 run loadtest/dashboard-auth.js
```

## Thresholds (qué es "pasa")

Cada script define sus propios umbrales. Si un umbral falla, k6 sale con código no cero, útil para CI.

| Métrica | Límite | Por qué |
|---------|--------|---------|
| `http_req_duration p95` (smoke) | < 500 ms | SSR de Next debe ser rápido |
| `http_req_duration p99` (rate-limit) | < 300 ms | Path 401 debe ser barato |
| `http_req_duration p95` (dashboard-auth) | < 800 ms | auth + 1-2 consultas Supabase |
| `http_req_failed rate` | < 1 % | Tolerancia a blips transitorios |

Si un umbral falla consistentemente, investigar antes de subirlo. "Relajar el threshold" es bug debt.

## Integración CI (futuro)

Este scaffold no incluye workflow de GitHub Actions. La forma recomendada:

```yaml
# .github/workflows/loadtest.yml
on: workflow_dispatch
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: loadtest/smoke.js
        env:
          BASE_URL: ${{ secrets.PREVIEW_URL }}
```

Se ejecutaría manualmente (`workflow_dispatch`) para no saturar CI en cada PR.
