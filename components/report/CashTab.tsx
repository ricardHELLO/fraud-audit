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
  ReferenceLine,
  Cell,
} from 'recharts'
import type { CashDiscrepancyResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { formatCurrency } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface CashTabProps {
  data: CashDiscrepancyResult
}

export function CashTab({ data }: CashTabProps) {
  /* Split discrepancy into positive (sobrante) and negative (faltante) */
  const chartData = data.locals.map((local) => ({
    name: local.name,
    sobrante: local.total_discrepancy > 0 ? local.total_discrepancy : 0,
    faltante: local.total_discrepancy < 0 ? local.total_discrepancy : 0,
    total: local.total_discrepancy,
  }))

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      {data.alert_message && (
        <Alert variant="danger" title="Alerta de Caja" description={data.alert_message} />
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Descuadre de Caja por Local</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1).toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'sobrante' ? 'Sobrante' : 'Faltante',
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e7e5e4',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  formatter={(value: string) =>
                    value === 'sobrante' ? 'Sobrante' : 'Faltante'
                  }
                />
                <ReferenceLine y={0} stroke="#a8a29e" />
                <Bar dataKey="sobrante" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="faltante" fill="#ef4444" radius={[0, 0, 4, 4]} />
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
                <th className="pb-3 pr-4 text-right">Descuadre Total</th>
                <th className="pb-3 pr-4 text-right">Dias con Faltante</th>
                <th className="pb-3 text-right">Total Dias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.locals.map((local) => {
                const isWorst = local.name === data.worst_local
                return (
                  <tr
                    key={local.name}
                    className={
                      isWorst
                        ? 'bg-red-50 font-semibold'
                        : 'hover:bg-stone-50'
                    }
                  >
                    <td className="py-3 pr-4">
                      {local.name}
                      {isWorst && (
                        <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
                          Peor
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right tabular-nums ${
                        local.total_discrepancy < 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {formatCurrency(local.total_discrepancy)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {local.days_with_shortage}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {local.total_days}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
