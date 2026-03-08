'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { trackReportViralCTA } from '@/lib/posthog-events'

export function ReportBanner() {
  return (
    <section className="mt-12 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-10 text-center text-white shadow-lg sm:px-12 sm:py-14">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Quieres analizar tu restaurante?
      </h2>
      <p className="mx-auto mt-3 max-w-md text-blue-100 text-sm sm:text-base">
        Genera tu primer informe de fraude operativo gratis
      </p>
      <div className="mt-6">
        <Link href="/" onClick={() => trackReportViralCTA()}>
          <Button
            variant="secondary"
            size="lg"
            className="animate-pulse hover:animate-none bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md hover:shadow-lg transition-all duration-300"
          >
            Genera tu informe gratis
          </Button>
        </Link>
      </div>
    </section>
  )
}
