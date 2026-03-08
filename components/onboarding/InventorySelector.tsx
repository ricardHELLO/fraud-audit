'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import {
  INVENTORY_CONNECTORS,
  type ConnectorInfo,
} from '@/lib/types/connectors'

/* ------------------------------------------------------------------ */
/*  Connector logo placeholder — first letter in a coloured circle     */
/* ------------------------------------------------------------------ */

const LOGO_COLORS: Record<string, string> = {
  tspoonlab: 'bg-rose-600',
  prezo: 'bg-teal-600',
  gstock: 'bg-indigo-600',
}

function ConnectorLogo({ connector }: { connector: ConnectorInfo }) {
  return (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white',
        LOGO_COLORS[connector.id] ?? 'bg-stone-500'
      )}
    >
      {connector.name.charAt(0).toUpperCase()}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  InventorySelector                                                  */
/* ------------------------------------------------------------------ */

export interface InventorySelectorProps {
  selected: string | null
  onSelect: (id: string) => void
  onSkip: () => void
}

export function InventorySelector({
  selected,
  onSelect,
  onSkip,
}: InventorySelectorProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INVENTORY_CONNECTORS.map((connector) => {
          const isSelected = selected === connector.id
          const isDisabled = !connector.isActive

          return (
            <button
              key={connector.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(connector.id)}
              className={cn(
                'relative flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all duration-150',
                isDisabled
                  ? 'cursor-not-allowed border-stone-100 bg-stone-50 opacity-60'
                  : isSelected
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
              )}
            >
              {/* Checkmark */}
              {isSelected && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
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
                </span>
              )}

              {/* Logo */}
              <ConnectorLogo connector={connector} />

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900">
                  {connector.name}
                </p>
                {connector.isActive ? (
                  <span className="mt-1 inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                    Disponible
                  </span>
                ) : (
                  <span className="mt-1 inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500 ring-1 ring-inset ring-stone-200">
                    Proximamente
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Skip step */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="group flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          >
            <path
              fillRule="evenodd"
              d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
              clipRule="evenodd"
            />
          </svg>
          Saltar este paso
        </button>
        <span className="text-xs text-stone-400">
          (puedes conectarlo mas tarde)
        </span>
      </div>
    </div>
  )
}
