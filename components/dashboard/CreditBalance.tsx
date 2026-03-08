'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/* ------------------------------------------------------------------ */
/*  CreditBalance                                                      */
/* ------------------------------------------------------------------ */

export interface CreditBalanceProps {
  balance: number
  onBuyMore: () => void
}

function balanceColor(balance: number) {
  if (balance >= 3) return 'text-green-600'
  if (balance >= 1) return 'text-yellow-600'
  return 'text-red-600'
}

function balanceBg(balance: number) {
  if (balance >= 3) return 'bg-green-50 border-green-200'
  if (balance >= 1) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

function balanceIconBg(balance: number) {
  if (balance >= 3) return 'bg-green-100 text-green-600'
  if (balance >= 1) return 'bg-yellow-100 text-yellow-600'
  return 'bg-red-100 text-red-600'
}

export function CreditBalance({ balance, onBuyMore }: CreditBalanceProps) {
  return (
    <Card className={cn('border', balanceBg(balance))}>
      <CardContent className="flex items-center gap-4">
        {/* Icon */}
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            balanceIconBg(balance)
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6"
          >
            <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 01-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004zM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 01-.921.42z" />
            <path
              fillRule="evenodd"
              d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v.816a3.128 3.128 0 00-1.247.761c-.618.49-.976 1.142-.976 1.857 0 .715.358 1.368.976 1.857.418.332.94.577 1.497.696v2.854l-1.338-.377a.75.75 0 10-.406 1.443l1.744.49v.814a.75.75 0 001.5 0v-.816a3.128 3.128 0 001.247-.761c.618-.49.976-1.142.976-1.857 0-.715-.358-1.368-.976-1.857a3.128 3.128 0 00-1.247-.697V8.071l1.338.377a.75.75 0 10.406-1.443l-1.744-.49V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Balance info */}
        <div className="flex-1">
          <p className="text-sm font-medium text-stone-600">
            Ejecuciones disponibles
          </p>
          <p className={cn('text-2xl font-bold tabular-nums', balanceColor(balance))}>
            {balance}
          </p>
        </div>

        {/* Buy more button */}
        {balance <= 2 && (
          <Button
            variant={balance === 0 ? 'primary' : 'secondary'}
            size="sm"
            onClick={onBuyMore}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Comprar mas ejecuciones
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
