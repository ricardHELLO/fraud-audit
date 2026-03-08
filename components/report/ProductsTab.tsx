'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { DeletedProductsResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { formatCurrency } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ProductsTabProps {
  data: DeletedProductsResult
}

export function ProductsTab({ data }: ProductsTabProps) {
  const { by_phase, by_local } = data

  /* Chart data by local -- stacked bars per phase */
  const chartData = by_local.map((l) => ({
    name: l.location,
    /* We only have aggregated count/amount per local, not split by phase.
       Use after_billing_percentage to approximate the phase breakdown. */
    total: l.amount,
    count: l.count,
    afterBillingPct: l.after_billing_percentage,
  }))

  return (
    <div className="space-y-6">
      {/* Critical alert */}
      {data.critical_alert && (
        <Alert
          variant="danger"
          title="Alerta Critica"
          description={data.critical_alert}
        />
      )}

      {/* Phase stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-yellow-400">
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Antes de Cocina
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-stone-800">
              {by_phase.before_kitchen.count}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {formatCurrency(by_phase.before_kitchen.amount)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400">
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Despues de Cocina
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-stone-800">
              {by_phase.after_kitchen.count}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {formatCurrency(by_phase.after_kitchen.amount)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-400">
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Despues de Facturacion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-red-600">
              {by_phase.after_billing.count}
            </p>
            <p className="mt-1 text-sm text-red-500">
              {formatCurrency(by_phase.after_billing.amount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Total products eliminated */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-stone-500">
            Total productos eliminados:{' '}
            <span className="font-bold text-stone-800 text-lg">
              {data.total_eliminated}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Bar chart by local */}
      <Card>
        <CardHeader>
          <CardTitle>Productos Eliminados por Local</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'total') return [formatCurrency(value), 'Monto Total']
                    if (name === 'count') return [value, 'Cantidad']
                    return [value, name]
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e7e5e4',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    if (value === 'total') return 'Monto Total'
                    if (value === 'count') return 'Cantidad'
                    return value
                  }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle por Local</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                <th className="pb-3 pr-4">Local</th>
                <th className="pb-3 pr-4 text-right">Cantidad</th>
                <th className="pb-3 pr-4 text-right">Monto</th>
                <th className="pb-3 text-right">% Post-Facturacion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {by_local.map((l) => (
                <tr key={l.location} className="hover:bg-stone-50">
                  <td className="py-3 pr-4 font-medium text-stone-800">
                    {l.location}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {l.count}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-red-600">
                    {formatCurrency(l.amount)}
                  </td>
                  <td
                    className={`py-3 text-right tabular-nums ${
                      l.after_billing_percentage > 30
                        ? 'text-red-600 font-semibold'
                        : 'text-stone-600'
                    }`}
                  >
                    {l.after_billing_percentage.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
