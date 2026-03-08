import React from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Base pulse class shared by all variants                            */
/* ------------------------------------------------------------------ */

const baseStyles = 'animate-pulse bg-stone-200'

/* ------------------------------------------------------------------ */
/*  Skeleton component                                                 */
/* ------------------------------------------------------------------ */

export interface SkeletonProps {
  /** Shape variant. Defaults to "text". */
  variant?: 'text' | 'card' | 'circle'
  /** Width override (Tailwind class or inline style via className). */
  className?: string
}

function Skeleton({ variant = 'text', className }: SkeletonProps) {
  switch (variant) {
    case 'text':
      return (
        <div
          className={cn(baseStyles, 'h-4 w-full rounded', className)}
          aria-hidden="true"
        />
      )

    case 'card':
      return (
        <div
          className={cn(baseStyles, 'h-32 w-full rounded-xl', className)}
          aria-hidden="true"
        />
      )

    case 'circle':
      return (
        <div
          className={cn(baseStyles, 'h-10 w-10 rounded-full', className)}
          aria-hidden="true"
        />
      )

    default:
      return null
  }
}

export { Skeleton }
