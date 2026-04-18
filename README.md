# FraudAudit

Plataforma SaaS de deteccion de fraude operativo en restaurantes mediante analisis automatizado de datos de TPV e inventario. Genera informes con 7 modulos de analisis, correlaciones cruzadas e insights generados por IA.

**Stack:** Next.js 14 · React 18 · Supabase · Clerk · Inngest · Stripe · Anthropic Claude · PostHog · Vercel

**Produccion:** https://fraud-audit.vercel.app

---

## Tabla de contenidos

- [Arquitectura general](#arquitectura-general)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Base de datos](#base-de-datos)
- [Pipeline de analisis](#pipeline-de-analisis)
- [Sistema de parsers (conectores)](#sistema-de-parsers-conectores)
- [Inngest: jobs en background](#inngest-jobs-en-background)
- [AI Insights (Claude)](#ai-insights-claude)
- [Autenticacion (Clerk)](#autenticacion-clerk)
- [API Routes](#api-routes)
- [Frontend: paginas y componentes](#frontend-paginas-y-componentes)
- [Sistema de creditos](#sistema-de-creditos)
- [Pagos (Stripe)](#pagos-stripe)
- [Sistema de alertas](#sistema-de-alertas)
- [Emails (Resend)](#emails-resend)
- [Analytics (PostHog)](#analytics-posthog)
- [Despliegue y entorno](#despliegue-y-entorno)
- [Variables de entorno](#variables-de-entorno)
- [Scripts de desarrollo](#scripts-de-desarrollo)
- [Datasets de prueba](#datasets-de-prueba)
- [Decisiones de diseno](#decisiones-de-diseno)
- [Dependencias](#dependencias)
- [Roadmap tecnico](#roadmap-tecnico)

---

## Arquitectura general

```
+-----------------------------------------------------------------+
|                        FRONTEND (Next.js)                       |
|  Landing - Dashboard - Upload - Processing - Informe - Comparar |
+--------------+----------------------------------+---------------+
               | API Routes                       | Server Components
               v                                  v
+--------------------------+    +---------------------------------+
|     Clerk Middleware      |    |       PostHog Analytics         |
|  Auth - Route Protection  |    |  Events - Feature Flags - Funnels|
+--------------+-----------+    +---------------------------------+
               |
               v
+------------------------------------------------------------------+
|                        API LAYER                                 |
|                                                                  |
|  /api/upload      -> Supabase Storage + Volume Detection         |
|  /api/analyze     -> Deducir credito + Trigger Inngest           |
|  /api/dashboard   -> Fetch datos usuario                         |
|  /api/reports/*   -> Status, AI Insights, PDF                    |
|  /api/compare     -> Comparar dos informes                       |
|  /api/alerts      -> CRUD reglas de alerta                       |
|  /api/checkout    -> Stripe Checkout                             |
|  /api/webhooks/*  -> Clerk sync, Stripe confirm                  |
|  /api/feedback    -> Feedback + reward credito                   |
|  /api/inngest     -> Inngest event handler                       |
+----------+------------------------+------------------------------+
           |                        |
           v                        v
+--------------------+  +----------------------------------------------+
|   Supabase (PG)    |  |              Inngest                         |
|                    |  |                                              |
|  users             |  |  Event: report/analyze                       |
|  organizations     |  |                                              |
|  uploads           |  |  Step 1: parse-pos-data                      |
|  reports           |  |  Step 2: parse-inventory-data (opcional)      |
|  credit_txns       |  |  Step 3: generate-report                     |
|  feedback          |  |  Step 4: send-report-email       (f&f)      |
|  referrals         |  |  Step 5: evaluate-alert-rules    (f&f)      |
|  alert_rules       |  |  Step 6: generate-ai-insights    (f&f)      |
|  alert_history     |  |                                              |
|  bug_reports       |  |  (f&f = fire-and-forget, no bloquean)        |
|  connectors        |  +----------------------------------------------+
|                    |
|  Storage: uploads/ |       +----------------------+
+--------------------+       |   Anthropic Claude    |
                             |   claude-sonnet-4     |
                             |   AI Insights en ES   |
                             +----------------------+
```

### Flujo principal

1. **Upload** -- El usuario sube CSV(s) de su TPV/inventario
2. **Volume Detection** -- Se analizan los metadatos del archivo (fechas, locales, filas)
3. **Analyze** -- Se descuenta 1 credito y se lanza un job de Inngest
4. **Parse** -- El parser del conector normaliza el CSV a `NormalizedDataset`
5. **Calculate** -- 7 calculadores ejecutan el analisis de fraude
6. **Persist** -- El informe se guarda en JSONB en Supabase
7. **Notify** -- Email al usuario, evaluacion de alertas, generacion de AI Insights (fire-and-forget)
8. **View** -- El usuario ve el informe con 9 tabs + descarga PDF

---

## Estructura del proyecto

```
fraud-audit/
|-- app/                          # Next.js App Router
|   |-- api/                      # 13 grupos de API routes
|   |-- dashboard/                # Rutas protegidas (Clerk)
|   |   |-- page.tsx              # Dashboard principal
|   |   |-- upload/               # Subida de archivos
|   |   |-- processing/           # Vista de procesamiento
|   |   |-- comparar/             # Comparacion de informes
|   |   +-- settings/             # Configuracion usuario
|   |-- informe/[slug]/           # Vista del informe (tabs)
|   |-- onboarding/               # Seleccion de conectores
|   |-- login/ - signup/          # Auth (Clerk redirect)
|   |-- page.tsx                  # Landing page
|   +-- layout.tsx                # Root layout + providers
|
|-- components/
|   |-- ui/                       # Componentes base (button, card, etc.)
|   |-- dashboard/                # ReportsList, CreditBalance, Alerts, Gamification
|   |-- report/                   # 9 tabs del informe + ReportLayout + Banner
|   |-- upload/                   # FileDropZone, VolumePreview, UpgradePrompt
|   |-- comparison/               # LocalComparison, MetricDelta
|   +-- posthog-provider.tsx      # Analytics wrapper
|
|-- lib/
|   |-- analysis-engine.ts        # Orquestador del pipeline de analisis
|   |-- report-generator.ts       # Persistencia de informes
|   |-- report-comparator.ts      # Comparacion de dos informes
|   |-- ai-insights-generator.ts  # Integracion con Claude API
|   |-- alert-evaluator.ts        # Evaluador de reglas de alerta
|   |-- volume-detector.ts        # Pre-analisis de metadatos CSV
|   |-- credits.ts                # Sistema de creditos (earn/spend/balance)
|   |-- email.ts                  # Wrapper Resend
|   |-- email-templates.ts        # Templates HTML para emails
|   |-- supabase.ts               # Clientes Supabase (browser + server + admin)
|   |-- posthog.ts                # PostHog client-side
|   |-- posthog-server.ts         # PostHog server-side
|   |-- posthog-events.ts         # Definiciones de eventos (browser)
|   |-- posthog-server-events.ts  # Definiciones de eventos (server)
|   |-- env.ts                    # Validacion de env vars
|   |-- utils.ts                  # Utilidades generales
|   |
|   |-- calculators/              # 7 modulos de deteccion de fraude
|   |   |-- cash-discrepancy.ts   # Descuadres de caja
|   |   |-- deleted-invoices.ts   # Facturas anuladas
|   |   |-- deleted-products.ts   # Productos eliminados por fase
|   |   |-- waste-analysis.ts     # Analisis de merma
|   |   |-- inventory-deviation.ts# Desviacion de inventario
|   |   |-- correlation.ts        # Correlaciones cruzadas (Spearman)
|   |   +-- conclusions.ts        # Sintesis de riesgos + recomendaciones
|   |
|   |-- parsers/                  # Normalizadores de CSV por conector
|   |   |-- index.ts              # Registro de parsers
|   |   |-- lastapp.ts            # Last.app (TPV) -- ACTIVO
|   |   |-- tspoonlab.ts          # T-Spoon Lab (Inventario) -- ACTIVO
|   |   |-- glop.ts               # Glop (TPV) -- skeleton
|   |   |-- agora.ts              # Agora (TPV) -- skeleton
|   |   |-- revo.ts               # Revo (TPV) -- skeleton
|   |   |-- prezo.ts              # Prezo (Inventario) -- skeleton
|   |   +-- gstock.ts             # GStock (Inventario) -- skeleton
|   |
|   |-- inngest/
|   |   |-- client.ts             # Inicializacion del cliente Inngest
|   |   +-- functions.ts          # Definicion de jobs background
|   |
|   |-- types/                    # Interfaces TypeScript
|   |   |-- report.ts             # ReportData, Summary, Results
|   |   |-- normalized.ts         # NormalizedDataset (schema comun)
|   |   |-- ai-insights.ts        # AIInsights (respuesta Claude)
|   |   |-- alerts.ts             # AlertRule, AlertHistory
|   |   |-- comparison.ts         # ComparisonResult, MetricDelta
|   |   +-- connectors.ts         # Connector metadata
|   |
|   +-- pdf/
|       +-- report-pdf.tsx        # Template React PDF
|
|-- supabase/
|   +-- migrations/               # 7 migraciones SQL secuenciales
|
|-- scripts/
|   |-- test-determinism.ts       # Test de determinismo del pipeline
|   +-- run-schema.js             # Setup de schema
|
|-- test-data/                    # 6 CSVs de ejemplo para testing
|-- middleware.ts                 # Clerk auth + redirect legacy URLs
|-- next.config.js                # Config Next.js
|-- tailwind.config.ts            # Config Tailwind
|-- tsconfig.json                 # Config TypeScript
+-- package.json                  # Dependencias
```

---

## Base de datos

**Motor:** PostgreSQL via Supabase (hosted)

**Migraciones:** 7 archivos SQL secuenciales en `supabase/migrations/`

**Storage:** Bucket `uploads/` para archivos CSV (organizados por `user_id/timestamp_filename`)

### Diagrama ER

```
+----------------+     +------------------+     +---------------------+
| organizations  |     |     users        |     | credit_transactions |
|----------------|     |------------------|     |---------------------|
| id (PK)        |<----| organization_id  |     | id (PK)             |
| name           |     | id (PK)          |<----| user_id (FK)        |
| slug (UQ)      |     | clerk_id (UQ)    |     | amount (+/-)        |
| created_at     |     | email            |     | reason              |
+----------------+     | name             |     | reference_id        |
                       | credits_balance  |     | created_at          |
                       | referral_code    |     +---------------------+
                       | referred_by      |
                       | created_at       |
                       +--------+---------+
                                |
                 +--------------+------------------+
                 |              |                  |
                 v              v                  v
        +----------------+ +----------------+ +----------------+
        |    uploads     | |    reports     | |   feedback     |
        |----------------| |----------------| |----------------|
        | id (PK)        | | id (PK)        | | id (PK)        |
        | user_id (FK)   | | user_id (FK)   | | user_id (FK)   |
        | org_id (FK)    | | org_id (FK)    | | report_id (FK) |
        | file_name      | | slug (UQ)      | | accuracy 1-5   |
        | file_path      | | status         | | useful_section |
        | connector      | | pos_upload_id  | | credit_awarded |
        | source_cat     | | inv_upload_id  | | created_at     |
        | date_from/to   | | pos_connector  | +----------------+
        | locations      | | inv_connector  |
        | rows_count     | | date_from/to   |
        | credits_req    | | locations[]    |
        | created_at     | | report_data    | <-- JSONB (ReportData completo)
        +----------------+ | ai_insights    | <-- JSONB (AIInsights de Claude)
                           | ext_views      |
                           | share_claimed  |
                           | created_at     |
                           +-------+--------+
                                   |
                    +--------------+------------------+
                    v              v                  v
           +----------------+ +----------------+ +----------------+
           | alert_rules    | | alert_history  | |  bug_reports   |
           |----------------| |----------------| |----------------|
           | id (PK)        | | id (PK)        | | id (PK)        |
           | user_id (FK)   | | rule_id (FK)   | | user_id (FK)   |
           | name           | | report_id (FK) | | report_id      |
           | metric         | | metric_value   | | title          |
           | operator       | | threshold      | | description    |
           | threshold      | | email_sent     | | screenshot     |
           | is_active      | | created_at     | | credit_given   |
           | last_trigger   | +----------------+ | created_at     |
           | created_at     |                    +----------------+
           +----------------+

           +------------------+  +----------------------+
           |   referrals      |  | supported_connectors |
           |------------------|  |----------------------|
           | id (PK)          |  | id (PK) 'lastapp'   |
           | referrer_id (FK) |  | name                 |
           | referred_id (FK) |  | category pos|inv     |
           | referral_code(UQ)|  | logo_url             |
           | status           |  | export_guide_md      |
           | credit_awarded   |  | is_active            |
           | created_at       |  +----------------------+
           +------------------+
```

### Indices

```sql
idx_users_clerk_id           ON users(clerk_id)
idx_users_org                ON users(organization_id)
idx_reports_slug             ON reports(slug)
idx_reports_org              ON reports(organization_id)
idx_reports_user             ON reports(user_id)
idx_credit_transactions_user ON credit_transactions(user_id)
idx_uploads_user             ON uploads(user_id)
idx_referrals_code           ON referrals(referral_code)
idx_referrals_referrer       ON referrals(referrer_id)
```

### Datos semilla

La tabla `supported_connectors` se inicializa con 7 conectores: 4 TPV (lastapp, glop, agora, revo) y 3 inventario (tspoonlab, prezo, gstock). Solo `lastapp` y `tspoonlab` estan activos.

---

## Pipeline de analisis

### Flujo de datos

```
CSV (formato conector) -> Parser -> NormalizedDataset -> Analysis Engine -> ReportData
```

### NormalizedDataset (schema comun entre conectores)

```typescript
interface NormalizedDataset {
  daily_sales: {
    date: string             // YYYY-MM-DD
    location: string
    expected_cash: number
    actual_cash: number
    total_sales: number
    card_sales: number
    cash_sales: number
  }[]
  invoices: {
    id: string
    date: string
    location: string
    employee: string
    amount: number
    is_deleted: boolean
    deletion_reason?: string
  }[]
  deleted_products: {
    date: string
    location: string
    product_name: string
    quantity: number
    amount: number
    phase: 'pre_kitchen' | 'post_kitchen' | 'post_billing'
    employee: string
  }[]
  waste: {
    location: string
    product_name: string
    waste_amount: number
    waste_cost: number
    total_consumption: number
  }[]
  inventory_deviations: {
    product_name: string
    location: string
    theoretical_consumption: number
    actual_consumption: number
    deviation: number
    deviation_percentage: number
  }[]
  metadata: {
    date_from: string
    date_to: string
    locations: string[]
    pos_connector: string
    inventory_connector?: string
  }
}
```

### Los 7 calculadores

Cada calculador recibe el `NormalizedDataset` y produce un resultado tipado:

| # | Calculador | Archivo | Que detecta |
|---|-----------|---------|-------------|
| 1 | Descuadres de caja | `cash-discrepancy.ts` | Diferencia entre caja esperada y real por local/dia |
| 2 | Facturas anuladas | `deleted-invoices.ts` | Concentracion de anulaciones por empleado y local |
| 3 | Productos eliminados | `deleted-products.ts` | Eliminaciones por fase (pre-cocina, post-cocina, post-facturacion) |
| 4 | Merma | `waste-analysis.ts` | Porcentaje de merma vs benchmarks del sector |
| 5 | Desviacion inventario | `inventory-deviation.ts` | Consumo teorico vs real (shrinkage) |
| 6 | Correlaciones | `correlation.ts` | Patrones cruzados entre metricas (Spearman rank) -- requiere `n >= 4` locales para validez estadistica; por debajo, la UI muestra mensaje "Datos insuficientes" |
| 7 | Conclusiones | `conclusions.ts` | Sintesis de riesgo + acciones inmediatas y estructurales |

### Estructura del informe (ReportData)

```typescript
interface ReportData {
  summary: {
    organization_name: string
    analysis_period: string
    locations_count: number
    overall_risk_level: 'critical' | 'high' | 'medium' | 'low'
    key_findings: string[]
  }
  cash_discrepancy: CashDiscrepancyResult
  deleted_invoices: DeletedInvoicesResult
  deleted_products: DeletedProductsResult
  waste_analysis: WasteAnalysisResult
  inventory_deviation: InventoryDeviationResult
  correlation: CorrelationResult
  conclusions: ConclusionsResult
}
```

### Determinismo

El pipeline es 100% determinista. Todas las ordenaciones incluyen tiebreakers secundarios (`localeCompare`) para garantizar resultados identicos en cualquier ejecucion con los mismos datos. Verificado con `scripts/test-determinism.ts` (6 datasets x 10 ejecuciones = 60 tests identicos).

### Tests automatizados (Vitest)

La suite de tests unitarios cubre 6 de los 7 calculadores, parsers, y utilidades. Total: **51 tests** pasando en **9 archivos**. Ejecutar con `npm test` (one-shot) o `npm run test:watch` (modo watch). Gap conocido: falta cobertura para `deleted-products` (tracked en roadmap).

```
__tests__/
|-- calculators/           # 6 archivos (falta deleted-products)
|-- parsers/               # Tests de lastapp y tspoonlab
+-- lib/                   # Utils, credits, report-generator
```

---

## Sistema de parsers (conectores)

Cada conector TPV/inventario tiene su parser que normaliza el CSV propietario al schema `NormalizedDataset`.

### Parsers activos

| Conector | Categoria | Archivo | Notas |
|----------|-----------|---------|-------|
| Last.app | TPV | `parsers/lastapp.ts` | Formato numerico espanol (1.234,56), headers flexibles con acentos |
| T-Spoon Lab | Inventario | `parsers/tspoonlab.ts` | Merma y desviaciones de inventario |

### Parsers skeleton (pendientes de implementar)

| Conector | Categoria | Archivo |
|----------|-----------|---------|
| Glop | TPV | `parsers/glop.ts` |
| Agora | TPV | `parsers/agora.ts` |
| Revo | TPV | `parsers/revo.ts` |
| Prezo | Inventario | `parsers/prezo.ts` |
| GStock | Inventario | `parsers/gstock.ts` |

### Como anadir un nuevo parser

1. Crear `lib/parsers/{nombre}.ts` implementando la interfaz del parser
2. Registrarlo en `lib/parsers/index.ts`
3. Insertar fila en `supported_connectors` con `is_active: true`
4. Anadir logo y guia de exportacion en markdown

---

## Inngest: jobs en background

**Archivo:** `lib/inngest/functions.ts`

**Endpoint:** `POST /api/inngest`

### Job: analyze-report

**Evento trigger:** `report/analyze`

```
Paso 1: update-status-processing
  -> Marca report.status = 'processing'

Paso 2: parse-pos-data
  -> Descarga CSV de Supabase Storage
  -> Parsea con el parser del conector
  -> Retorna NormalizedDataset parcial

Paso 3: parse-inventory-data (opcional, solo si se subio archivo)
  -> Mismo flujo que paso 2

Paso 4: generate-report
  -> Fusiona datasets (POS + inventario)
  -> Ejecuta analysis-engine.ts (7 calculadores)
  -> Persiste report_data (JSONB) en Supabase
  -> Actualiza status = 'completed'
  -> Track analytics

Paso 5: send-report-email (fire-and-forget)
  -> Envia email "Informe listo" via Resend
  -> No bloquea si falla

Paso 6: evaluate-alert-rules (fire-and-forget)
  -> Evalua reglas activas del usuario contra metricas del informe
  -> Inserta alert_history si se cumple condicion
  -> Envia email de alerta si procede

Paso 7: generate-ai-insights (fire-and-forget)
  -> Llama a Claude API con el ReportData serializado
  -> Guarda AIInsights en report.ai_insights
  -> Frontend puede hacer polling para obtenerlo
```

**Importante:** Los pasos 5-7 son fire-and-forget. El informe se marca como `completed` en el paso 4. Si Claude API falla, el informe sigue disponible sin AI Insights. Si Resend falla, el informe sigue disponible sin email.

### Manejo de errores del job principal

Si los pasos 1-4 fallan (parse o calculo), el handler `onFailure` de Inngest actualiza `report.status = 'failed'` y registra el error. El frontend detecta este estado via polling y muestra mensaje al usuario en lugar de quedarse bloqueado en "processing". El credito consumido **no se reembolsa automaticamente** (decision consciente para evitar abuso); el usuario puede reportar el fallo para recuperarlo via soporte.

---

## AI Insights (Claude)

**Archivo:** `lib/ai-insights-generator.ts`

**Modelo:** `claude-sonnet-4-20250514`

**Idioma de respuesta:** Espanol

### Estructura de respuesta

```typescript
interface AIInsights {
  narrative: string              // Resumen ejecutivo 3-5 parrafos en espanol
  recommendations: {
    title: string
    description: string
    priority: 'critical' | 'high' | 'medium' | 'low'
    category: 'immediate' | 'structural' | 'monitoring'
  }[]                            // Max 5 recomendaciones
  anomalies: {
    title: string
    description: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    affected_area: string
  }[]                            // Max 5 anomalias
  generated_at: string           // ISO timestamp
}
```

### Flujo de generacion

1. **Automatica:** Paso 7 de Inngest (fire-and-forget tras completar informe) -- **sin coste de credito**
2. **Polling frontend:** `AIInsightsTab` hace polling cada 3s a `GET /api/reports/[id]/ai-insights` (max 10 polls = 30s timeout)
3. **Regeneracion manual:** Boton "Reintentar" llama a `POST /api/reports/[id]/ai-insights` -- **coste: 1 credito** (se deduce al iniciar la llamada; se reembolsa si Claude responde con error)
4. **Truncamiento:** Payload limitado a 80.000 chars para respetar ventana de contexto
5. **Degradacion graceful:** Si `ANTHROPIC_API_KEY` no existe, se omite sin errores

### Error handling

Logging estructurado con status code, tipo de error y mensaje. Los errores no rompen el flujo del informe.

---

## Autenticacion (Clerk)

**Middleware:** `middleware.ts`

**Webhook:** `POST /api/webhooks/clerk` (verificacion Svix)

### Rutas protegidas

- `/dashboard/*` -- Requiere autenticacion
- `/onboarding/*` -- Requiere autenticacion

### Flujo de usuario nuevo

1. Signup via Clerk (`/signup`)
2. Webhook `user.created` -> inserta en tabla `users` con 100 creditos
3. Email de bienvenida via Resend
4. Redirect a `/onboarding` (seleccion de conectores)
5. Redirect a `/dashboard/upload`

### Middleware adicional

El middleware maneja redirects legacy: `/reports/:slug` -> `/informe/:slug` (301 permanente). Esto se hace en middleware porque Clerk intercepta las requests antes de que los redirects de `next.config.js` se ejecuten.

---

## API Routes

### Gestion de archivos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/upload` | Sube CSV a Supabase Storage + volume detection. **Limite: 50MB por archivo** (validado en cliente y servidor; responde 413 Payload Too Large si se excede) |

### Analisis

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/analyze` | Descuenta credito + trigger Inngest job |

### Informes

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/reports/[id]/status` | Estado del informe (processing/completed/failed) |
| GET | `/api/reports/[id]/ai-insights` | Polling: generating/ready/unavailable |
| POST | `/api/reports/[id]/ai-insights` | Regenerar AI insights manualmente |
| GET | `/api/reports/[id]/pdf` | Descargar PDF del informe |

### Dashboard y comparacion

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/dashboard` | Balance, lista informes, acciones completadas, alertas |
| GET | `/api/compare?reportA=slug&reportB=slug` | Comparar dos informes |

### Alertas

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/alerts` | Listar reglas de alerta |
| POST | `/api/alerts` | Crear regla (max 10 por usuario) |
| PATCH | `/api/alerts/[id]` | Actualizar regla |
| DELETE | `/api/alerts/[id]` | Eliminar regla |

### Pagos y engagement

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/checkout` | Crear Stripe Checkout session |
| POST | `/api/feedback` | Enviar feedback (+1 credito por informe) |
| POST | `/api/referral` | Activar referido (+2 referrer, +1 referred) |
| POST | `/api/bug-report` | Reportar bug (+1 credito, max 3 total) |

### Webhooks

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/webhooks/clerk` | Sync usuario create/update |
| POST | `/api/webhooks/stripe` | Confirmar compra creditos |
| POST | `/api/inngest` | Handler de eventos Inngest |

### Settings

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET/PATCH | `/api/settings` | Configuracion del usuario |

---

## Frontend: paginas y componentes

### Paginas

| Ruta | Descripcion |
|------|-------------|
| `/` | Landing: hero, features, trust signals, CTA |
| `/login` `/signup` | Auth via Clerk (redirect) |
| `/onboarding` | Wizard: seleccion de conectores TPV + inventario |
| `/dashboard` | Informes, balance creditos, gamificacion, alertas |
| `/dashboard/upload` | Drop zone + volume preview + lanzar analisis |
| `/dashboard/processing/[id]` | Loading con auto-refresh hasta completar |
| `/dashboard/comparar` | Seleccion y vista side-by-side de 2 informes |
| `/dashboard/settings` | Alertas, historial creditos, cuenta |
| `/informe/[slug]` | Vista de informe con 9 tabs |

### 9 tabs del informe

| Tab | Componente | Contenido |
|-----|-----------|-----------|
| Resumen | `SummaryTab.tsx` | Nivel de riesgo global, hallazgos clave |
| Caja | `CashTab.tsx` | Descuadres por local/dia con graficas Recharts |
| Facturas | `InvoicesTab.tsx` | Anulaciones por empleado y local |
| Productos | `ProductsTab.tsx` | Eliminaciones por fase (pre/post cocina/cobro) |
| Merma | `WasteTab.tsx` | % merma con benchmark sectorial (3%) |
| Inventario | `InventoryTab.tsx` | Desviaciones teorico vs real |
| Correlaciones | `CorrelationTab.tsx` | Scatter plot + patrones cruzados |
| Conclusiones | `ConclusionsTab.tsx` | Resumen ejecutivo + acciones inmediatas/estructurales |
| IA Insights | `AIInsightsTab.tsx` | Narrativa Claude + anomalias + recomendaciones (polling) |

**Empty states y resiliencia:** Todos los tabs que renderizan graficas Recharts (`CashTab`, `InventoryTab`, `CorrelationTab`) incluyen guards defensivos que detectan arrays vacios o `undefined` y muestran un mensaje explicativo en lugar de renderizar un chart roto. Ademas, cada tab esta envuelto en un `TabErrorBoundary` (React class component con `getDerivedStateFromError`) que captura errores en runtime y muestra un fallback con la opcion de recargar, evitando que un fallo en un tab tumbe la pagina completa.

### Componentes clave

- **ReportsList.tsx** -- Tabla de informes con estado, periodo, locales, acciones (ver/compartir/comparar)
- **CreditBalance.tsx** -- Saldo actual + boton "Comprar mas"
- **GamificationChecklist.tsx** -- Tracking de logros con recompensas en creditos
- **AlertRulesCard.tsx** -- Vista rapida de reglas activas
- **AlertRuleModal.tsx** -- Formulario crear/editar regla de alerta
- **FileDropZone.tsx** -- Drag-and-drop + file picker para CSV
- **VolumePreview.tsx** -- Preview de metadatos (fechas, locales, filas, creditos necesarios)
- **ReportLayout.tsx** -- Container con tabs + banner de riesgo

---

## Sistema de creditos

Cada usuario tiene `credits_balance` (entero). Cada analisis cuesta 1 credito.

### Formas de ganar creditos

| Razon | Creditos | Limite |
|-------|----------|--------|
| `signup_bonus` | 100 | 1 vez (beta gratuita) |
| `feedback` | 1 | 1 por informe |
| `referral` | 2 | 5 referidos max (10 creditos) |
| `referred_bonus` | 1 | 1 vez |
| `bug_report` | 1 | 3 total |
| `first_share_view` | 1 | 1 por informe |
| `second_source` | 1 | 1 por informe (subir inventario) |
| `first_update` | 1 | 1 por informe |
| `purchase` | 5/15/50 | Ilimitado (Stripe) |

### Auditoria

Cada movimiento crea un registro en `credit_transactions` con `amount` (+/-), `reason`, y `reference_id` opcional.

---

## Pagos (Stripe)

**Estado actual:** Desactivado (beta gratuita con 100 creditos de signup)

### Paquetes

| Package | Creditos | Env var del Price ID |
|---------|----------|---------------------|
| `pack_5` | 5 | `STRIPE_PRICE_5_CREDITS` |
| `pack_15` | 15 | `STRIPE_PRICE_15_CREDITS` |
| `pack_50` | 50 | `STRIPE_PRICE_50_CREDITS` |

### Flujo

1. `POST /api/checkout` -> Crea Stripe Checkout session con `metadata: { userId, packageId }`
2. Redirect a Stripe hosted checkout
3. Webhook `checkout.session.completed` -> Acredita creditos + email confirmacion
4. Redirect a `/dashboard?purchase=success`

### Activar Stripe

1. Configurar las 6 env vars de Stripe en Vercel
2. Crear 3 Price IDs en Stripe Dashboard
3. Configurar webhook endpoint en Stripe -> `https://fraud-audit.vercel.app/api/webhooks/stripe`
4. Habilitar UI de compra en el dashboard

---

## Sistema de alertas

### Reglas

Los usuarios crean reglas con la logica: `SI {metrica} {operador} {umbral} ENTONCES notificar por email`

**Metricas disponibles:**
- `cash_discrepancy` -- Descuadre total de caja (EUR)
- `deleted_invoices_count` -- Numero de facturas anuladas
- `waste_percentage` -- Porcentaje de merma
- `risk_level` -- Nivel de riesgo (1=low, 2=medium, 3=high, 4=critical)

**Operadores:** `gt` | `gte` | `lt` | `lte` | `eq`

**Limite:** 10 reglas por usuario

### Evaluacion

Tras cada informe completado (paso 6 de Inngest, fire-and-forget):
1. Obtiene las reglas activas del usuario
2. Extrae el valor de la metrica del ReportData
3. Evalua la condicion
4. Si se cumple: inserta en `alert_history` + envia email via Resend

---

## Emails (Resend)

**Archivos:** `lib/email.ts` + `lib/email-templates.ts`

**Degradacion:** Si `RESEND_API_KEY` no existe, los emails se omiten silenciosamente.

### Templates

| Template | Trigger | Contenido |
|----------|---------|-----------|
| `welcomeEmail` | Signup (webhook Clerk) | Bienvenida + primeros pasos |
| `reportReadyEmail` | Informe completado | Link al informe |
| `alertTriggeredEmail` | Regla de alerta cumplida | Metrica + valor + umbral + link |
| `purchaseConfirmationEmail` | Compra Stripe | Recibo + creditos acreditados |

---

## Analytics (PostHog)

**Client-side:** `posthog-js` via `PostHogProvider` (componente wrapper en layout)

**Server-side:** `posthog-node` via funcion `captureServerEvent()`

### Eventos principales

| Evento | Propiedades clave |
|--------|-------------------|
| `landing_cta_clicked` | cta_position |
| `signup_completed` | method |
| `file_uploaded` | connector_type, file_size, rows, locations |
| `analysis_started` | credits_used, months, locations, slug |
| `analysis_completed` | processing_time_seconds, slug |
| `report_viewed` | slug, is_owner, source |
| `credit_earned` | reason, new_balance |
| `credit_spent` | reason, new_balance |
| `purchase_completed` | amount, credits_purchased |
| `feedback_submitted` | accuracy_rating, useful_section, would_share |

### Feature Flags (opcionales)

- `ONBOARDING_FLOW_VARIANT` -- A/B testing del flujo de onboarding
- `CREDIT_REWARD_AMOUNTS` -- Ajuste dinamico de recompensas
- `VOLUME_LIMIT_FREE_TIER` -- Limites por tier
- `SHOW_UPGRADE_PROMPT_STYLE` -- Variantes del upsell

---

## Despliegue y entorno

### Servicios en produccion

| Servicio | Proveedor | Proposito |
|----------|-----------|-----------|
| Frontend + API | Vercel | Hosting, Edge, CI/CD automatico en push a main |
| Base de datos + Storage | Supabase | PostgreSQL hosted + bucket de archivos |
| Background jobs | Inngest | Cola durable con reintentos automaticos |
| Autenticacion | Clerk | OAuth, email auth, session management, webhooks |
| AI | Anthropic | Claude API para generacion de insights |
| Pagos | Stripe | Checkout hosted + webhooks (desactivado en beta) |
| Email | Resend | Email transaccional |
| Analytics | PostHog | Product analytics, funnels, feature flags |

### CI/CD

Push a `main` -> Vercel detecta cambio -> Build automatico -> Deploy a produccion

El build incluye type checking de TypeScript. Si hay errores de tipo, el deploy falla.

---

## Variables de entorno

```bash
# === REQUERIDAS ===

# Clerk (autenticacion)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Supabase (base de datos + storage)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Inngest (background jobs)
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# App
NEXT_PUBLIC_APP_URL=https://fraud-audit.vercel.app

# === OPCIONALES (degradacion graceful si no estan configuradas) ===

# Anthropic (AI insights)
ANTHROPIC_API_KEY=sk-ant-...

# Resend (emails transaccionales)
RESEND_API_KEY=re_...

# PostHog (analytics)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Stripe (pagos - desactivado en beta)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_5_CREDITS=price_...
STRIPE_PRICE_15_CREDITS=price_...
STRIPE_PRICE_50_CREDITS=price_...
```

---

## Scripts de desarrollo

```bash
# Desarrollo local
npm run dev           # Next.js dev server (puerto 3000)
npm run inngest       # Inngest CLI dev mode (panel en http://localhost:8288)

# Produccion
npm run build         # Build Next.js (incluye type check)
npm start             # Servidor produccion

# Calidad
npm run lint          # ESLint

# Testing
npm test                              # Suite completa Vitest (51 tests unitarios, one-shot)
npm run test:watch                    # Vitest en modo watch (TDD)
npx tsx scripts/test-determinism.ts   # Verificar determinismo del pipeline (60 ejecuciones)

# Base de datos
node scripts/run-schema.js            # Aplicar schema inicial a Supabase
npx supabase migration new <nombre>   # Crear nueva migracion SQL
```

---

## Datasets de prueba

En `test-data/` hay 6 datasets CSV para probar distintos escenarios de fraude:

| Archivo | Escenario | Que detecta |
|---------|-----------|-------------|
| `dataset-1-paella-dorada.csv` | Robo de caja | Un local con descuadres sistematicos de -80 a -250 EUR/dia |
| `dataset-2-tapas-co.csv` | Empleado fraudulento | Un empleado hace 72% de eliminaciones post-factura |
| `dataset-3-sushi-zen.csv` | Operacion limpia | Restaurante bien gestionado, riesgo bajo |
| `dataset-4-el-asador.csv` | Fraude organizado | 3 empleados coordinados en 3 locales |
| `dataset-5-cafe-puerto.csv` | Pico estacional | Normal 2 meses, spike de fraude en el tercero |
| `dataset-6-restaurante-luna.csv` | Worst case | Descuadres masivos + empleado concentrador + post-factura |

Todos usan el conector Last.app.

---

## Decisiones de diseno

| Decision | Razonamiento |
|----------|-------------|
| Inngest para async | Jobs durables con reintentos automaticos. Sobrevive a reinicios del servidor. |
| Fire-and-forget para email/alertas/AI | El informe se completa sin esperar features secundarias. |
| JSONB para report_data | Evita joins complejos. Documento autocontenido. Supabase soporta queries JSONB. |
| Sistema de creditos | Gamifica engagement, permite monetizacion futura, previene abuso. |
| Degradacion graceful | Stripe, Resend, Claude, PostHog: todos funcionan como no-ops si sus API keys faltan. |
| Parsers como plugins | Anadir conector = 1 archivo parser + 1 registro en DB. Arquitectura extensible. |
| Espanol primero | Mercado objetivo: restaurantes en Espana. Parsers manejan formato numerico espanol. |
| React PDF para exports | Generacion de PDF client-side via componente React. Sin carga en servidor. |
| Clerk para auth | Auth gestionada con webhooks. Sin passwords en la app. OAuth + email. |
| PostHog analytics | Alternativa open-source a Mixpanel. Feature flags + funnels + retention. |
| Tiebreakers en sorts | Defensive coding: todos los sorts tienen tiebreaker `localeCompare`. Determinismo garantizado. |
| Redirects en middleware | Los redirects de next.config.js no se ejecutan cuando Clerk middleware intercepta. |
| `AbortController` en `useEffect` | Todos los fetch en paginas dashboard usan `AbortController` y limpian con `controller.abort()` en el cleanup del effect. Previene "setState on unmounted component" y race conditions al navegar rapido entre vistas. |
| `TabErrorBoundary` por tab | Cada tab del informe esta envuelto en su propio Error Boundary (React class component). Un crash en un tab no tumba el informe completo; el usuario ve el resto y puede recargar solo el tab afectado. |
| Spearman `n >= 4` | La correlacion de rangos requiere minimo 4 observaciones para ser estadisticamente valida. Por debajo, se muestra mensaje explicativo en lugar de un coeficiente enganoso. Evita falsos positivos de riesgo con datasets pequenos. |
| Limite 50MB en upload | Validado en dos capas: cliente (pre-upload UX inmediato) + servidor (`/api/upload` devuelve 413). Protege contra archivos corruptos y DoS por memoria. |
| `authedFetch` wrapper para 401 | Wrapper centralizado alrededor de `fetch` que detecta 401 del servidor y redirige a `/login` automaticamente. Elimina boilerplate de auth en cada pagina y garantiza UX consistente ante expiracion de sesion. |

---

## Dependencias

### Produccion

| Paquete | Version | Proposito |
|---------|---------|-----------|
| `next` | ^14.2.25 | Framework full-stack React |
| `react` / `react-dom` | ^18.3.0 | UI library |
| `@clerk/nextjs` | ^6.39.0 | Autenticacion y session management |
| `@supabase/supabase-js` | ^2.39.0 | Cliente PostgreSQL + Storage API |
| `pg` | ^8.20.0 | Driver PostgreSQL directo (para Inngest) |
| `inngest` | ^3.0.0 | Background jobs durables |
| `@anthropic-ai/sdk` | ^0.78.0 | Claude API para AI insights |
| `stripe` | ^14.0.0 | Pagos con tarjeta |
| `resend` | ^6.9.3 | Email transaccional |
| `posthog-js` | ^1.100.0 | Analytics browser-side |
| `posthog-node` | ^5.28.0 | Analytics server-side |
| `papaparse` | ^5.4.1 | Parser CSV |
| `recharts` | ^2.12.0 | Graficas interactivas |
| `@react-pdf/renderer` | ^4.3.2 | Generacion PDF |
| `xlsx` | ^0.18.5 | Exportacion Excel |
| `nanoid` | ^5.0.0 | IDs unicos para slugs de URLs |
| `svix` | ^1.86.0 | Verificacion de webhooks Clerk |
| `clsx` | ^2.1.0 | CSS condicional |
| `tailwind-merge` | ^2.2.0 | Merge inteligente de clases Tailwind |

### Desarrollo

| Paquete | Version | Proposito |
|---------|---------|-----------|
| `typescript` | ^5.4.0 | Type checking estatico |
| `tailwindcss` | ^3.4.0 | CSS utility-first |
| `postcss` | ^8.4.0 | CSS processing |
| `eslint` | ^8.0.0 | Linting |
| `supabase` | ^2.77.0 | CLI para migraciones de base de datos |
| `vitest` | ^4.0.18 | Framework de tests unitarios (51 tests en `__tests__/`) |

---

## Roadmap tecnico

**Estado actual:** Beta gratuita con 100 creditos de signup. 2 conectores activos.

### Pendiente

- [ ] Activar Stripe: configurar price IDs, habilitar UI de compra
- [ ] Mas conectores: implementar parsers para Glop, Agora, Revo, Prezo, GStock
- [ ] Equipos/organizaciones: la columna `organization_id` ya existe, falta UI de gestion
- [ ] Analisis recurrentes: programar analisis automaticos periodicos
- [ ] Export a BI: API para conectar con herramientas externas (Looker, PowerBI)
- [ ] App movil: el diseno API-first lo soporta nativamente
- [ ] Multi-idioma: soportar en, pt ademas de es
- [ ] Dashboard de tendencias: visualizar evolucion de metricas entre informes
- [x] Tests automatizados: **51 tests unitarios** (9 archivos) para 6 de 7 calculadores, parsers y utilidades (Vitest). Pendiente: cobertura de `deleted-products` e integration tests para API routes
- [ ] Row Level Security: politicas RLS en Supabase para multi-tenancy seguro
