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
import type { DeletedInvoicesResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { formatCurrency } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface InvoicesTabProps {
  data: DeletedInvoicesResult
}

export function InvoicesTab({ data }: InvoicesTabProps) {
  /* Chart data: invoices by local (horizontal bar) */
  const byLocalChart = data.by_local
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((l) => ({
      name: l.location,
      cantidad: l.count,
      monto: l.amount,
    }))

  /* Employees sorted by amount descending */
  const sortedEmployees = data.by_employee
    .slice()
    .sort((a, b) => b.amount - a.amount)

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Total Facturas Eliminadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-stone-800">
              {data.total_count}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Monto Total Eliminado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-red-600">
              {formatCurrency(data.total_amount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Concentration alert */}
      {data.concentration_alert && (
        <Alert
          variant="warning"
          title="Alerta de Concentracion"
          description={data.concentration_alert}
        />
      )}

      {/* Horizontal bar chart - invoices by local */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas Eliminadas por Local</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byLocalChart}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                  width={75}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'monto' ? formatCurrency(value) : value,
                    name === 'monto' ? 'Monto' : 'Cantidad',
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e7e5e4',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="cantidad" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Employee table */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas Eliminadas por Empleado</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                <th className="pb-3 pr-4">Empleado</th>
                <th className="pb-3 pr-4">Local</th>
                <th className="pb-3 pr-4 text-right">Cantidad</th>
                <th className="pb-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sortedEmployees.map((emp, i) => (
                <tr key={`${emp.employee}-${i}`} className="hover:bg-stone-50">
                  <td className="py-3 pr-4 font-medium text-stone-800">
                    {emp.employee}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">{emp.location}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {emp.count}
                  </td>
                  <td className="py-3 text-right tabular-nums text-red-600">
                    {formatCurrency(emp.amount)}
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
