'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { InventoryDeviationResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { formatCurrency } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface InventoryTabProps {
  data: InventoryDeviationResult
}

export function InventoryTab({ data }: InventoryTabProps) {
  const monthChart = data.by_month.map((m) => ({
    name: m.month,
    desviacion: m.total_deviation,
    productos: m.product_count,
  }))

  return (
    <div className="space-y-6">
      {/* Main cause alert */}
      {data.main_cause && (
        <Alert
          variant="info"
          title="Causa Principal"
          description={data.main_cause}
        />
      )}

      {/* Deviation range */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider">
                Desviacion Minima
              </p>
              <p className="text-xl font-bold tabular-nums text-stone-800">
                {formatCurrency(data.total_deviation_range.min)}
              </p>
            </div>
            <div className="hidden sm:block h-8 w-px bg-stone-200" />
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider">
                Desviacion Maxima
              </p>
              <p className="text-xl font-bold tabular-nums text-red-600">
                {formatCurrency(data.total_deviation_range.max)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly chart */}
      <Card>
        <CardHeader>
          <CardTitle>Desviacion de Inventario por Mes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthChart}
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
                    if (name === 'desviacion')
                      return [formatCurrency(value), 'Desviacion']
                    return [value, 'Productos']
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e7e5e4',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="desviacion" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top 10 products table */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Productos por Desviacion</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Producto</th>
                <th className="pb-3 pr-4 text-right">Desviacion</th>
                <th className="pb-3 text-right">Unidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.by_product_top10.map((p, i) => (
                <tr key={p.product_name} className="hover:bg-stone-50">
                  <td className="py-3 pr-4 text-stone-400 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-3 pr-4 font-medium text-stone-800">
                    {p.product_name}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-red-600">
                    {formatCurrency(p.total_deviation)}
                  </td>
                  <td className="py-3 text-right text-stone-600">
                    {p.unit}
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
