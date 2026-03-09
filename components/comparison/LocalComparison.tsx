'use client'

import React from 'react'
import type { LocalDelta } from '@/lib/types/comparison'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDelta(value: number, unit: string = ''): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })}${unit}`
}

function deltaClass(value: number, lowerIsBetter: boolean): string {
  if (value === 0) return 'text-stone-500'
  if (lowerIsBetter) {
    return value < 0 ? 'text-green-600' : 'text-red-600'
  }
  return value > 0 ? 'text-green-600' : 'text-red-600'
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface LocalComparisonProps {
  locals: LocalDelta[]
}

export function LocalComparison({ locals }: LocalComparisonProps) {
  if (locals.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-stone-500">
          No hay datos por local para comparar.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparacion por Local</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-3 text-left font-medium text-stone-600">Local</th>
                <th className="px-4 py-3 text-right font-medium text-stone-600">Caja (delta)</th>
                <th className="px-4 py-3 text-right font-medium text-stone-600">Facturas (delta)</th>
                <th className="px-4 py-3 text-right font-medium text-stone-600">Merma (delta)</th>
              </tr>
            </thead>
            <tbody>
              {locals.map((local) => (
                <tr
                  key={local.location}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-stone-800">
                    <div className="flex items-center gap-2">
                      {local.location}
                      {!local.present_in_a && local.present_in_b && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0.5">
                          Nuevo
                        </Badge>
                      )}
                      {local.present_in_a && !local.present_in_b && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500">
                          Eliminado
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${deltaClass(local.cash_delta, true)}`}>
                    {formatDelta(local.cash_delta, '€')}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${deltaClass(local.invoices_count_delta, true)}`}>
                    {formatDelta(local.invoices_count_delta)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${deltaClass(local.waste_delta, true)}`}>
                    {formatDelta(local.waste_delta, '%')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
