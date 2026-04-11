'use client'

import React from 'react'
import type {
  ReportSummary,
  CashDiscrepancyResult,
  DeletedInvoicesResult,
  WasteAnalysisResult,
} from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const severityBadgeVariant: Record<
  ReportSummary['overall_risk_level'],
  'danger' | 'warning' | 'success'
> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'success',
}

const severityLabel: Record<ReportSummary['overall_risk_level'], string> = {
  critical: 'Riesgo Critico',
  high: 'Riesgo Alto',
  medium: 'Riesgo Medio',
  low: 'Riesgo Bajo',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SummaryTabProps {
  data: ReportSummary
  cash: CashDiscrepancyResult
  invoices: DeletedInvoicesResult
  waste: WasteAnalysisResult
}

export function SummaryTab({ data, cash, invoices, waste }: SummaryTabProps) {
  // BUG-UI01 fix: guard against cash.locals being undefined/null (defensive)
  const totalCashDiscrepancy = (cash.locals ?? []).reduce(
    (sum, l) => sum + l.total_discrepancy,
    0
  )

  return (
    <div className="space-y-6">
      {/* Overall risk badge */}
      <div className="flex flex-col items-center gap-3 py-4">
        <span className="text-sm font-medium text-stone-500 uppercase tracking-wider">
          Nivel de Riesgo General
        </span>
        <Badge
          variant={severityBadgeVariant[data.overall_risk_level]}
          className="px-5 py-2 text-base"
        >
          {severityLabel[data.overall_risk_level]}
        </Badge>
      </div>

      {/* Quick stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              <span className="mr-1.5">{'💰'}</span>Total Descuadre Caja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold tabular-nums ${
                totalCashDiscrepancy < 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {formatCurrency(totalCashDiscrepancy)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              <span className="mr-1.5">{'🧾'}</span>Facturas Eliminadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-stone-800">
              {invoices.total_count}
            </p>
            <p className="text-sm text-stone-500 mt-1">
              {formatCurrency(invoices.total_amount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-stone-500 font-medium">
              <span className="mr-1.5">{'🗑️'}</span>Porcentaje de Merma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold tabular-nums ${
                waste.waste_percentage > 3 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {formatPercent(waste.waste_percentage)}
            </p>
            <p className="text-sm text-stone-500 mt-1">
              sobre ventas totales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Key findings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="mr-1.5">{'📊'}</span>Hallazgos Principales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.key_findings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
                {finding}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
