# Estado de los findings de auditoría QA

**Última actualización:** 2026-04-19 (BIZ-01 resuelto — opción 2 aplicada)
**Alcance:** 64 findings (31 backend + 33 frontend) de las auditorías QA
del 2026-03-28.

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Cerrado: fix commiteado y verificable |
| 🟡 | Abierto: pendiente de arreglo en código |
| 🔵 | Requiere infra: acción fuera del código (config externa, rotación, decisión de negocio) |
| 🟣 | No aplica / descartado: obsoleto, ya no reproduce, o fuera de alcance |
| ❔ | Estado incierto: requiere verificación puntual en código |

## Fuentes

- `docs/audits/2026-03-28-backend-audit.md` — auditoría backend (31 findings)
- `docs/audits/2026-03-28-frontend-audit.md` — auditoría frontend (33 findings)
- `DECISIONS.md` — sprint de 33 bugs / 14 tareas (2026-04-10)
- commits en `main` desde `2026-03-28`

---

## Backend (31 findings)

### Seguridad (SEC)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| SEC-01 | 🔴 CRIT | `isDemo` bypass: saltar cobro de créditos | ✅ | `2d13334` — límite server-side de 1 demo/usuario |
| SEC-02 | 🟠 HIGH | Sin validación de `posConnector`/`inventoryConnector` | ✅ | `3d333d7` — type guards + allowlist en analyze/upload |
| SEC-03 | 🟠 HIGH | Sin límite de tamaño en uploads | ✅ | `4fa4bd5` + `58b44c0` — validación 50MB client+API |
| SEC-04 | 🟠 HIGH | Sin rate limiting en ningún endpoint | ✅ | **esta PR (Cubo 2)** — `lib/rate-limit.ts` con `@upstash/ratelimit` aplicado a upload/analyze/feedback/alerts/bug-report. Fail-open + graceful degradation sin env vars. Activar en prod con `UPSTASH_REDIS_REST_URL`+`_TOKEN` |
| SEC-05 | 🟡 MED | Stripe webhook: no verifica `payment_status` | ✅ | `3d333d7` — skip si `payment_status !== 'paid'` |
| SEC-06 | 🟡 MED | Sin headers de seguridad HTTP | ✅ | `3d333d7` — `next.config.js` `headers()` con XFO/nosniff/Referrer/Permissions |
| SEC-07 | 🟡 MED | RLS en Storage bucket no visible/verificado | ✅ | **esta PR (Cubo 2)** — verificado via Supabase MCP: bucket `uploads` privado, RLS enabled en `storage.objects` con 0 policies = default-deny para anon/authenticated. Solo service-role (server) accede |

### Lógica de negocio (BIZ)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| BIZ-01 | 🟠 HIGH | Umbrales inconsistentes `cash-discrepancy` vs `conclusions` | ✅ | **esta PR** — unificado a 1000€ (opción 2, decisión de usuario): `CRITICAL_SHORTAGE_THRESHOLD` en `cash-discrepancy.ts` pasa de 500 → 1000 para coincidir con `CASH_CRITICAL_THRESHOLD` de `conclusions.ts`. Test de regresión nuevo para la zona gris 500-1000€ |
| BIZ-02 | 🟠 HIGH | Crédito deducido pero análisis no ejecutado si Inngest falla | ✅ | INN-01 cubre el mismo caso (onFailure handler) |
| BIZ-03 | 🟠 HIGH | Inngest sin handler de fallo: reportes zombies | ✅ | INN-01 `onFailure` + `fix: extend AI insights grace period` `63edd6e` |
| BIZ-04 | 🟡 MED | Waste-analysis underreporting con datos vacíos | ❔ | Verificar si la guard se añadió en `a93800d`/`a142e35` |
| BIZ-05 | 🟡 MED | Crash en `conclusions.ts` con `by_local[0]` vacío | ✅ | `6e16e24` — null check en SummaryTab + guards similares |
| BIZ-06 | 🟡 MED | Correlation: inventory score constante entre locales | ✅ | `2c0b15c` — score inventario por local deshabilitado |
| BIZ-07 | 🟡 MED | `feedback/route.ts`: `accuracy_rating` sin rango | ✅ | `8f07780` (NM-04) + `3d333d7` — refuerzo con `Number.isInteger` |
| BIZ-08 | 🟡 MED | `alerts/route.ts`: race en límite de 10 reglas | ✅ | **esta PR (Cubo 2)** — post-insert verification + self-rollback. No atómico (restricción "no schema change" descarta UNIQUE INDEX / RPC con `pg_advisory_xact_lock`) pero cierra la ventana de race común (double-click UI) |
| BIZ-09 | 🟢 LOW | `inventory-deviation.ts`: absolute values ocultan dirección | ✅ | `2c0b15c` — `net_deviation` añadido |

### Inngest jobs (INN)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| INN-01 | 🟠 HIGH | Sin `onFailure` handler: créditos perdidos | ✅ | Sprint QA — onFailure implementado |
| INN-02 | 🟡 MED | Paso 7: N queries secuenciales para `last_triggered_at` | ✅ | `3d333d7` — batch `UPDATE ... .in('id', triggeredIds)` |
| INN-03 | 🟡 MED | Paso 5: analytics dentro del step causa doble marcado | ✅ | **esta PR** — analytics separado en `track-analysis-completed` step |
| INN-04 | 🟢 LOW | Paso 1 `update-status-processing` redundante | ✅ | `3d333d7` — step eliminado, renumerados 1..7 |

### Integraciones externas (INT)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| INT-01 | 🟠 HIGH | Claude API: truncación JSON produce payload inválido | ✅ | `519537a` — AI insights payload truncation |
| INT-02 | 🟡 MED | Claude API: sin timeout configurado | ✅ | `3d333d7` — `new Anthropic({ timeout: 60_000 })` |
| INT-03 | 🟡 MED | Resend: FROM address es sandbox | ✅ | **esta PR (Cubo 2)** — FROM configurable vía `RESEND_FROM` env var. Code ready; acción pendiente de usuario: verificar dominio en resend.com/domains + setear env var en Vercel |
| INT-04 | 🟢 LOW | Stripe: `listLineItems` antes del check de duplicados | ✅ | `3d333d7` — pre-check DB por `reference_id` |

### Performance (PERF)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| PERF-01 | 🟠 HIGH | Upload: archivo completo en memoria sin límite (OOM) | ✅ | `58b44c0` — límite 50MB previene OOM |
| PERF-02 | 🟡 MED | PapaParse sin límite de filas | ✅ | **esta PR (Cubo 1)** — `UPLOAD_MAX_ROWS=500_000` en `/api/upload` tras `detectVolume`, 413 con cleanup de Storage |
| PERF-03 | 🟡 MED | `canEarnReward` hace query completa sin LIMIT | ✅ | `3d333d7` — `count: 'exact', head: true` |

### Error handling (ERR)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| ERR-01 | 🟠 HIGH | Routes no destructuran el error de Supabase | ✅ | **esta PR** — barrido en 12 routes: 500 si `error.code !== 'PGRST116'`, 404 si no hay fila |
| ERR-02 | 🟡 MED | `feedback/route.ts`: feedback guardado pero 500 si crédito falla | ✅ | **esta PR (Cubo 1)** — try/catch alrededor de `awardCredit` + analytics; tras el insert, errores posteriores loguean pero devuelven 200 |
| ERR-03 | 🟡 MED | `console.log`/`console.error` en producción | 🟡 | Pendiente — migrar a logger estructurado |
| ERR-04 | 🟢 LOW | `bug-report/route.ts`: silencia errores de crédito | ✅ | Ya cerrado — `catch` actual sí loguea con `console.error` |

---

## Frontend (33 findings)

| ID | Sev | Título | Estado | Ref. |
|---|---|---|---|---|
| AUDIT-001 | 🟡 MED | Tab navigation sin roles ARIA | 🟡 | Pendiente — accesibilidad |
| AUDIT-002 | 🟢 LOW | Emojis en títulos sin `aria-hidden` | 🟡 | Pendiente — accesibilidad trivial |
| AUDIT-003 | 🟡 MED | Botón PDF sin indicador de carga | 🟡 | Pendiente |
| AUDIT-004 | 🟡 MED | Botón borrar alerta sin confirmación | ✅ | `58b44c0` — confirmación de borrado |
| AUDIT-005 | 🟢 LOW | Botón eliminar alerta sin `aria-label` | 🟡 | Pendiente |
| AUDIT-006 | 🟡 MED | Processing page pública sin auto-refresh | 🟡 | Pendiente |
| AUDIT-007 | 🟡 MED | Slug interno expuesto en vista pública de error | 🟡 | Pendiente |
| AUDIT-008 | 🔴 CRIT | Race condition crítico en modo demo (stale closure) | ✅ | `4984697` — race condition demo |
| AUDIT-009 | 🟠 HIGH | Múltiples fetches sin AbortController (memory leaks) | ✅ | `4b4e095` — AbortController en todos los useEffect |
| AUDIT-010 | 🟢 LOW | Keys con índice en listas reordenables | 🟡 | Pendiente |
| AUDIT-011 | 🟡 MED | Tipo `any` explícito en componentes | 🟡 | Pendiente — refactor tipado |
| AUDIT-012 | 🟠 HIGH | Sin error boundaries en vista de informe | ✅ | `6e16e24` — `TabErrorBoundary` + **FASE 3.1** de esta PR refuerza con `error.tsx` |
| AUDIT-013 | 🟡 MED | Processing page sin timeout máximo de polling | ✅ | `c23dc82` — 5-min polling timeout |
| AUDIT-014 | 🟡 MED | Sin página 404 personalizada | 🟡 | **fix en esta PR (FASE 3.2)** — `global-error.tsx` |
| AUDIT-015 | 🟢 LOW | Metadatos de página faltantes en sub-rutas | 🟡 | Pendiente |
| AUDIT-016 | 🟢 LOW | Deep link a tab del informe no funciona | 🟡 | Pendiente |
| AUDIT-017 | 🟡 MED | Charts sin estado vacío cuando no hay datos | ✅ | `InventoryTab.tsx` y siblings — guard `if (length === 0)` |
| AUDIT-018 | 🟢 LOW | Tooltip del Scatter tipado como `any` | 🟡 | Pendiente |
| AUDIT-019 | 🟢 LOW | YAxis de CashTab sin símbolo de moneda | 🟡 | Pendiente |
| AUDIT-020 | 🟡 MED | PDF sin gráficos/visualizaciones | 🟡 | Pendiente — tarea grande |
| AUDIT-021 | 🟡 MED | Sin validación de tamaño máximo de archivo | ✅ | `58b44c0` — validación upload (ver SEC-03) |
| AUDIT-022 | 🟡 MED | Sin validación del threshold en AlertRuleModal | ✅ | `ac205ea` (NH-04) — reject Infinity/-Infinity |
| AUDIT-023 | 🟢 LOW | Input de nombre restaurante sin `maxLength` | 🟡 | Pendiente |
| AUDIT-024 | 🟢 LOW | Sin feedback de progreso en subida | 🟡 | Pendiente |
| AUDIT-025 | 🟠 HIGH | Race condition en comparación de informes | ✅ | `4984697` + `6e16e24` (stale closure) |
| AUDIT-026 | 🟡 MED | Fallback incorrecto en fetchBalance de upload | ✅ | `e95da1a` — remove misleading 100-credit fallback |
| AUDIT-027 | 🟠 HIGH | Sin manejo de sesión expirada en fetches | ✅ | `cfe4fec` — redirect a login en 401 + `authedFetch` wrapper |
| AUDIT-028 | 🟢 LOW | Selección de plan sin estado de carga | 🟡 | Pendiente |
| AUDIT-029 | 🟢 LOW | Sin `React.memo` en componentes de lista costosos | 🟡 | Pendiente — optimización performance |
| AUDIT-030 | 🟢 LOW | Librería `xlsx` importada completa | 🟡 | Pendiente — considerar `xlsx-populate` o lazy import |
| AUDIT-031 | 🟢 LOW | Sin lazy loading en tabs del informe | 🟡 | Pendiente — `next/dynamic` |
| AUDIT-032 | 🟢 LOW | Formatos de fecha inconsistentes | 🟡 | Pendiente |
| AUDIT-033 | 🟢 LOW | Texto hardcodeado en es sin i18n | 🟡 | Pendiente — próximo hito del roadmap |

---

## Resumen agregado

| Estado | Backend | Frontend | Total |
|---|---|---|---|
| ✅ Cerrado | 29 | 11 | **40** |
| 🟡 Abierto | 1 | 22 | **23** |
| 🔵 Requiere infra | 0 | 0 | **0** |
| ❔ Incierto | 1 | 0 | **1** |
| 🟣 No aplica | 0 | 0 | **0** |
| **TOTAL** | **31** | **33** | **64** |

## Plan para esta PR (`hardening/phase-2-3`)

Cerrado hasta ahora en la rama:

- ✅ **SEC-02** (FASE 2.2) — allowlist de conectores (`3d333d7`).
- ✅ **SEC-05, SEC-06, INN-02, INN-04, INT-02, INT-04, PERF-03** (FASE 2.3) — 7 fixes (`3d333d7`).
- ✅ **BIZ-07** — refuerzo con `Number.isInteger` (`3d333d7`).
- ✅ **ERR-04** — verificado ya cerrado en `catch` actual del bug-report.
- ✅ **INN-03** — analytics extraído a su propio step (`track-analysis-completed`) para que retries del UPDATE no reenvíen el evento.
- ✅ **ERR-01** — barrido en 12 routes: discriminación `PGRST116` (404 "no rows") vs otros codes (500 "DB rota").
- ✅ **ERR-02** (Cubo 1) — `feedback/route.ts` reordenado: el insert del feedback es el punto de no retorno; fallos posteriores de crédito/analytics loguean pero devuelven 200 con `creditAwarded:false`.
- ✅ **PERF-02** (Cubo 1) — `UPLOAD_MAX_ROWS=500_000` enforzado en `/api/upload` tras `detectVolume`, con cleanup de Storage y 413 explícito. Test en `__tests__/volume-detector.test.ts`.
- ✅ **SEC-07** (Cubo 2) — verificado via Supabase MCP que la config actual es default-deny (bucket privado, RLS enabled, 0 policies → solo service-role accede). No requiere cambio de código; solo documentación del estado.
- ✅ **BIZ-08** (Cubo 2) — `alerts/route.ts` POST añade post-insert verification + self-rollback para cerrar la ventana de race común sin tocar schema.
- ✅ **SEC-04** (Cubo 2) — nuevo `lib/rate-limit.ts` con `@upstash/ratelimit` en 5 routes (upload/analyze/feedback/alerts/bug-report). Presets por familia. Fail-open + graceful degradation si Upstash no está configurado. 9 nuevos tests.
- ✅ **INT-03** (Cubo 2) — `lib/email.ts` lee `RESEND_FROM` de entorno; warn-once si se queda en sandbox. Acción pendiente del usuario: verificar dominio en Resend Dashboard + setear env var en Vercel.
- ✅ **BIZ-01** — umbral crítico de caja unificado a 1000€ por decisión de usuario (opción 2). Un descuadre entre 200-1000€ ahora es "ALERTA" moderada y uno > 1000€ es "CRÍTICA", coherente con `conclusions.ts`. 1 test nuevo de regresión para la zona gris.

Pendiente en la rama:

- **AUDIT-012 refuerzo** + **AUDIT-014** (FASE 3.1, 3.2) — error boundaries de ruta.
- **FASE 3.3** — edge-case tests (n<4 correlation, empty states, guard 50MB).

Finding abierto con restricción explícita "no tocar calculators":

- ❔ **BIZ-04** (waste-analysis underreporting con datos vacíos) — verificado **abierto** (`lib/calculators/waste-analysis.ts:78` sin guard de datos). Deferido: el usuario pidió no tocar calculators en esta PR.

Post-PR, quedan 23 findings abiertos. El resumen es:

- **Frontend (22)**: todos de accesibilidad/UX (no críticos para producción).
- **Backend (1)**: **ERR-03** (migración a logger estructurado — tamaño suficiente para su propia PR).
- **Incierto (1)**: **BIZ-04** — deferido por la restricción "no tocar calculators".

Con BIZ-01 resuelto, no queda **ningún finding backend** crítico o high
que requiera código. Los únicos bloqueadores para activar todo en
producción son provisiones externas:

- **Upstash Redis** (activa SEC-04): crear instancia + setear
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` en Vercel.
- **Resend domain** (activa INT-03): verificar dominio en resend.com +
  setear `RESEND_FROM` en Vercel.

El código ya está listo para ambos; solo requiere provisión externa.
