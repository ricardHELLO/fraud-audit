import React from 'react'
import { cn } from '@/lib/utils'

const variantStyles = {
  default: 'bg-stone-100 text-stone-700 ring-stone-200',
  success: 'bg-green-50 text-green-700 ring-green-200',
  warning: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
} as const

type BadgeVariant = keyof typeof variantStyles

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
