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

## 8. Contactos y escalado

**Nivel 1 — operación diaria:**

| Qué | Quién | Cómo |
|---|---|---|
| Producto + decisiones | Ricard | usual (Slack / móvil) |
| Infra Vercel | Ricard (owner) | dashboard |
| Facturación Anthropic | Ricard (API key owner) | console.anthropic.com |

**Nivel 2 — incidente grave (down \>15 min, pérdida de datos, brecha de seguridad):**

1. Confirmar severidad vía sección 4 (diagnóstico rápido).
2. Avisar a Ricard por canal más rápido disponible (móvil \> Slack \> email).
3. Si el fallo es de un proveedor externo, abrir ticket en su dashboard
   **Y** publicar el incident-number en el canal de incidentes para que
   cualquiera pueda seguir el hilo.
4. Si es brecha de seguridad con datos personales: escalado inmediato a
   legal/GDPR — ver fila de abajo.

**Nivel 3 — proveedores externos (tickets de soporte):**

| Proveedor | Donde abrir ticket | SLA esperado |
|---|---|---|
| Vercel (Pro) | https://vercel.com/help | \<4 h respuesta inicial |
| Supabase (Pro) | https://supabase.com/dashboard/support/new | \<24 h |
| Clerk | https://dashboard.clerk.com/support | \<24 h |
| Anthropic | https://support.anthropic.com | \<24 h |
| Stripe | https://support.stripe.com | \<24 h |

**Nivel 4 — legal / GDPR:**

| Situación | A quién |
|---|---|
| Solicitud de borrado de datos (Art. 17) | Ricard — responder a los 30 días máximo por ley. |
| Solicitud de exportación (Art. 20) | Ricard — usar `scripts/export-user-data.ts` (TODO). |
| Brecha de seguridad con PII | Ricard + **AEPD**: notificar dentro de 72 h si afecta \>250 personas (Art. 33). |
| DPO (Data Protection Officer) | — pendiente de designar. Hasta entonces Ricard es el punto único. |

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

## 10. Rotación de secretos

**Principio:** rotar un secreto significa generar uno nuevo antes de invalidar
el viejo. Nunca invalidar el actual primero — produce downtime. Los pasos
siguientes asumen acceso a Vercel como propietario del proyecto.

**Cadencia recomendada:** cada 90 días para todas las keys de producción, o
inmediatamente ante sospecha de filtración. Registrar cada rotación en el
changelog de este documento (sección final).

### 10.1 Clerk (`CLERK_SECRET_KEY` y `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)

1. Dashboard Clerk → **API Keys** → **+ Create API key**. Copiar la nueva.
2. Vercel → Settings → Environment Variables → editar `CLERK_SECRET_KEY`
   y pegar el valor nuevo. Hacer lo mismo con el publishable key si aplica.
3. Vercel → Deployments → **Redeploy** el último commit de `main`.
4. Smoke test: login en una ventana de incógnito. Si funciona:
5. Volver a Clerk → API Keys → **Revoke** la key antigua.
6. Registrar en el changelog con fecha y el motivo (`scheduled` o
   `compromised`).

**Gotcha:** si revocas la antigua antes de redeploy, todas las sesiones
activas en el SDK server-side fallan hasta que el nuevo build termina
(\~2 min). Por eso el orden es "crear nueva → redeploy → revocar vieja".

### 10.2 `CLERK_WEBHOOK_SECRET`

1. Dashboard Clerk → **Webhooks** → endpoint `https://<app>/api/webhooks/clerk`.
2. Sección **Signing secret** → botón **Rotate**. Clerk pide confirmación.
3. Copiar el nuevo secret, pegarlo en Vercel como `CLERK_WEBHOOK_SECRET`.
4. Redeploy.
5. Dashboard Clerk → ese mismo webhook → **Send test event**. Si responde 200,
   la rotación está correcta. Si responde 401/400, el env var nuevo no llegó al
   deploy — ver logs de Vercel.

### 10.3 Stripe (`STRIPE_SECRET_KEY`)

1. Dashboard Stripe → **Developers** → **API keys** → botón **Roll key** sobre
   `sk_live_...`. Stripe deja ambos válidos 12 h por defecto (suficiente para
   el cutover).
2. Copiar el valor nuevo a Vercel como `STRIPE_SECRET_KEY` → redeploy.
3. Smoke test:
   ```bash
   # Desde un terminal con acceso a la key nueva
   curl -sS https://api.stripe.com/v1/balance -u sk_live_NEW:
   ```
   Debe devolver JSON de balance, no un 401.
4. Si OK, volver al dashboard → la key vieja tiene un botón **Reveal** y otro
   **Expire now** (si no quieres esperar las 12 h de gracia).

### 10.4 Stripe webhook (`STRIPE_WEBHOOK_SECRET`)

1. Dashboard Stripe → **Webhooks** → endpoint de producción → sección
   **Signing secret** → **Roll**. Stripe ofrece período de gracia con ambos
   válidos.
2. Actualizar `STRIPE_WEBHOOK_SECRET` en Vercel → redeploy.
3. Desde el dashboard del webhook, botón **Send test webhook**. Verificar que
   responde 200.
4. Revocar el viejo desde Stripe (botón **Expire previous signing secret**).

### 10.5 Supabase (`SUPABASE_SERVICE_ROLE_KEY`)

**Crítico:** la service_role_key bypasses RLS. Trátala como root.

1. Dashboard Supabase → Settings → **API** → botón **Generate new JWT secret**.
2. Espera a que Supabase regenere `service_role` y `anon` keys automáticamente
   (\~30 s). El proyecto queda en modo degradado durante este tiempo — planificar
   en ventana de bajo tráfico.
3. Copiar la nueva `service_role` y `anon` a Vercel:
   - `SUPABASE_SERVICE_ROLE_KEY` ← nuevo service_role
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← nuevo anon
4. Redeploy.
5. Smoke test: abrir la app, hacer un análisis nuevo extremo-a-extremo.

**Coste del error:** si olvidas redeploy, el backend intenta autenticar con
el jwt viejo y Supabase rechaza todo → 500 en cada API route.

### 10.6 Anthropic (`ANTHROPIC_API_KEY`)

1. Dashboard Anthropic → **API Keys** → **Create key**. Dar un nombre
   descriptivo (ej. `fraud-audit-prod-2026-Q2`).
2. Copiar la key nueva a Vercel como `ANTHROPIC_API_KEY` → redeploy.
3. Smoke test: disparar un análisis nuevo que incluya pasos de AI insights.
   Verificar en Anthropic console que aparece uso asociado a la key nueva.
4. Volver a Dashboard Anthropic → botón **Revoke** sobre la key vieja.

### 10.7 Resend / PostHog / Upstash

Todos siguen el patrón estándar (crear nueva → Vercel → redeploy → revocar
vieja). Para Upstash existe además el ADR-003 en `DECISIONS.md` con detalles
específicos del token rotation.

---

## 11. Backups y restore de Supabase

### 11.1 Qué hay configurado

- **Point-in-Time Recovery (PITR)**: habilitado en el plan Pro de Supabase.
  Retiene cambios granulares (minuto) de los últimos **7 días**.
- **Backups automáticos diarios**: 1/día durante 30 días consecutivos (Pro).
- **Backup manual antes de migraciones grandes**: siempre disparar uno desde
  el dashboard antes de aplicar una migración que toque schemas públicos.

**Dónde verlo:** Dashboard Supabase → Database → **Backups**.

### 11.2 Cómo hacer un restore

**Escenario A: restaurar la base entera a un punto anterior (DROP TABLE accidental, corrupción masiva).**

1. Dashboard Supabase → **Database** → **Backups** → pestaña **Point-in-time**.
2. Seleccionar timestamp exacto (UTC) justo antes del incidente. Supabase te
   muestra los 7 días disponibles.
3. Botón **Start Restore**. Supabase crea un **proyecto nuevo** con los datos
   restaurados — **no sobrescribe el actual**. Tiempo: 5-30 min según tamaño.
4. Una vez listo, comparar una tabla crítica (`users`, `reports`, `credit_ledger`)
   entre el proyecto original y el restaurado para confirmar que el restore
   funcionó.
5. **Cutover:** tres opciones, elegir según gravedad:

   a) **Apuntar la app al proyecto restaurado** (downtime \~5 min):
      - Cambiar `NEXT_PUBLIC_SUPABASE_URL` + `*_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
        en Vercel al proyecto nuevo.
      - Redeploy.

   b) **Copiar tablas específicas al proyecto vivo** (downtime mínimo, riesgo
      de mezclar datos):
      - Usar `pg_dump --table=X` desde el restaurado, luego `pg_restore` al vivo.
      - Sólo tablas que sabes que están corruptas — no toda la base.

   c) **Consultar a soporte Supabase** (nivel 3 escalado) si el incidente es
      complejo (ej. necesitas merge parcial).

**Escenario B: restaurar una sola tabla / un set de filas borradas.**

1. Si el borrado fue hace \<7 días y la tabla tiene PITR, seguir el paso 1
   hasta 3 del escenario A para obtener un proyecto con los datos.
2. Conectarse al proyecto restaurado vía `psql`:
   ```bash
   psql "postgresql://postgres:<pass>@db.<restored-ref>.supabase.co:5432/postgres"
   ```
3. Export de las filas afectadas:
   ```sql
   COPY (SELECT * FROM nombre_tabla WHERE id IN (...)) TO STDOUT WITH CSV HEADER;
   ```
4. Import al proyecto vivo (preferible en una transacción):
   ```sql
   BEGIN;
   COPY nombre_tabla FROM STDIN WITH CSV HEADER;
   -- verificar
   COMMIT;
   ```

### 11.3 Verificación mensual (no omitible)

El primer lunes de cada mes:

1. Dashboard Supabase → Backups → confirmar que el backup de esa mañana
   aparece con estado `Completed` y tamaño razonable (no `0 MB`).
2. Disparar un restore de prueba a un proyecto `fraud-audit-restore-test`
   (free tier sirve). Validar que se monta sin error.
3. Registrar en el changelog con fecha y "PITR verification: OK".

**Por qué:** un backup que nunca se restaura es un backup que puede estar
roto sin que lo sepas. El drill mensual detecta el fallo antes del
incidente real.

---

## 12. Alertas proactivas

Las alertas viven en tres lugares: **Sentry** (errores), **PostHog**
(comportamiento), y **dashboards de proveedores** (quota). La instrumentación
mínima es:

### 12.1 Errores (Sentry)

| Alerta | Condición | A quién |
|---|---|---|
| `analysis_failed spike` | \>10 `analysis_failed` events en 15 min | Ricard (móvil) |
| `auth_error spike` | \>5 `Clerk webhook signature failed` en 1 h | Ricard (móvil) |
| `db_timeout` | cualquier `DatabaseTimeoutError` en prod | Ricard (email) |
| `release regression` | ratio crashes/sesión sube \>2× tras deploy | Ricard (móvil) |

Configuración: Sentry → Alerts → New Alert Rule → conditions arriba →
notification channel = Email + Slack webhook.

### 12.2 Comportamiento (PostHog)

| Alerta | Condición | A quién |
|---|---|---|
| `conversion_drop` | funnel `signup → first_analysis_completed` baja \>30% D/D | Ricard (email) |
| `stripe_failure` | \>3 `stripe_checkout_failed` events en 1 h | Ricard (email) |
| `credit_leak` | \>2 `credit_refund_manual` en 24 h (señal de bug en award) | Ricard (email) |

Configuración: PostHog → Insights → Alerts → Numeric threshold.

### 12.3 Cuotas de proveedores (manual semanal + alertas nativas)

Configurar alertas en los paneles propios de cada proveedor:

| Proveedor | Qué vigilar | Umbral |
|---|---|---|
| Anthropic | Gasto mensual | 80% del budget mensual → email a Ricard. |
| Anthropic | Rate-limit \(tokens/min\) | 90% → PostHog event `anthropic_throttled` |
| Supabase | DB size | 80% del plan Pro (8 GB por defecto) |
| Supabase | Egress | 80% del plan Pro (50 GB/mes por defecto) |
| Vercel | Function execution | 80% del quota mensual |
| Vercel | Bandwidth | 80% del quota mensual |
| Upstash | Redis commands | 80% del quota diario |
| Resend | Emails/mes | 80% del plan |

**Responsable del chequeo manual:** Ricard, cada lunes. La checklist vive en
`scripts/weekly-ops-check.md` (TODO crear).

### 12.4 Uptime (externo al stack)

Recomendado: UptimeRobot gratis contra tres endpoints:

- `https://<prod-domain>/api/healthcheck` (debe responder 200)
- `https://<prod-domain>/login` (debe responder 200)
- `https://<prod-domain>/api/webhooks/clerk` con HEAD (debe responder 405 o 200)

Notificación: SMS + email cuando cualquiera de los 3 falla 2 veces seguidas
(mitiga falsos positivos).

---

## Changelog del runbook

- 2026-04-19: creación inicial (PR #8).
- 2026-04-20: añadidas secciones 10 (rotación de secretos), 11 (backups/restore
  Supabase) y 12 (alertas proactivas); sección 8 expandida con tree de
  escalado y contactos GDPR (PR #8, B10).
