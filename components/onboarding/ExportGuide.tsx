'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import {
  POS_CONNECTORS,
  INVENTORY_CONNECTORS,
  type ConnectorType,
} from '@/lib/types/connectors'

/* ------------------------------------------------------------------ */
/*  Step-by-step export instructions per connector                     */
/* ------------------------------------------------------------------ */

interface ExportStep {
  title: string
  description: string
}

const EXPORT_INSTRUCTIONS: Partial<Record<ConnectorType, ExportStep[]>> = {
  lastapp: [
    {
      title: 'Accede a Last.app > Informes > Exportar',
      description:
        'Inicia sesion en tu panel de Last.app y navega a la seccion de informes. Encontraras la opcion de exportar en la esquina superior derecha.',
    },
    {
      title: 'Selecciona el rango de fechas (minimo 3 meses recomendado)',
      description:
        'Para un analisis mas completo, recomendamos exportar al menos 3 meses de datos. Cuanto mas historial, mejor sera la deteccion de patrones.',
    },
    {
      title: 'Marca todas las columnas disponibles',
      description:
        'Asegurate de incluir todas las columnas: fecha, hora, producto, cantidad, precio, descuentos, cancelaciones, metodo de pago y empleado.',
    },
    {
      title: 'Exporta como CSV',
      description:
        'Selecciona el formato CSV para la exportacion. Si tienes la opcion de elegir la codificacion, elige UTF-8.',
    },
  ],
  tspoonlab: [
    {
      title: 'Accede a T-Spoon Lab > Analisis > Exportar datos',
      description:
        'Entra en tu cuenta de T-Spoon Lab y ve a la seccion de analisis de datos.',
    },
    {
      title: "Selecciona 'Mermas e Inventario'",
      description:
        'En el tipo de informe, elige la opcion de Mermas e Inventario para incluir todos los movimientos de stock relevantes.',
    },
    {
      title: 'Elige el mismo periodo que el POS',
      description:
        'Para que el cruce de datos sea preciso, exporta exactamente el mismo rango de fechas que seleccionaste en tu sistema POS.',
    },
    {
      title: 'Descarga como CSV',
      description:
        'Haz clic en descargar y selecciona el formato CSV. El archivo se guardara en tu carpeta de descargas.',
    },
  ],
}

/* ------------------------------------------------------------------ */
/*  Helper: resolve connector name from ID                             */
/* ------------------------------------------------------------------ */

function getConnectorName(id: string): string {
  const all = [...POS_CONNECTORS, ...INVENTORY_CONNECTORS]
  return all.find((c) => c.id === id)?.name ?? id
}

function isConnectorActive(id: string): boolean {
  const all = [...POS_CONNECTORS, ...INVENTORY_CONNECTORS]
  return all.find((c) => c.id === id)?.isActive ?? false
}

/* ------------------------------------------------------------------ */
/*  Step card                                                          */
/* ------------------------------------------------------------------ */

function StepCard({
  step,
  index,
}: {
  step: ExportStep
  index: number
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      {/* Step number */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
        {index + 1}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-stone-900">{step.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-stone-500">
          {step.description}
        </p>

        {/* Screenshot placeholder */}
        <div className="mt-3 flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 text-sm text-stone-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="mr-2 h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
          Captura de pantalla
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Connector section                                                  */
/* ------------------------------------------------------------------ */

function ConnectorGuide({
  connectorId,
  label,
}: {
  connectorId: string
  label: string
}) {
  const name = getConnectorName(connectorId)
  const active = isConnectorActive(connectorId)
  const steps = EXPORT_INSTRUCTIONS[connectorId as ConnectorType]

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-stone-800">
        {label}: {name}
      </h3>

      {active && steps ? (
        <div className="space-y-3">
          {steps.map((step, i) => (
            <StepCard key={i} step={step} index={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="mx-auto h-8 w-8 text-stone-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-3 text-sm text-stone-500">
            Las instrucciones para <span className="font-medium">{name}</span>{' '}
            estaran disponibles proximamente.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ExportGuide                                                        */
/* ------------------------------------------------------------------ */

export interface ExportGuideProps {
  posConnector: string | null
  inventoryConnector: string | null
}

export function ExportGuide({
  posConnector,
  inventoryConnector,
}: ExportGuideProps) {
  const hasPos = posConnector !== null
  const hasInventory = inventoryConnector !== null

  if (!hasPos && !hasInventory) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-8 text-center">
        <p className="text-sm text-stone-500">
          Selecciona al menos un sistema POS para ver las instrucciones de
          exportacion.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {hasPos && (
        <ConnectorGuide connectorId={posConnector} label="Sistema POS" />
      )}

      {hasInventory && (
        <>
          <div className="border-t border-stone-200" />
          <ConnectorGuide
            connectorId={inventoryConnector}
            label="Sistema de Inventario"
          />
        </>
      )}
    </div>
  )
}
