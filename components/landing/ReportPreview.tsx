'use client'

/**
 * A static, styled mock of a FraudAudit report for the landing page.
 * Uses the same design tokens (stone/brand) as the real report.
 * Pure CSS — no images required.
 */
export function ReportPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
      {/* Header bar */}
      <div className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Paella Dorada — Valencia Centro
            </h3>
            <p className="text-xs text-stone-500">
              Periodo: 2024-01 — 2024-06 &middot; 3 locales
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Riesgo Alto
          </span>
        </div>

        {/* Fake tab bar */}
        <div className="mt-3 flex gap-1 overflow-x-auto text-xs font-medium text-stone-400">
          {['Resumen', 'Caja', 'Facturas', 'Productos', 'Mermas', 'Inventario', 'IA Insights'].map(
            (tab, i) => (
              <span
                key={tab}
                className={`shrink-0 rounded-t px-3 py-1.5 ${
                  i === 0
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-stone-400'
                }`}
              >
                {tab}
              </span>
            )
          )}
        </div>
      </div>

      {/* Content body */}
      <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
        {/* Metric cards */}
        {[
          { label: 'Descuadre total', value: '-€2,340', color: 'text-red-600' },
          { label: 'Facturas eliminadas', value: '47', color: 'text-amber-600' },
          { label: 'Productos cancelados', value: '€890', color: 'text-amber-600' },
          { label: 'Desviacion inventario', value: '12.3%', color: 'text-red-600' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-stone-100 bg-stone-50 p-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500">
              {metric.label}
            </p>
            <p className={`mt-1 text-lg font-bold ${metric.color}`}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Fake chart area */}
      <div className="px-6 pb-6">
        <div className="rounded-lg border border-stone-100 bg-stone-50 p-4">
          <p className="mb-3 text-xs font-semibold text-stone-700">
            Descuadre de caja por local
          </p>
          {/* Fake bar chart */}
          <div className="space-y-2">
            {[
              { name: 'Valencia Centro', pct: 85, value: '-€1,240' },
              { name: 'Valencia Puerto', pct: 55, value: '-€780' },
              { name: 'Castellon', pct: 25, value: '-€320' },
            ].map((bar) => (
              <div key={bar.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-right text-[11px] text-stone-600">
                  {bar.name}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-stone-200">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-red-400"
                    style={{ width: `${bar.pct}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[11px] font-medium text-red-600">
                  {bar.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
