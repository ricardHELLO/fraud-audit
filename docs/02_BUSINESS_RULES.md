# Reglas de negocio (BIZ-*)

Este documento recoge las reglas de negocio criticas que afectan al producto FraudAudit. Cada regla tiene un identificador `BIZ-NN`, un alcance, un enforcement y un relacionado en `DECISIONS.md`.

Orden: mas reciente primero.

---

## BIZ-04 — No-touch calculators

**Regla:** Los calculators deterministicos (`lib/calculators/*.ts`) son la unica fuente de verdad numerica del informe. La IA generativa redacta narrativa sobre esos numeros pero **nunca los recalcula, redondea ni reformatea**.

**Alcance:** aplica a toda pieza de IA que consuma `ReportData` o subconjuntos.
- Hoy: `lib/ai-insights-generator.ts` (narrativa + recomendaciones + anomalias).
- Futuro: cualquier agente de chat, email generator, PDF summary o asistente de dashboard que referencie cifras del informe.

**Motivacion:** FraudAudit es un producto de auditoria. Si el numero en el tab de "Caja" no coincide con el numero en la narrativa de IA, el cliente pierde la confianza inmediatamente — y el LLM no es un sistema de calculo deterministico, asi que cualquier cifra derivada por el modelo es sospechosa por construccion.

### Que significa en practica

| Campo `ReportData` | Permitido | Prohibido |
|---|---|---|
| `cash_discrepancy.total_discrepancy = 1247.50` | "1.247,50 EUR", "1247.50 EUR" | "~1.250 EUR", "aprox. 1.2K", "alrededor de 1.200 EUR" |
| `waste_analysis.waste_percentage = 8.3` | "8,3%", "8.3%" | "~8%", "casi 9%", "dos digitos" |
| `deleted_products.count = 7` | "7 productos eliminados" | "varios productos", "unos cuantos" |
| `correlation.strength = 62` (sin benchmark) | Describirlo como score interno (0-100) | "esta por encima de la media del sector" |
| `deleted_invoices.count = 0` | "Sin datos suficientes en esta seccion" | Fabricar una narrativa de facturas eliminadas |

### Reformato permitido (presentacion, no magnitud)

- Coma decimal espanola vs punto: `1247.50` -> `1.247,50`. Ambos validos.
- Simbolo de moneda: `EUR` o `€`. Ambos validos.
- Porcentaje: `8.3%` o `8,3%`. Ambos validos.
- **Nunca** cambiar la cifra: `1247.50` no puede aparecer como `1248`, `1247`, `1.2K`, ni `1,25K`.

### Enforcement

1. **System prompt (`lib/ai-insights-generator.ts`):** el `SYSTEM_PROMPT` incluye el bloque `REGLAS DE INTEGRIDAD NUMERICA` que enumera las reglas de forma explicita. Ver [ADR-009](../DECISIONS.md#adr-009).
2. **Test unitario (`__tests__/ai-insights-generator.test.ts`):** parsea el fuente via `readFileSync` y verifica (8 assertions) que el bloque sigue presente. Si alguien lo elimina en un refactor, CI falla antes del merge.
3. **(Roadmap) Validacion post-hoc:** tras la respuesta del LLM, extraer numeros de la narrativa con regex y comprobar que todos existen en `ReportData`. Si alguno no existe, loggear `ai_insights_number_drift` en PostHog + prompt re-run. **No implementado todavia.**

### Que NO cubre BIZ-04

- Numeros derivados por el propio calculator (media, mediana, suma): se consideran "deterministicos" porque vienen del calculator, y estan en `ReportData`. Si el LLM los cita, estan permitidos.
- Formato de fechas, nombres de empleados, textos no numericos: fuera del alcance de esta regla.
- Traducciones del informe al ingles o catalan: se mantienen los numeros tal cual del calculator; la regla aplica igual.

### Anti-pattern historico que motivo la regla

Sin regla explicita, observamos al modelo haciendo cosas como:
- "El restaurante tiene ~1.250 EUR de descuadre" cuando `total_discrepancy` era `1247.50` -> aproximacion no permitida.
- "La cancelacion media es aproximadamente de 32 EUR" cuando ese campo no existia en `ReportData` -> alucinacion directa.
- "El desperdicio esta en la media del sector hostelero" sin que hubiera ningun benchmark en el input -> inferencia no respaldada.

### Relacionado

- [ADR-009 en DECISIONS.md](../DECISIONS.md#adr-009)
- `lib/ai-insights-generator.ts` (prompt de produccion)
- `__tests__/ai-insights-generator.test.ts` (enforcement)
- `lib/calculators/*.ts` (fuente de verdad)
- `lib/types/report.ts` (interface `ReportData`)
