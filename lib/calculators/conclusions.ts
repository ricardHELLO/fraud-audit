import {
  CashDiscrepancyResult,
  DeletedInvoicesResult,
  DeletedProductsResult,
  WasteAnalysisResult,
  InventoryDeviationResult,
  CorrelationResult,
  ConclusionsResult,
  Conclusion,
} from '@/lib/types/report';

interface CalculatorInputs {
  cash: CashDiscrepancyResult;
  invoices: DeletedInvoicesResult;
  products: DeletedProductsResult;
  waste: WasteAnalysisResult;
  inventory: InventoryDeviationResult;
  correlation: CorrelationResult;
}

const CASH_CRITICAL_THRESHOLD = 1000;
const INVOICE_CONCENTRATION_THRESHOLD = 0.4;
const AFTER_BILLING_CRITICAL_THRESHOLD = 0.2;
const WASTE_UNDERREPORTING_THRESHOLD = 1;
const INVENTORY_HIGH_THRESHOLD = 5000;

export function generateConclusions(data: CalculatorInputs): ConclusionsResult {
  const conclusions: Conclusion[] = [];
  const immediateActions: string[] = [];
  const structuralActions: string[] = [];

  // --- 1. Cash discrepancy analysis ---
  // BUG-C11 fix: use Math.abs to find worst local by absolute deviation (not most-negative).
  // Matches the fix in cash-discrepancy.ts so both modules agree on "worst" local.
  const worstCashLocal = data.cash.locals.length > 0
    ? data.cash.locals.reduce((worst, l) =>
        Math.abs(l.total_discrepancy) > Math.abs(worst.total_discrepancy) ? l : worst
      )
    : null;

  if (
    worstCashLocal &&
    Math.abs(worstCashLocal.total_discrepancy) > CASH_CRITICAL_THRESHOLD
  ) {
    conclusions.push({
      title: 'Descuadres de caja cr\u00edticos',
      severity: 'critical',
      description: `El local "${worstCashLocal.name}" presenta un descuadre acumulado de ${Math.abs(worstCashLocal.total_discrepancy).toFixed(2)}\u20ac, superando el umbral cr\u00edtico de ${CASH_CRITICAL_THRESHOLD}\u20ac. Esto indica posibles sustracciones de efectivo o fallos graves en el proceso de arqueo.`,
    });
    immediateActions.push(
      `Auditar caja de ${worstCashLocal.name} de forma inmediata`
    );
    immediateActions.push(
      `Revisar registros de turno en ${worstCashLocal.name} para identificar patrones horarios`
    );
  } else if (
    worstCashLocal &&
    Math.abs(worstCashLocal.total_discrepancy) > 500
  ) {
    conclusions.push({
      title: 'Descuadres de caja significativos',
      severity: 'high',
      description: `El local "${worstCashLocal.name}" presenta descuadres acumulados de ${Math.abs(worstCashLocal.total_discrepancy).toFixed(2)}\u20ac que requieren investigaci\u00f3n.`,
    });
    immediateActions.push(
      `Realizar arqueos sorpresa en ${worstCashLocal.name}`
    );
  }

  // --- 2. Deleted invoices concentration ---
  if (
    data.invoices.by_employee.length > 0 &&
    data.invoices.total_count > 0
  ) {
    const topEmployee = data.invoices.by_employee[0];
    const topPercentage = topEmployee.count / data.invoices.total_count;

    if (topPercentage > INVOICE_CONCENTRATION_THRESHOLD) {
      conclusions.push({
        title: 'Concentraci\u00f3n an\u00f3mala de anulaciones',
        severity: 'high',
        description: `El empleado "${topEmployee.employee}" concentra el ${Math.round(topPercentage * 100)}% de todas las facturas anuladas (${topEmployee.count} de ${data.invoices.total_count}), por un importe total de ${topEmployee.amount.toFixed(2)}\u20ac. Esta concentraci\u00f3n es at\u00edpica y sugiere un posible patr\u00f3n de fraude.`,
      });
      immediateActions.push(
        `Investigar anulaciones de ${topEmployee.employee} en ${topEmployee.location}`
      );
      immediateActions.push(
        `Entrevistar al responsable de turno sobre las anulaciones de ${topEmployee.employee}`
      );
    }
  }

  // --- 3. Post-billing deletions ---
  const totalProducts = data.products.total_eliminated;
  if (totalProducts > 0) {
    const afterBillingCount = data.products.by_phase.after_billing.count;
    const afterBillingRatio = afterBillingCount / totalProducts;

    if (afterBillingRatio > AFTER_BILLING_CRITICAL_THRESHOLD) {
      conclusions.push({
        title: 'Eliminaciones post-facturaci\u00f3n cr\u00edticas',
        severity: 'critical',
        description: `El ${Math.round(afterBillingRatio * 100)}% de los productos eliminados (${afterBillingCount} de ${totalProducts}) fueron eliminados despu\u00e9s de la facturaci\u00f3n, por un importe de ${data.products.by_phase.after_billing.amount.toFixed(2)}\u20ac. Esto es un indicador fuerte de fraude, ya que el producto fue servido y cobrado pero la transacci\u00f3n fue revertida.`,
      });
      immediateActions.push(
        'Bloquear la posibilidad de eliminar productos post-facturaci\u00f3n sin autorizaci\u00f3n de gerencia'
      );

      // Identify worst local for post-billing
      const worstPostBillingLocal = data.products.by_local.reduce(
        (worst, l) =>
          l.after_billing_percentage > worst.after_billing_percentage
            ? l
            : worst,
        data.products.by_local[0]
      );
      if (worstPostBillingLocal) {
        immediateActions.push(
          `Auditar todas las eliminaciones post-facturaci\u00f3n en ${worstPostBillingLocal.location}`
        );
      }
    }
  }

  // --- 4. Waste underreporting ---
  // BUG-C13 fix: scale severity based on how extreme the underreporting is.
  // 0.01% waste is FAR more suspicious than 0.9% — should be critical, not medium.
  if (data.waste.waste_percentage < WASTE_UNDERREPORTING_THRESHOLD) {
    const wasteSeverity =
      data.waste.waste_percentage < 0.5 ? 'critical' : 'medium';
    conclusions.push({
      title: 'Posible infrareporte de mermas',
      severity: wasteSeverity,
      description: `El porcentaje de mermas reportado (${data.waste.waste_percentage.toFixed(2)}%) est\u00e1 muy por debajo del benchmark de la industria (3%). Un nivel tan bajo sugiere que las mermas no est\u00e1n siendo reportadas correctamente, lo cual podr\u00eda ocultar sustracciones de producto.`,
    });
    immediateActions.push(
      'Implementar registro obligatorio de mermas con fotograf\u00eda y doble firma'
    );
  }

  // --- 5. Inventory deviation ---
  if (data.inventory.total_deviation_range.max > INVENTORY_HIGH_THRESHOLD) {
    conclusions.push({
      title: 'Desviaciones de inventario significativas',
      severity: 'high',
      description: `Se detectaron desviaciones de inventario de hasta ${data.inventory.total_deviation_range.max.toFixed(2)} unidades en un mes. ${data.inventory.main_cause}. Las desviaciones sistem\u00e1ticas entre consumo te\u00f3rico y real indican problemas de control o posibles sustracciones.`,
    });
    immediateActions.push(
      'Realizar inventario f\u00edsico completo de forma inmediata'
    );
    immediateActions.push(
      'Contrastar consumos te\u00f3ricos con comandas reales del TPV'
    );
  }

  // --- 6. Correlation (systematic fraud indicator) ---
  if (data.correlation.correlation_exists) {
    conclusions.push({
      title: 'Patr\u00f3n de fraude sistem\u00e1tico detectado',
      severity: 'critical',
      description:
        'Se ha detectado una correlaci\u00f3n significativa entre las facturas anuladas y los descuadres de caja por local. Los locales con mayor volumen de anulaciones tambi\u00e9n presentan mayores descuadres, lo cual es un indicador fuerte de un esquema de fraude organizado: se anula la factura y se sustrae el efectivo correspondiente.',
    });
    immediateActions.push(
      'Convocar reuni\u00f3n urgente del comit\u00e9 de auditor\u00eda interna'
    );

    // Flag specific high-risk locals
    const highRiskLocals = data.correlation.patterns_by_local.filter(
      (p) => p.strength > 60
    );
    for (const local of highRiskLocals) {
      immediateActions.push(
        `Investigaci\u00f3n prioritaria en ${local.location} (puntuaci\u00f3n de riesgo: ${local.strength}/100)`
      );
    }
  }

  // --- 7. Additional pattern-based conclusions ---
  // Check for locations appearing in multiple risk categories
  const multiRiskLocals = data.correlation.patterns_by_local.filter(
    (p) => p.strength > 40 && p.pattern !== 'Sin anomal\u00edas significativas'
  );
  // BUG-C14 fix: remove `&& !correlation_exists`. Multi-risk locals should be shown
  // ALWAYS — especially when correlation_exists (complementary, not redundant info).
  if (multiRiskLocals.length > 0) {
    conclusions.push({
      title: 'Locales con m\u00faltiples factores de riesgo',
      severity: 'medium',
      description: `${multiRiskLocals.length} local(es) presentan m\u00faltiples indicadores de riesgo simult\u00e1neos, aunque no se ha detectado un patr\u00f3n de correlaci\u00f3n claro. Se recomienda monitoreo reforzado.`,
    });
  }

  // --- Sort conclusions by severity ---
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  conclusions.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.title.localeCompare(b.title)
  );

  // --- Structural (long-term) actions ---
  // Always recommend these based on the findings
  if (conclusions.some((c) => c.severity === 'critical')) {
    structuralActions.push(
      'Implementar sistema de videovigilancia en puntos de caja'
    );
    structuralActions.push(
      'Establecer pol\u00edtica de rotaci\u00f3n de empleados en caja'
    );
  }

  if (data.invoices.total_count > 0) {
    structuralActions.push(
      'Implementar doble validaci\u00f3n para anulaciones (aprobaci\u00f3n de gerente)'
    );
    structuralActions.push(
      'Configurar alertas autom\u00e1ticas cuando un empleado supere el umbral de anulaciones'
    );
  }

  if (worstCashLocal && Math.abs(worstCashLocal.total_discrepancy) > 200) {
    structuralActions.push('Instalar sistema de arqueo digital autom\u00e1tico');
    structuralActions.push(
      'Implementar cierre de caja con doble conteo y firma'
    );
  }

  if (data.waste.underreporting_alert) {
    structuralActions.push(
      'Implementar sistema digital de registro de mermas con trazabilidad completa'
    );
  }

  if (data.inventory.total_deviation_range.max > INVENTORY_HIGH_THRESHOLD) {
    structuralActions.push(
      'Implementar sistema de inventario perpetuo con conteos c\u00edclicos semanales'
    );
    structuralActions.push(
      'Instalar b\u00e1sculas digitales conectadas al sistema de gesti\u00f3n'
    );
  }

  structuralActions.push(
    'Establecer programa de auditor\u00edas sorpresa peri\u00f3dicas'
  );
  structuralActions.push(
    'Crear canal an\u00f3nimo de denuncia para empleados'
  );

  // Deduplicate actions
  const uniqueImmediate = [...new Set(immediateActions)];
  const uniqueStructural = [...new Set(structuralActions)];

  // If no conclusions were generated, add a positive one
  if (conclusions.length === 0) {
    conclusions.push({
      title: 'Sin anomal\u00edas significativas detectadas',
      severity: 'low',
      description:
        'El an\u00e1lisis no ha detectado patrones an\u00f3malos significativos en los datos proporcionados. Los indicadores est\u00e1n dentro de los rangos normales. Se recomienda mantener los controles actuales y realizar auditor\u00edas peri\u00f3dicas de seguimiento.',
    });
  }

  return {
    conclusions,
    immediate_actions: uniqueImmediate,
    structural_actions: uniqueStructural,
  };
}
