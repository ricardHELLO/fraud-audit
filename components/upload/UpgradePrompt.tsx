'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/* ------------------------------------------------------------------ */
/*  Credit packages                                                    */
/* ------------------------------------------------------------------ */

interface CreditPackage {
  id: string
  executions: number
  price: number
  badge: string | null
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'pack_5', executions: 5, price: 49, badge: null },
  { id: 'pack_15', executions: 15, price: 119, badge: 'Mas popular' },
  { id: 'pack_50', executions: 50, price: 299, badge: 'Mejor valor' },
]

/* ------------------------------------------------------------------ */
/*  UpgradePrompt                                                      */
/* ------------------------------------------------------------------ */

export interface UpgradePromptProps {
  creditsNeeded: number
  currentCredits: number
  onSelectPlan: (planId: string) => void
}

export function UpgradePrompt({
  creditsNeeded,
  currentCredits,
  onSelectPlan,
}: UpgradePromptProps) {
  const deficit = creditsNeeded - currentCredits

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adquiere ejecuciones</CardTitle>
        <CardDescription>
          Necesitas al menos{' '}
          <span className="font-semibold text-stone-700">
            {deficit} {deficit === 1 ? 'ejecucion' : 'ejecuciones'}
          </span>{' '}
          adicional{deficit !== 1 ? 'es' : ''} para procesar este analisis.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CREDIT_PACKAGES.map((pkg) => {
            const perExecution = (pkg.price / pkg.executions).toFixed(2)
            const coversDeficit = pkg.executions >= deficit

            return (
              <div
                key={pkg.id}
                className={cn(
                  'relative flex flex-col items-center rounded-xl border-2 p-6 text-center transition-all duration-150',
                  pkg.badge
                    ? 'border-brand-300 bg-brand-50 shadow-md'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                )}
              >
                {/* Badge */}
                {pkg.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="info">{pkg.badge}</Badge>
                  </div>
                )}

                {/* Executions */}
                <p className="text-3xl font-bold text-stone-900">
                  {pkg.executions}
                </p>
                <p className="mt-1 text-sm text-stone-500">ejecuciones</p>

                {/* Price */}
                <p className="mt-4 text-2xl font-bold text-stone-900">
                  {pkg.price}&euro;
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {perExecution}&euro; / ejecucion
                </p>

                {/* Sufficiency indicator */}
                {coversDeficit && (
                  <p className="mt-3 text-xs font-medium text-green-600">
                    Cubre tu analisis actual
                  </p>
                )}

                {/* CTA */}
                <Button
                  variant={pkg.badge ? 'primary' : 'secondary'}
                  size="md"
                  className="mt-4 w-full"
                  onClick={() => onSelectPlan(pkg.id)}
                >
                  Seleccionar
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
