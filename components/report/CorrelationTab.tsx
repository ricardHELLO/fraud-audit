'use client'

import React from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from 'recharts'
import type { CorrelationResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Custom tooltip for scatter chart                                   */
/* ------------------------------------------------------------------ */

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-stone-800">{point.label}</p>
      <p className="text-stone-600">
        Facturas eliminadas: {formatCurrency(point.x)}
      </p>
      <p className="text-stone-600">
        Descuadre caja: {formatCurrency(point.y)}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface CorrelationTabProps {
  data: CorrelationResult
}

export function CorrelationTab({ data }: CorrelationTabProps) {
  return (
    <div className="space-y-6">
      {/* Explanation */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-stone-600 leading-relaxed">
            Este analisis mide la relacion entre el monto de facturas eliminadas
            y el descuadre de caja en cada local. Una correlacion positiva fuerte
            sugiere que las eliminaciones de facturas podrian estar relacionadas
            con sustracciones de efectivo.
          </p>
        </CardContent>
      </Card>

      {/* Correlation alert */}
      {data.correlation_exists ? (
        <Alert
          variant="danger"
          title="Correlacion Detectada"
          description="Se ha identificado una correlacion significativa entre facturas eliminadas y descuadre de caja. Esto sugiere un patron de fraude sistematico."
        />
      ) : (
        <Alert
          variant="success"
          title="Sin Correlacion Significativa"
          description="No se ha detectado una correlacion estadisticamente significativa entre facturas eliminadas y descuadre de caja."
        />
      )}

      {/* Scatter chart */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas Eliminadas vs Descuadre de Caja</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Facturas Eliminadas"
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
                  }
                >
                  <Label
                    value="Monto Facturas Eliminadas"
                    offset={-15}
                    position="insideBottom"
                    style={{ fontSize: '12px', fill: '#78716c' }}
                  />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Descuadre Caja"
                  tick={{ fontSize: 12, fill: '#78716c' }}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
                  }
                >
                  <Label
                    value="Descuadre Caja"
                    angle={-90}
                    position="insideLeft"
                    offset={-10}
                    style={{ fontSize: '12px', fill: '#78716c' }}
                  />
                </YAxis>
                <Tooltip content={<ScatterTooltip />} />
                <Scatter
                  name="Locales"
                  data={data.scatter_data}
                  fill="#3b82f6"
                  fillOpacity={0.7}
                  r={8}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Patterns by local */}
      {data.patterns_by_local.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Patrones por Local</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.patterns_by_local.map((local) => {
                const badgeVariant: 'danger' | 'warning' | 'success' =
                  local.strength > 70
                    ? 'danger'
                    : local.strength > 40
                      ? 'warning'
                      : 'success'

                return (
                  <div
                    key={local.location}
                    className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-stone-800">
                        {local.location}
                      </h4>
                      <Badge variant={badgeVariant}>
                        Fuerza: {local.strength}/100
                      </Badge>
                    </div>
                    <p className="text-xs text-stone-600">{local.pattern}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
