# Fraud Audit — Runbook operativo

Documento vivo para operar el producto en producción. Si algo no
está documentado aquí, añadirlo después de resolver el incidente.

**Audiencia:** cualquier persona con acceso a Vercel + Supabase +
las dashboards de terceros listados abajo. No requiere conocer el
código en profundidad.

---

## 1. Arquitectura en una página

```
┌─────────────────┐    ┌───────────────────────────┐
│  Browser (SPA)  │◀──▶│  Vercel (Next.js 14)      │
│  Next App Dir   │    │  - app/api/*  (API routes)│
└─────────────────┘    │  - app/*      (RSC + UI)  │
         │             │  - instrumentation.ts     │
         │             └────┬─────────┬────────┬───┘
         │                  │         │        │
         ▼                  ▼         ▼        ▼
   ┌──────────┐       ┌──────────┐ ┌──────┐ ┌──────────┐
   │  Clerk   │       │ Supabase │ │Upstash│ │ Inngest  │
   │  (auth)  │       │ (DB+Blob)│ │(Redis)│ │ (queue)  │
   └──────────┘       └──────────┘ └──────┘ └────┬─────┘
                                                  │
                            (workers corren en Vercel, trigger vía
                             webhooks Inngest → /api/inngest)
                                                  │
                                                  ▼
                                      ┌────────────────────┐
                                      │  Anthropic API     │
                                      │  (Claude — AI)     │
                                      └────────────────────┘
                           + Stripe (pagos), Resend (email),
                             PostHog (analytics), Sentry (errores)
```

**Dato:** Supabase Postgres es la source of truth. Todo lo demás
es cache o derived data.

---

## 2. Dashboards y accesos

| Servicio | Dashboard | Qué miro ahí |
|---|---|---|
| Vercel | https://vercel.com/ricardhello/fraud-audit | Deploys, logs, envs |
| Supabase | https://supabase.com/dashboard/project/\<ref\> | DB, Storage, RLS |
| Clerk | https://dashboard.clerk.com | Usuarios, sesiones, webhooks |
| Upstash | https://console.upstash.com | Redis, rate-limit hits |
| Inngest | https://app.inngest.com | Jobs, retries, DLQ |
| Sentry | https://sentry.io (una vez activado) | Errores, releases |
| Stripe | https://dashboard.stripe.com | Pagos, webhooks |
| PostHog | https://eu.posthog.com | Eventos, funnels |
| Resend | https://resend.com/emails | Emails enviados |
| Anthropic | https://console.anthropic.com | Uso, facturación |

---

## 3. Rollback rápido

**Síntoma:** un deploy recién publicado rompió producción.

1. Ir a https://vercel.com/ricardhello/fraud-audit/deployments
2. Encontrar el último deploy VERDE (icono circular verde, commit
   anterior al malo).
3. Menú `⋯` → "Promote to Production".
4. Esperar ~30 s hasta que el dominio apunte al deploy viejo.

**Tiempo estimado:** 1 minuto.

**Después del rollback:**
- Crear issue con el SHA del deploy malo.
- Añadir label `production-incident`.
- Revisar Sentry para ver el error concreto.

---

## 4. Incidentes comunes

### 4.1 "Los usuarios no pueden loguearse"

**Diagnóstico rápido:**

1. **¿Está Clerk abajo?** https://status.clerk.com — si sí, esperar.
2. **¿Cambió algún env var de Clerk en Vercel?**
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` deben
   empezar por `pk_live_` / `sk_live_` en producción.
3. **¿El webhook de Clerk está recibiendo eventos?**
   Dashboard → Webhooks → Deliveries. Si está en rojo, la creación
   de usuarios nuevos no se sincroniza con Supabase → login funciona
   pero el usuario no existe en `users`.

**Fix para el punto 3:**
```bash
# Revisar logs del handler
vercel logs --project fraud-audit --since 1h | grep "clerk/webhook"
```

El endpoint vive en `app/api/webhooks/clerk/route.ts`.

---

### 4.2 "El análisis devuelve 500"

**Diagnóstico:**

1. Abrir Sentry — filtrar por `route: /api/analyze`.
2. Si el error es `Insufficient credits` → es 402, no 500. Usuario ve mensaje correcto.
3. Si el error es `Failed to queue analysis. Please try again.` (500) →
   Inngest está abajo. Comprobar https://status.inngest.com.
4. Si el error es `Database error` (500) → Supabase abajo o RLS mal.
   Comprobar Supabase status + logs.

**Fix inmediato:**
- Vercel deja el report en `status: 'failed'` automáticamente si
  Inngest cae (BUG-API01). El usuario puede reintentar.

---

### 4.3 "Los PDFs tardan 2 minutos en generarse"

**Diagnóstico:**

1. Inngest dashboard → job `report/analyze`.
2. Ver el step que más tarda. Normalmente:
   - Parse CSV: 1-5 s por 100k filas.
   - Análisis AI: 30-60 s (Anthropic).
   - Render PDF: 2-10 s.
3. Si el paso de AI está tardando \>2 min, puede ser throttling de
   Anthropic. Ver https://status.anthropic.com.

**Mitigación:**
- El timeout de la función de Vercel es 300 s. Si se excede,
  el report queda en `processing` para siempre. Hay un cron mensual
  que marca como `failed` los que llevan \>24 h.

---

### 4.4 "Un usuario dice que perdió créditos"

**Diagnóstico:**

1. Pedir al usuario el `reportId` o la URL del informe.
2. Ir a Supabase → tabla `credit_ledger`.
3. `SELECT * FROM credit_ledger WHERE user_id = '<id>' ORDER BY created_at DESC LIMIT 20;`
4. Buscar la transacción `type='analysis'` correspondiente.

**Casos:**
- Si `amount = -1` pero no hay `report_id` asociado → bug. El análisis
  falló después de deducir. Reintegrar manualmente:
  ```sql
  INSERT INTO credit_ledger (user_id, amount, type, reason)
  VALUES ('<user_id>', 1, 'refund', 'Manual refund: analysis failed (ticket #X)');
  ```
- Si `amount = -1` y hay `report_id` que se completó → no es un bug,
  el análisis sí se ejecutó.

---

### 4.5 "Los emails no llegan"

**Diagnóstico:**

1. Resend dashboard → Emails. Ver si aparece el envío.
2. Si no aparece → la app no lo intentó enviar. Revisar lógica en
   `lib/email.ts`. Nota: `email.ts` tiene degradación elegante —
   si `RESEND_API_KEY` no está, la función no lanza error, solo
   loguea.
3. Si aparece pero en estado `bounced` → el email del usuario es
   inválido.
4. Si está `delivered` pero el usuario no lo recibe → carpeta de
   spam. Resend soporta DKIM/SPF — ver dominio en Resend.

---

### 4.6 "El rate limit está bloqueando usuarios legítimos"

**Diagnóstico:**

1. Upstash → Data Browser → ver las claves `fraudaudit:<key>:user:<id>`.
2. Si el usuario legítimo tiene 200 hits en 1 min → probablemente
   reintentos de un botón que rompe loop en el frontend.
3. Ajustar el preset en `lib/rate-limit.ts` → `RATE_LIMITS` →
   redeploy.

**Unblock inmediato:** borrar la clave en Upstash.

---

## 5. Variables de entorno críticas

Lista actualizada en `.env.local.example`. Las que NO pueden faltar
en producción:

| Var | Qué pasa si falta |
|---|---|
| `CLERK_SECRET_KEY` | Auth rota. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Login UI rota. |
| `CLERK_WEBHOOK_SECRET` | Usuarios nuevos no se crean en DB. |
| `SUPABASE_SERVICE_ROLE_KEY` | Todas las API routes devuelven 500. |
| `INNGEST_EVENT_KEY` | Los análisis no se encolan. |
| `INNGEST_SIGNING_KEY` | Inngest no firma webhooks → fallan. |
| `UPSTASH_REDIS_REST_URL` + `*_TOKEN` | Degrada a sin rate limit (peligroso pero no fatal). |
| `SENTRY_DSN` | Errores invisibles. |

Las optional con degradación elegante (si faltan, la app sigue
funcionando en modo reducido):

- `RESEND_API_KEY` → no se envían emails.
- `NEXT_PUBLIC_POSTHOG_KEY` → sin analytics.
- `ANTHROPIC_API_KEY` → los insights AI no se generan, el resto sí.

---

## 6. Métricas a vigilar

En PostHog, crear dashboards con:

1. **Conversion funnel**: `$pageview landing` → `analysis_started` →
   `analysis_completed`.
2. **Error rate**: eventos `analysis_failed` / `analysis_started`.
3. **Pay-to-first-value**: tiempo desde `stripe_checkout_completed`
   hasta `analysis_completed`.

En Sentry (una vez activado):

1. Release health (crashes / user)
2. Apdex
3. Errores nuevos en las últimas 24 h.

---

## 7. Cómo hacer un deploy seguro

1. `main` está protegida — solo via PR.
2. Todo PR dispara preview deploy en Vercel.
3. Abrir la URL del preview y hacer smoke test:
   - Login
   - Subir CSV (usar `fixtures/` si no tienes datos)
   - Iniciar análisis
   - Ver informe (puede tardar hasta 60 s)
4. Si todo OK, merge a `main` → deploy automático a producción.

**Si el preview falla:**
- Vercel logs: `vercel logs <preview-url>`
- Si es un error de typecheck → arreglar y push.
- Si es runtime → comparar con último deploy verde en main.

---

## 8. Contactos

| Qué | Quién | Cómo |
|---|---|---|
| Producto + decisiones | Ricard | usual |
| Infra Vercel | Ricard (owner) | dashboard |
| Facturación Anthropic | Ricard (API key owner) | console.anthropic.com |
| Legal / GDPR | — | pendiente de designar |

---

## 9. Mantenimiento recurrente

| Cada | Qué |
|---|---|
| Semanal | Revisar errores nuevos en Sentry. |
| Semanal | Revisar `credit_ledger` por anomalías (refunds \> threshold). |
| Mensual | Rotar Upstash token (ver DECISIONS.md). |
| Mensual | Revisar Stripe dashboard por chargebacks. |
| Trimestral | Revisar allowlist de CSP en `next.config.js`. |
| Trimestral | Audit de dependencias: `npm audit --production`. |

---

## Changelog del runbook

- 2026-04-19: creación inicial (PR #8).
