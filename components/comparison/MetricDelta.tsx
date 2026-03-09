'use client'

import React from 'react'
import type { MetricDelta as MetricDeltaType } from '@/lib/types/comparison'
import { Card, CardContent } from '@/components/ui/card'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function TrendArrow({ trend }: { trend: MetricDeltaType['trend'] }) {
  if (trend === 'improving') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-600">
        <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
      </svg>
    )
  }
  if (trend === 'worsening') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-red-600">
        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
      </svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-stone-400">
      <path fillRule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clipRule="evenodd" />
    </svg>
  )
}

const trendColor: Record<string, string> = {
  improving: 'text-green-700 bg-green-50 border-green-200',
  worsening: 'text-red-700 bg-red-50 border-red-200',
  stable: 'text-stone-600 bg-stone-50 border-stone-200',
}

const deltaColor: Record<string, string> = {
  improving: 'text-green-600',
  worsening: 'text-red-600',
  stable: 'text-stone-500',
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-ES', {
    maximumFractionDigits: 2,
  })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface MetricDeltaProps {
  delta: MetricDeltaType
  unit?: string
}

export function MetricDeltaCard({ delta, unit = '' }: MetricDeltaProps) {
  const sign = delta.absolute_delta > 0 ? '+' : ''

  return (
    <Card className={`border ${trendColor[delta.trend]}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {delta.label}
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-sm text-stone-400">
                {formatNumber(delta.value_a)}{unit}
              </span>
              <span className="text-stone-300">&rarr;</span>
              <span className="text-lg font-bold">
                {formatNumber(delta.value_b)}{unit}
              </span>
            </div>
            <div className={`mt-1 text-sm font-medium ${deltaColor[delta.trend]}`}>
              {sign}{formatNumber(delta.absolute_delta)}{unit}
              {delta.percentage_delta !== null && (
                <span className="ml-1 text-xs">
                  ({sign}{delta.percentage_delta}%)
                </span>
              )}
            </div>
          </div>
          <TrendArrow trend={delta.trend} />
        </div>
      </CardContent>
    </Card>
  )
}
