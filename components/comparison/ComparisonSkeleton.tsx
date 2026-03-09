'use client'

import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export function ComparisonSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metric delta cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton variant="card" className="h-28" />
        <Skeleton variant="card" className="h-28" />
        <Skeleton variant="card" className="h-28" />
        <Skeleton variant="card" className="h-28" />
      </div>

      {/* Local comparison table skeleton */}
      <Skeleton variant="card" className="h-64" />
    </div>
  )
}
