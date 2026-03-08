'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { WasteAnalysisResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { ProgressBar } from '@/components/ui/progress-bar'
import { formatCurrency, formatPercent } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface WasteTabProps {
  data: WasteAnalysisResult
}

export function WasteTab({ data }: WasteTabProps) {
  const BENCHMARK = 3 // 3% benchmark

  const chartData = data.by_local.map((l) => ({
    name: l.location,
    merma: l.total_waste,
    porcentaje: l.waste_percentage,
  }))

  /* Determine progress bar color based on waste percentage */
  function getBarColor(pct: number): 'green' | 'yellow' | 'red' {
    if (pct <= 2) return 'green'
    if (pct <= 4) return 'yellow'
    return 'red'
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Merma Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-red-600">
              {formatCurrency(data.total_waste)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              % Merma sobre Ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold tabular-nums ${
                data.waste_percentage > BENCHMARK
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {formatPercent(data.waste_percentage)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              Benchmark Sector
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-stone-700">{data.benchmark_comparison}</p>
          </CardContent>
        </Card>
      </div>

      {/* Under-reporting alert */}
      {data.underreporting_alert && (
        <Alert
          variant="warning"
          title="Posible infra-registro de mermas"
          description="El porcentaje de merma reportado es inusualmente bajo. Esto podria indicar que no se estan registrando todas las mermas, lo cual dificulta el control real de perdidas."
        />
      )}

      {/* Progress bars per local */}
      <Card>
        <CardHeader>
          <CardTitle>Merma por Local vs Benchmark ({BENCHMARK}%)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {data.by_local.map((l) => (
              <div key={l.location}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-stone-700">
                    {l.location}
                  </span>
                  <span className="tabular-nums text-stone-500">
                    {formatPercent(l.waste_percentage)} ({formatCurrency(l.total_waste)})
                  </span>
                </div>
                <div className="relative">
                  <ProgressBar
                    value={l.waste_percentage}
                    max={Math.max(10, l.waste_percentage + 2)}
                    color={getBarColor(l.waste_percentage)}
                  />
                  {/* Benchmark line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-stone-800"
                    style={{
                      left: `${(BENCHMARK / Math.max(10, l.waste_percentage + 2)) * 100}%`,
                    }}
                    title={`Benchmark: ${BENCHMARK}%`}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-stone-500 whitespace-nowrap">
                      {BENCHMARK}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>Merma por Local (Monto)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
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
                  formatter={(value: number) => [formatCurrency(value), 'Merma']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e7e5e4',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="merma" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
