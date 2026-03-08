'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { POSSelector } from '@/components/onboarding/POSSelector'
import { InventorySelector } from '@/components/onboarding/InventorySelector'
import { ExportGuide } from '@/components/onboarding/ExportGuide'
import { Button } from '@/components/ui/button'
import { trackOnboardingStep, trackOnboardingAbandoned } from '@/lib/posthog-events'

/* ------------------------------------------------------------------ */
/*  Step definitions                                                    */
/* ------------------------------------------------------------------ */

const STEPS = [
  { id: 1, label: 'POS', description: 'Selecciona tu sistema POS' },
  { id: 2, label: 'Inventario', description: 'Conecta tu inventario (opcional)' },
  { id: 3, label: 'Guia', description: 'Como exportar tus datos' },
] as const

/* ------------------------------------------------------------------ */
/*  Progress indicator                                                  */
/* ------------------------------------------------------------------ */

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Progreso" className="mb-8">
      <ol className="flex items-center justify-center gap-2 sm:gap-4">
        {STEPS.map((step, index) => {
          const isCompleted = currentStep > step.id
          const isCurrent = currentStep === step.id
          const isUpcoming = currentStep < step.id

          return (
            <React.Fragment key={step.id}>
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    'hidden h-0.5 w-8 sm:block sm:w-12',
                    isCompleted || isCurrent ? 'bg-brand-500' : 'bg-stone-200'
                  )}
                />
              )}

              {/* Step circle + label */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
                    isCompleted
                      ? 'bg-brand-600 text-white'
                      : isCurrent
                        ? 'border-2 border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-2 border-stone-300 bg-white text-stone-400'
                  )}
                >
                  {isCompleted ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>
                <span
                  className={cn(
                    'hidden text-sm font-medium sm:inline',
                    isCurrent
                      ? 'text-brand-700'
                      : isCompleted
                        ? 'text-stone-700'
                        : 'text-stone-400'
                  )}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/*  Onboarding page                                                     */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [posConnector, setPosConnector] = useState<string | null>(null)
  const [inventoryConnector, setInventoryConnector] = useState<string | null>(null)

  // Track onboarding abandonment on unmount
  React.useEffect(() => {
    return () => {
      const onboardingData = localStorage.getItem('fraudaudit_onboarding')
      if (!onboardingData || !JSON.parse(onboardingData).onboardingCompleted) {
        trackOnboardingAbandoned(currentStep)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stepMeta = STEPS.find((s) => s.id === currentStep)!

  const canGoNext =
    currentStep === 1
      ? posConnector !== null
      : currentStep === 2
        ? true // inventory is optional
        : true

  function handleNext() {
    if (currentStep < 3) {
      trackOnboardingStep(currentStep as 1 | 2 | 3, {
        pos_selected: posConnector ?? undefined,
        inventory_selected: inventoryConnector ?? undefined,
      })
      setCurrentStep((s) => s + 1)
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1)
    }
  }

  function handleComplete() {
    trackOnboardingStep(3, {
      pos_selected: posConnector ?? undefined,
      inventory_selected: inventoryConnector ?? undefined,
    })
    // Persist selections to localStorage
    const selections = {
      posConnector,
      inventoryConnector,
      onboardingCompleted: true,
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem('fraudaudit_onboarding', JSON.stringify(selections))

    // Redirect to dashboard
    router.push('/dashboard')
  }

  function handleInventorySkip() {
    setInventoryConnector(null)
    setCurrentStep(3)
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-stone-50 px-4 py-12 sm:py-20">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Configura tu cuenta
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Selecciona tus sistemas para personalizar tu experiencia
          </p>
        </div>

        {/* Progress indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Card */}
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          {/* Step header */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-stone-900">
              {stepMeta.description}
            </h2>
          </div>

          {/* Step content */}
          {currentStep === 1 && (
            <POSSelector selected={posConnector} onSelect={setPosConnector} />
          )}

          {currentStep === 2 && (
            <InventorySelector
              selected={inventoryConnector}
              onSelect={setInventoryConnector}
              onSkip={handleInventorySkip}
            />
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <ExportGuide
                posConnector={posConnector}
                inventoryConnector={inventoryConnector}
              />
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 flex items-center justify-between border-t border-stone-100 pt-6">
            {/* Back button */}
            {currentStep > 1 ? (
              <Button variant="ghost" size="md" onClick={handleBack}>
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
                Atras
              </Button>
            ) : (
              <div />
            )}

            {/* Next / Complete button */}
            {currentStep < 3 ? (
              <Button
                variant="primary"
                size="md"
                disabled={!canGoNext}
                onClick={handleNext}
              >
                Siguiente
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
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleComplete}
              >
                Continuar al dashboard
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
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
