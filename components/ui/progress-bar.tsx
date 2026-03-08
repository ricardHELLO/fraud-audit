import React from 'react'
import { cn } from '@/lib/utils'

const colorStyles = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
} as const

type ProgressColor = keyof typeof colorStyles

export interface ProgressBarProps {
  /** Current value (0 -- max). */
  value: number
  /** Upper bound. Defaults to 100. */
  max?: number
  /** Bar fill color. Defaults to blue. */
  color?: ProgressColor
  /** Optional label rendered above the bar. */
  label?: string
  /** Show the computed percentage to the right of the bar. */
  showPercent?: boolean
  className?: string
}

function ProgressBar({
  value,
  max = 100,
  color = 'blue',
  label,
  showPercent = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max)
  const percent = max === 0 ? 0 : (clamped / max) * 100

  return (
    <div className={cn('w-full', className)}>
      {/* Header row */}
      {(label || showPercent) && (
        <div className="mb-1.5 flex items-center justify-between text-sm">
          {label && (
            <span className="font-medium text-stone-700">{label}</span>
          )}
          {showPercent && (
            <span className="tabular-nums text-stone-500">
              {percent.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      {/* Track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            colorStyles[color]
          )}
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  )
}

export { ProgressBar }
