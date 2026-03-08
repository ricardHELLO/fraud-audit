'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/* ------------------------------------------------------------------ */
/*  Processing steps                                                    */
/* ------------------------------------------------------------------ */

interface ProcessingStep {
  id: string
  label: string
}

const PROCESSING_STEPS: ProcessingStep[] = [
  { id: 'upload', label: 'Archivos recibidos' },
  { id: 'parsing', label: 'Parseando datos...' },
  { id: 'analysis', label: 'Analizando patrones de fraude...' },
  { id: 'report', label: 'Generando informe...' },
]

/* ------------------------------------------------------------------ */
/*  Step indicator                                                      */
/* ------------------------------------------------------------------ */

function StepItem({
  step,
  status,
}: {
  step: ProcessingStep
  status: 'pending' | 'active' | 'completed'
}) {
  return (
    <div className="flex items-center gap-4">
      {/* Icon */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300',
          status === 'completed'
            ? 'bg-green-500 text-white'
            : status === 'active'
              ? 'bg-brand-100 text-brand-600'
              : 'bg-stone-100 text-stone-400'
        )}
      >
        {status === 'completed' ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        ) : status === 'active' ? (
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <div className="h-2 w-2 rounded-full bg-stone-300" />
        )}
      </div>

      {/* Label */}
      <span
        className={cn(
          'text-sm font-medium transition-colors duration-300',
          status === 'completed'
            ? 'text-green-700'
            : status === 'active'
              ? 'text-brand-700'
              : 'text-stone-400'
        )}
      >
        {step.label}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Processing page                                                     */
/* ------------------------------------------------------------------ */

export default function ProcessingPage() {
  const params = useParams<{ reportId: string }>()
  const reportId = params.reportId

  const [isCompleted, setIsCompleted] = useState(false)
  const [reportSlug, setReportSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const pollCount = useRef(0)

  // --- Poll for real report status ---
  useEffect(() => {
    let cancelled = false
    let intervalId: NodeJS.Timeout

    // Mark first step (upload) as completed immediately
    setCurrentStepIndex(1)

    async function pollStatus() {
      try {
        const res = await fetch(`/api/reports/${reportId}/status`)

        if (!res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setError(data.error || 'Error al consultar el estado del informe')
          }
          return
        }

        const data = await res.json()

        if (cancelled) return

        if (data.status === 'completed') {
          setReportSlug(data.slug)
          setCurrentStepIndex(PROCESSING_STEPS.length)
          setIsCompleted(true)
          clearInterval(intervalId)
        } else if (data.status === 'failed') {
          setError('El analisis fallo. Intentalo de nuevo con un archivo diferente.')
          clearInterval(intervalId)
        } else {
          // Still processing — animate through steps
          pollCount.current += 1
          // Progress through steps based on poll count (each poll = ~3s)
          if (pollCount.current >= 3) {
            setCurrentStepIndex(3) // Generating report
          } else if (pollCount.current >= 1) {
            setCurrentStepIndex(2) // Analyzing
          }
        }
      } catch {
        // Network error — keep polling
        console.error('Poll failed, retrying...')
      }
    }

    // Initial poll after a short delay
    const timeoutId = setTimeout(() => {
      pollStatus()
      intervalId = setInterval(pollStatus, 3000)
    }, 1500)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [reportId])

  // --- Step status ---
  function getStepStatus(index: number): 'pending' | 'active' | 'completed' {
    if (isCompleted) return 'completed'
    if (index < currentStepIndex) return 'completed'
    if (index === currentStepIndex) return 'active'
    return 'pending'
  }

  // --- Overall progress percentage ---
  const progressPercent = isCompleted
    ? 100
    : Math.round((currentStepIndex / PROCESSING_STEPS.length) * 100)

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <nav className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            Dashboard
          </Link>
          <span className="text-stone-300">/</span>
          <span className="text-sm font-semibold text-stone-900">
            Procesando
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <Card>
          <CardContent className="space-y-8 py-8">
            {/* Header */}
            <div className="text-center">
              {isCompleted ? (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-8 w-8 text-green-600"
                    >
                      <path
                        fillRule="evenodd"
                        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-stone-900">
                    Informe generado con exito
                  </h2>
                  <p className="mt-2 text-sm text-stone-500">
                    Tu informe de fraude esta listo para revisar
                  </p>
                </>
              ) : error ? (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-8 w-8 text-red-600"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-stone-900">
                    Error en el procesamiento
                  </h2>
                  <p className="mt-2 text-sm text-red-600">{error}</p>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
                    <svg
                      className="h-8 w-8 animate-spin text-brand-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-stone-900">
                    Analizando tus datos
                  </h2>
                  <p className="mt-2 text-sm text-stone-500">
                    Esto puede tomar unos minutos. No cierres esta pagina.
                  </p>
                </>
              )}
            </div>

            {/* Progress bar */}
            {!error && (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
                  <span>Progreso</span>
                  <span className="tabular-nums">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700 ease-out',
                      isCompleted ? 'bg-green-500' : 'bg-brand-500'
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Step list */}
            {!error && (
              <div className="space-y-4">
                {PROCESSING_STEPS.map((step, index) => (
                  <StepItem
                    key={step.id}
                    step={step}
                    status={getStepStatus(index)}
                  />
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-center gap-3 pt-2">
              {isCompleted && reportSlug && (
                <Link href={`/informe/${reportSlug}`}>
                  <Button variant="primary" size="lg">
                    Ver informe
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Button>
                </Link>
              )}

              {error && (
                <>
                  <Link href="/dashboard/upload">
                    <Button variant="primary" size="md">
                      Intentar de nuevo
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button variant="ghost" size="md">
                      Volver al dashboard
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Report ID reference */}
        <p className="mt-4 text-center text-xs text-stone-400">
          ID de informe: {reportId}
        </p>
      </div>
    </div>
  )
}
