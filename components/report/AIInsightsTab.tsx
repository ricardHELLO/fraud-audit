'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AIInsights } from '@/lib/types/ai-insights'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const severityBorderColor: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
}

const severityBadgeVariant: Record<string, 'danger' | 'warning' | 'success'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'success',
}

const severityLabel: Record<string, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
}

const categoryLabel: Record<string, string> = {
  immediate: 'Inmediata',
  structural: 'Estructural',
  monitoring: 'Monitoreo',
}

const categoryColor: Record<string, string> = {
  immediate: 'bg-red-50 text-red-700 border-red-200',
  structural: 'bg-blue-50 text-blue-700 border-blue-200',
  monitoring: 'bg-amber-50 text-amber-700 border-amber-200',
}

/* ------------------------------------------------------------------ */
/*  Loading state                                                      */
/* ------------------------------------------------------------------ */

function AIInsightsLoading() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
          <svg
            className="h-5 w-5 animate-spin text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-blue-800">
          Los insights de IA estan siendo generados...
        </p>
        <p className="mt-1 text-xs text-blue-600">
          Esto puede tardar unos segundos.
        </p>
      </div>
      <Skeleton variant="card" className="h-32" />
      <Skeleton variant="card" className="h-48" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Unavailable / error state                                          */
/* ------------------------------------------------------------------ */

function AIInsightsUnavailable({
  onRetry,
  isRetrying,
}: {
  onRetry?: () => void
  isRetrying?: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-stone-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-stone-400"
          >
            <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-700">
          Los insights de IA no estan disponibles
        </p>
        <p className="mt-1 text-xs text-stone-500">
          No se pudieron generar automaticamente. Puedes intentar generarlos de nuevo.
        </p>
        {onRetry && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <>
                <svg
                  className="mr-2 h-3.5 w-3.5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generando...
              </>
            ) : (
              'Generar Insights con IA'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AIInsightsTabProps {
  data: AIInsights | null
  reportId?: string // When provided, enables polling + retry
}

export function AIInsightsTab({ data: initialData, reportId }: AIInsightsTabProps) {
  const [insights, setInsights] = useState<AIInsights | null>(initialData)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    initialData ? 'ready' : 'loading'
  )
  const [isRetrying, setIsRetrying] = useState(false)
  const pollCount = useRef(0)
  const maxPolls = 10 // 10 polls x 3s = 30s max wait

  // Poll for insights when data starts null
  useEffect(() => {
    if (initialData || !reportId || status === 'ready' || status === 'unavailable') return

    const interval = setInterval(async () => {
      pollCount.current += 1

      try {
        const res = await fetch(`/api/reports/${reportId}/ai-insights`)
        if (!res.ok) {
          // Auth error or not found — stop polling
          clearInterval(interval)
          setStatus('unavailable')
          return
        }

        const body = await res.json()

        if (body.status === 'ready' && body.data) {
          setInsights(body.data)
          setStatus('ready')
          clearInterval(interval)
          return
        }

        if (body.status === 'unavailable') {
          setStatus('unavailable')
          clearInterval(interval)
          return
        }
      } catch {
        // Network error — keep polling
      }

      // Stop polling after max attempts
      if (pollCount.current >= maxPolls) {
        setStatus('unavailable')
        clearInterval(interval)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [initialData, reportId, status])

  // Retry handler — calls POST to regenerate
  const handleRetry = useCallback(async () => {
    if (!reportId) return
    setIsRetrying(true)

    try {
      const res = await fetch(`/api/reports/${reportId}/ai-insights`, {
        method: 'POST',
      })
      const body = await res.json()

      if (body.status === 'ready' && body.data) {
        setInsights(body.data)
        setStatus('ready')
      } else {
        // Still failed — show unavailable with a more specific message
        setStatus('unavailable')
      }
    } catch {
      setStatus('unavailable')
    } finally {
      setIsRetrying(false)
    }
  }, [reportId])

  // --- Render states ---

  if (status === 'loading') {
    return <AIInsightsLoading />
  }

  if (status === 'unavailable' || !insights) {
    return (
      <AIInsightsUnavailable
        onRetry={reportId ? handleRetry : undefined}
        isRetrying={isRetrying}
      />
    )
  }

  // --- Data is available ---

  return (
    <div className="space-y-8">
      {/* Narrative */}
      <section>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-blue-600">
                <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.184-.551a1 1 0 01.632-.633l.551-.183a1 1 0 000-1.898l-.551-.184a1 1 0 01-.633-.632l-.183-.551z" />
              </svg>
              <CardTitle>Analisis Narrativo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-stone prose-sm max-w-none">
              {insights.narrative.split('\n').map((paragraph, i) => (
                <p key={i} className="text-sm text-stone-700 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
            <p className="mt-4 text-xs text-stone-400">
              Generado por IA el{' '}
              {new Date(insights.generated_at).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-stone-800 mb-4">
            Recomendaciones Priorizadas
          </h2>
          <div className="space-y-3">
            {insights.recommendations.map((rec, i) => (
              <Card key={i} className={`border-l-4 ${severityBorderColor[rec.priority] || 'border-l-stone-300'}`}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant={severityBadgeVariant[rec.priority] || 'default'}>
                      {severityLabel[rec.priority] || rec.priority}
                    </Badge>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${categoryColor[rec.category] || 'bg-stone-50 text-stone-600 border-stone-200'}`}>
                      {categoryLabel[rec.category] || rec.category}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-stone-800">
                    {rec.title}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                    {rec.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Anomalies */}
      {insights.anomalies.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-stone-800 mb-4">
            Anomalias Detectadas
          </h2>
          <div className="space-y-3">
            {insights.anomalies.map((anomaly, i) => (
              <Card key={i} className={`border-l-4 ${severityBorderColor[anomaly.severity] || 'border-l-stone-300'}`}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant={severityBadgeVariant[anomaly.severity] || 'default'}>
                      {severityLabel[anomaly.severity] || anomaly.severity}
                    </Badge>
                    <span className="text-xs text-stone-500">
                      {anomaly.affected_area}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-stone-800">
                    {anomaly.title}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                    {anomaly.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
