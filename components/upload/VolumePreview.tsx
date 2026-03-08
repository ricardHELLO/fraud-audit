'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { VolumeInfo } from '@/lib/volume-detector'

/* ------------------------------------------------------------------ */
/*  VolumePreview                                                      */
/* ------------------------------------------------------------------ */

export interface VolumePreviewProps {
  volumeInfo: VolumeInfo
  userCredits: number
}

export function VolumePreview({ volumeInfo, userCredits }: VolumePreviewProps) {
  const {
    dateFrom,
    dateTo,
    locations,
    totalRows,
    monthsCovered,
    creditsRequired,
  } = volumeInfo

  const hasSufficientCredits = userCredits >= creditsRequired
  const creditsDiff = userCredits - creditsRequired

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de datos detectados</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Data summary grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Date range */}
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Periodo
            </p>
            <p className="mt-1 text-sm font-semibold text-stone-800">
              {dateFrom && dateTo
                ? `${dateFrom} - ${dateTo}`
                : 'No detectado'}
            </p>
          </div>

          {/* Months */}
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Meses
            </p>
            <p className="mt-1 text-sm font-semibold text-stone-800">
              {monthsCovered}
            </p>
          </div>

          {/* Row count */}
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Filas
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-stone-800">
              {totalRows.toLocaleString('es-ES')}
            </p>
          </div>

          {/* Locations */}
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Locales
            </p>
            <p className="mt-1 text-sm font-semibold text-stone-800">
              {locations.length}
            </p>
          </div>
        </div>

        {/* Locations list */}
        {locations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-stone-500">
              Locales detectados:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {locations.map((loc) => (
                <Badge key={loc} variant="default">
                  {loc}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Credits required vs available */}
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border p-4',
            hasSufficientCredits
              ? 'border-green-200 bg-green-50'
              : 'border-yellow-200 bg-yellow-50'
          )}
        >
          <div className="space-y-1">
            <p
              className={cn(
                'text-sm font-medium',
                hasSufficientCredits ? 'text-green-800' : 'text-yellow-800'
              )}
            >
              {hasSufficientCredits
                ? 'Tienes creditos suficientes'
                : 'Creditos insuficientes'}
            </p>
            <p
              className={cn(
                'text-xs',
                hasSufficientCredits ? 'text-green-600' : 'text-yellow-700'
              )}
            >
              Necesitas {creditsRequired}{' '}
              {creditsRequired === 1 ? 'ejecucion' : 'ejecuciones'} &middot;
              Tienes {userCredits} disponibles
            </p>
          </div>

          {hasSufficientCredits ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
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
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Upgrade prompt when insufficient */}
        {!hasSufficientCredits && (
          <p className="text-center text-sm text-stone-500">
            Necesitas{' '}
            <span className="font-semibold text-stone-700">
              {Math.abs(creditsDiff)} {Math.abs(creditsDiff) === 1 ? 'ejecucion' : 'ejecuciones'} adicional{Math.abs(creditsDiff) !== 1 ? 'es' : ''}
            </span>
            . Adquiere un paquete de creditos para continuar.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
