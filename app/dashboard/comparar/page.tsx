'use client'

import React, { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { MetricDeltaCard } from '@/components/comparison/MetricDelta'
import { LocalComparison } from '@/components/comparison/LocalComparison'
import { ComparisonSkeleton } from '@/components/comparison/ComparisonSkeleton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ComparisonResult, Trend } from '@/lib/types/comparison'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportOption {
  slug: string
  organization_name: string
  analysis_period: string
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  Risk level badge                                                   */
/* ------------------------------------------------------------------ */

const riskLabel: Record<string, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
}

const riskBadgeVariant: Record<string, 'danger' | 'warning' | 'success'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'success',
}

const trendArrowColor: Record<Trend, string> = {
  improving: 'text-green-600',
  worsening: 'text-red-600',
  stable: 'text-stone-400',
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CompararPage() {
  const { user, isLoaded } = useUser()

  const [reports, setReports] = useState<ReportOption[]>([])
  const [isLoadingReports, setIsLoadingReports] = useState(true)
  const [slugA, setSlugA] = useState('')
  const [slugB, setSlugB] = useState('')
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch available reports
  useEffect(() => {
    if (!isLoaded || !user) return

    async function loadReports() {
      try {
        const res = await fetch('/api/dashboard')
        if (res.ok) {
          const data = await res.json()
          // Only show completed reports
          const completed = (data.reports ?? []).filter(
            (r: any) => r.status === 'completed'
          )
          setReports(completed)
        }
      } catch {
        console.error('Failed to load reports')
      } finally {
        setIsLoadingReports(false)
      }
    }

    loadReports()
  }, [isLoaded, user])

  // Fetch comparison when both are selected
  useEffect(() => {
    if (!slugA || !slugB || slugA === slugB) {
      setComparison(null)
      return
    }

    async function compare() {
      setIsComparing(true)
      setError(null)

      try {
        const res = await fetch(
          `/api/compare?reportA=${encodeURIComponent(slugA)}&reportB=${encodeURIComponent(slugB)}`
        )

        if (res.ok) {
          const data = await res.json()
          setComparison(data)
        } else {
          const data = await res.json()
          setError(data.error || 'Error al comparar informes')
        }
      } catch {
        setError('Error de conexion')
      } finally {
        setIsComparing(false)
      }
    }

    compare()
  }, [slugA, slugB])

  if (!isLoaded || isLoadingReports) {
    return (
      <div className="min-h-screen bg-stone-50">
        <DashboardNav userName={null} />
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
          <Skeleton variant="card" className="h-24" />
          <Skeleton variant="card" className="h-48" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav userName={user?.firstName ?? null} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Comparar Informes
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Selecciona dos informes para ver la evolucion de las metricas
          </p>
        </div>

        {/* Report selectors */}
        {reports.length < 2 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-stone-500">
                Necesitas al menos 2 informes completados para usar el comparador.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
              {/* Report A */}
              <div>
                <label
                  htmlFor="report-a"
                  className="block text-sm font-medium text-stone-700 mb-1"
                >
                  Informe anterior
                </label>
                <select
                  id="report-a"
                  value={slugA}
                  onChange={(e) => setSlugA(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Selecciona un informe</option>
                  {reports.map((r) => (
                    <option key={r.slug} value={r.slug} disabled={r.slug === slugB}>
                      {r.organization_name} — {r.analysis_period || new Date(r.created_at).toLocaleDateString('es-ES')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Report B */}
              <div>
                <label
                  htmlFor="report-b"
                  className="block text-sm font-medium text-stone-700 mb-1"
                >
                  Informe posterior
                </label>
                <select
                  id="report-b"
                  value={slugB}
                  onChange={(e) => setSlugB(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Selecciona un informe</option>
                  {reports.map((r) => (
                    <option key={r.slug} value={r.slug} disabled={r.slug === slugA}>
                      {r.organization_name} — {r.analysis_period || new Date(r.created_at).toLocaleDateString('es-ES')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Loading */}
            {isComparing && <ComparisonSkeleton />}

            {/* Results */}
            {comparison && !isComparing && (
              <div className="space-y-8">
                {/* Risk level change */}
                <Card className="border-stone-200">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-center gap-4">
                      <div className="text-center">
                        <p className="text-xs text-stone-500 mb-1">Antes</p>
                        <Badge
                          variant={riskBadgeVariant[comparison.deltas.risk_level.from]}
                          className="px-3 py-1"
                        >
                          {riskLabel[comparison.deltas.risk_level.from]}
                        </Badge>
                      </div>
                      <span className={`text-xl ${trendArrowColor[comparison.deltas.risk_level.trend]}`}>
                        &rarr;
                      </span>
                      <div className="text-center">
                        <p className="text-xs text-stone-500 mb-1">Despues</p>
                        <Badge
                          variant={riskBadgeVariant[comparison.deltas.risk_level.to]}
                          className="px-3 py-1"
                        >
                          {riskLabel[comparison.deltas.risk_level.to]}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Metric deltas grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MetricDeltaCard delta={comparison.deltas.cash_discrepancy} unit="€" />
                  <MetricDeltaCard delta={comparison.deltas.deleted_invoices_count} />
                  <MetricDeltaCard delta={comparison.deltas.deleted_invoices_amount} unit="€" />
                  <MetricDeltaCard delta={comparison.deltas.waste_percentage} unit="%" />
                </div>

                {/* Per-local comparison */}
                <LocalComparison locals={comparison.per_local} />
              </div>
            )}

            {/* Prompt to select */}
            {!slugA && !slugB && !isComparing && !comparison && (
              <Card>
                <CardContent className="py-12 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="mx-auto h-12 w-12 text-stone-300"
                  >
                    <path
                      fillRule="evenodd"
                      d="M15.97 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H7.5a.75.75 0 010-1.5h11.69l-3.22-3.22a.75.75 0 010-1.06zm-7.94 9a.75.75 0 010 1.06L4.81 15.75H16.5a.75.75 0 010 1.5H4.81l3.22 3.22a.75.75 0 11-1.06 1.06l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 011.06 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="mt-4 text-sm text-stone-500">
                    Selecciona dos informes para comparar sus metricas
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
