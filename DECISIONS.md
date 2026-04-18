# Decisiones de arquitectura (ADR)

Registro de decisiones de diseno tomadas a lo largo del desarrollo de FraudAudit.
Formato inspirado en ADR (Architectural Decision Records): contexto, decision, consecuencias y alternativas descartadas.

Orden: mas reciente primero.

---

## 2026-04-18 — Sprint de bugfix QA completo (33 bugs / 14 tareas)

Tras auditoria externa de QA se identificaron 33 bugs clasificados en 14 tareas. Este sprint introduce 5 patrones arquitectonicos nuevos que afectan al conjunto del frontend y al pipeline de Inngest. Los patrones se documentan individualmente mas abajo; este bloque resume el sprint como unidad.

**Cobertura de tests:** se adopta **Vitest 4.0.18** como framework de tests unitarios. Al cierre del sprint: **51 tests pasando** en 9 archivos, cubriendo 6 de los 7 calculadores (pendiente `deleted-products`), parsers (lastapp, tspoonlab) y utilidades (`credits`, `determinism`, `stripe-webhook`). Los tests son requisito de merge a `main`.

**Branch:** `fix/qa-bugs-completo` -> PR revisado y mergeado. Deploy automatico a Vercel produccion verificado.

---

## ADR-007 — `authedFetch` wrapper centralizado para 401

**Fecha:** 2026-04-18
**Contexto (AUDIT-027):** Cada pagina del dashboard que llama a API routes protegidas repetia el mismo patron: `fetch()` -> check `res.status === 401` -> `router.push('/login')`. La expiracion silenciosa de sesion dejaba la UI colgada en "loading" porque algunos fetches no implementaban el chequeo.

**Decision:** Crear `lib/authed-fetch.ts` que envuelve `fetch` y:
1. Detecta respuestas 401
2. Redirige automaticamente a `/login` via `window.location.href`
3. Devuelve `null` al caller para que el codigo consumidor haga early return sin mas logica

```typescript
const res = await authedFetch('/api/dashboard', { signal: controller.signal })
if (!res) return // redirect en curso
if (res.ok) { ... }
```

**Consecuencias:**
- Todas las paginas dashboard (`/dashboard`, `/dashboard/upload`, `/dashboard/comparar`) pasan por el mismo wrapper.
- UX consistente: el usuario siempre aterriza en login, nunca ve pagina en blanco.
- El tipo de retorno `Response | null` fuerza al caller a manejar el caso de redirect.

**Alternativas descartadas:**
- **Interceptor en middleware:** Clerk ya hace auth a nivel middleware, pero el middleware no puede modificar respuestas `fetch` client-side una vez enviadas.
- **Custom hook `useAuthedFetch`:** requeriria reescribir todos los `useEffect` como hooks compuestos. Mas invasivo.
- **Provider + Context:** overkill para un wrapper de 20 lineas sin estado.

---

## ADR-006 — `AbortController` obligatorio en `useEffect` con fetch

**Fecha:** 2026-04-18
**Contexto (AUDIT-025):** Al navegar rapido entre `/dashboard` y `/dashboard/upload`, los fetches en vuelo seguian ejecutandose y llamaban `setState` sobre componentes ya desmontados, generando warnings y race conditions (datos de la vista anterior sobrescribiendo la nueva).

**Decision:** Todo `useEffect` que inicie un fetch DEBE crear un `AbortController` y limpiar con `controller.abort()` en el cleanup:

```typescript
useEffect(() => {
  const controller = new AbortController()
  async function load() {
    const res = await authedFetch('/api/...', { signal: controller.signal })
    if (!res) return
    // ...
  }
  load()
  return () => controller.abort()
}, [])
```

**Consecuencias:**
- Elimina warnings de "setState on unmounted component".
- Previene race conditions en navegaciones rapidas.
- Cuando se suma con `authedFetch`, el patron es uniforme en todo el dashboard.

**Alternativas descartadas:**
- **Flag `isMounted` local:** patron antiguo, mas codigo, no cancela la request HTTP subyacente (solo descarta la respuesta).
- **SWR / React Query:** aportan abort gratis pero introduce dependencia y refactor masivo. Mejor candidato para una refactorizacion futura, no para un sprint de bugfix.

---

## ADR-005 — `TabErrorBoundary` (React class) en lugar de `error.tsx` nativo

**Fecha:** 2026-04-18
**Contexto (AUDIT-017):** Los 9 tabs del informe (`/informe/[slug]`) viven dentro de un mismo Client Component. Si un tab crasheaba (p.ej. `CorrelationTab` con dataset vacio), React desmontaba el arbol completo y el usuario perdia acceso a los otros 8 tabs.

**Decision:** Envolver cada tab en su propio `TabErrorBoundary`, un React class component con `getDerivedStateFromError` + `componentDidCatch`, que muestra un fallback local con boton "Recargar" sin afectar al resto del informe.

**Por que NO `error.tsx`:** El file convention de Next.js 14 (`app/informe/[slug]/error.tsx`) solo captura errores a nivel de **route segment**. Un fallo dentro de un tab es intra-segment y no lo intercepta. Ademas, `error.tsx` reemplaza la pagina completa, lo que es exactamente lo que queremos evitar.

**Consecuencias:**
- Fallos aislados por tab. El usuario siempre tiene al menos 8 tabs operativos.
- `TabErrorBoundary` es una class component (no hook) porque los Error Boundaries de React requieren metodos de ciclo de vida que no tienen equivalente en hooks.
- Se complementa con `global-error.tsx` a nivel root y `error.tsx` por segmento para defensa en profundidad.

**Alternativas descartadas:**
- **`react-error-boundary` (librerias externas):** anadir dependencia para 40 lineas de codigo es innecesario.
- **Try/catch en cada tab:** no captura errores async ni de render, solo side-effects.

---

## ADR-004 — Correlacion de Spearman requiere `n >= 4`

**Fecha:** 2026-04-18
**Contexto (AUDIT-017, BUG-C08):** El calculador `correlation.ts` computaba coeficientes de Spearman con n=1, 2 o 3 observaciones. Estadisticamente carecen de significancia y el scatter plot de Recharts se rendeaba con puntos aislados mostrando "correlaciones" espurias.

**Decision:** Definir constante `MIN_LOCATIONS = 4` en `correlation.ts`. Si el dataset tiene `< 4` locales:
1. El calculador marca `correlation_exists = false` sin calcular coeficiente.
2. La UI (`CorrelationTab`) muestra un mensaje explicativo: "Datos insuficientes para el analisis de correlacion. Se necesitan al menos 4 locales para calcular la correlacion de Spearman de forma estadisticamente valida."
3. El scatter chart no se renderiza (evita visualizar ruido).

**Por que 4 y no 3 o 5:** Con n=4, Spearman tiene grados de libertad suficientes para un p-value interpretable a dos colas. Con n=3, cualquier permutacion de rangos produce `|rho|=1`. Con n>=5 la potencia estadistica mejora mas, pero imponer 5 excluiria datasets reales de cadenas pequenas (3-4 locales). El umbral 4 es el minimo pragmatico.

**Consecuencias:**
- El resto del informe funciona igual con datasets pequenos; solo la seccion de correlaciones entra en modo degradado.
- Se reduce el riesgo de falsos positivos que inducirian a malas decisiones de negocio.

**Alternativas descartadas:**
- **Calcular igual y marcar con asterisco:** los usuarios no-tecnicos ignoran los disclaimers; mejor no mostrar el dato.
- **Pearson en vez de Spearman con n<4:** Pearson tiene los mismos problemas y es menos robusto a outliers que Spearman.

---

## ADR-003 — Validacion de tamano de archivo en dos capas (50 MB)

**Fecha:** 2026-04-18
**Contexto (AUDIT-009):** Archivos CSV >100MB colapsaban el parser en memoria (Supabase Storage acepta hasta 5GB por defecto). Tambien observamos uploads corruptos por cortes de red en archivos grandes sin feedback al usuario.

**Decision:** Validar `file.size` en dos capas:
1. **Cliente** (`components/upload/FileDropZone.tsx`): bloqueo pre-upload con mensaje claro. UX inmediata, evita tiempo de subida perdido.
2. **Servidor** (`app/api/upload/route.ts`): vuelve a validar y devuelve `413 Payload Too Large` si se excede. Defensa contra bypasses del cliente.

**Limite:** 50 MB. Cubre ~95% de exports reales observados en produccion (datasets de 2-6 meses, multi-local).

**Consecuencias:**
- Mensajes de error consistentes en ambos lados.
- Proteccion contra DoS accidentales por memoria.
- El cliente ahorra ancho de banda al no subir archivos invalidos.

**Alternativas descartadas:**
- **Solo cliente:** un atacante o un script malicioso puede bypassear y colapsar el servidor.
- **Solo servidor:** mala UX; el usuario sube 200MB por 4G antes de enterarse que fue rechazado.
- **Streaming con chunks:** util para archivos >1GB pero complejidad no justificada para el percentil 99 de uso actual.

---

## ADR-002 — `onFailure` handler en Inngest para marcar reports como `failed`

**Fecha:** 2026-04-18
**Contexto (AUDIT-013):** Si el pipeline de analisis (pasos 1-4 del job `analyze-report`) lanzaba una excepcion, el registro de la tabla `reports` quedaba en estado `processing` indefinidamente. El frontend hacia polling eterno sin informar al usuario.

**Decision:** Anadir un handler `onFailure` a la funcion Inngest que:
1. Actualiza `report.status = 'failed'` en Supabase.
2. Registra el error (mensaje + stack) en logs.
3. NO reembolsa el credito automaticamente (decision consciente anti-abuso).

El frontend, via polling a `/api/reports/[id]/status`, detecta `status === 'failed'` y muestra un mensaje de error con instruccion de contactar soporte.

**Consecuencias:**
- Los usuarios dejan de ver "procesando" eternamente.
- Trazabilidad de fallos en logs de Inngest.
- El credito se pierde ante un fallo del sistema; se compensa manualmente via soporte si el fallo es imputable al servicio.

**Alternativas descartadas:**
- **Reintentos automaticos ilimitados:** Inngest ya hace 3 reintentos por defecto. Si tras 3 aun falla, seguir reintentando desperdicia recursos.
- **Reembolso automatico:** abusable (cliente podria forzar fallos para obtener creditos gratis). Manual por soporte es mas seguro.

---

## ADR-001 — Guards defensivos en graficas Recharts

**Fecha:** 2026-04-18
**Contexto (AUDIT-017):** Los componentes `CashTab`, `InventoryTab` y `CorrelationTab` recibian arrays que podian venir `undefined` o vacios (p.ej. cuando el CSV no tenia inventario o solo habia 1 local). Recharts renderiza `<ResponsiveContainer>` vacios o lanza errores con `undefined`.

**Decision:** En cada tab con grafica, al inicio del componente:
1. Extraer los arrays con fallback: `const locals = data.locals ?? []`
2. Early return con `<Card>` de empty state si todos los arrays relevantes estan vacios.
3. Fallback inline en cada grafica (`byMonth.length === 0 ? <mensaje /> : <Chart />`) para tabs con multiples secciones.

**Consecuencias:**
- La UI nunca renderiza una grafica vacia o rota.
- Mensajes contextuales al usuario ("No hay datos de caja disponibles para este periodo.").
- Patron replicable en futuros tabs con graficas.

**Alternativas descartadas:**
- **Fallar silenciosamente (grafica en blanco):** el usuario no sabe si es un bug o es que no hay datos.
- **Throw + capturar en ErrorBoundary:** un array vacio no es un error, es un estado valido. Usar el Error Boundary para esto seria semanticamente incorrecto.

---

# Decisiones historicas (pre-sprint QA)

Estas son las decisiones originales del proyecto, ya documentadas en `README.md > Decisiones de diseno`. Se listan aqui como referencia; para contexto completo consultar el README.

- Inngest para async (jobs durables con reintentos).
- Fire-and-forget para email/alertas/AI (el informe no bloquea por features secundarias).
- JSONB para `report_data` (documento autocontenido, sin joins).
- Sistema de creditos (gamificacion + monetizacion futura).
- Degradacion graceful (Stripe, Resend, Claude, PostHog son opcionales).
- Parsers como plugins (arquitectura extensible, 1 archivo por conector).
- Espanol primero (mercado HORECA Espana, parsers manejan formato 1.234,56).
- React PDF para exports (generacion client-side).
- Clerk para auth (webhooks, sin passwords en la app).
- PostHog analytics (open-source, feature flags + funnels).
- Tiebreakers en sorts (`localeCompare` para determinismo garantizado).
- Redirects en middleware (no en `next.config.js`, por conflicto con Clerk).
