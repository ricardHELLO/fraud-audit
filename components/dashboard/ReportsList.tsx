'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ReportSummary {
  id: string
  slug: string
  organization_name: string
  status: string
  created_at: string
  locations: string[]
  analysis_period: string
  external_views: number
}

export interface ReportsListProps {
  reports: ReportSummary[]
}

/* ------------------------------------------------------------------ */
/*  Status badge variant mapping                                       */
/* ------------------------------------------------------------------ */

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return { variant: 'success' as const, label: 'Completado' }
    case 'processing':
      return { variant: 'warning' as const, label: 'Procesando' }
    case 'failed':
      return { variant: 'danger' as const, label: 'Error' }
    default:
      return { variant: 'default' as const, label: status }
  }
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-12 w-12 text-stone-300"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <p className="mt-4 text-sm font-medium text-stone-700">
        Aun no has generado ningun informe
      </p>
      <p className="mt-1 text-sm text-stone-500">
        Sube tus datos para empezar!
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ReportsList                                                        */
/* ------------------------------------------------------------------ */

export function ReportsList({ reports }: ReportsListProps) {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tus informes</CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                <th className="px-6 py-3">Organizacion</th>
                <th className="px-6 py-3">Periodo</th>
                <th className="px-6 py-3">Locales</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Vistas</th>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {reports.map((report) => {
                const { variant, label } = statusBadge(report.status)

                return (
                  <tr
                    key={report.id}
                    className="transition-colors hover:bg-stone-50"
                  >
                    <td className="px-6 py-4 font-medium text-stone-900">
                      {report.organization_name}
                    </td>
                    <td className="px-6 py-4 text-stone-600">
                      {report.analysis_period}
                    </td>
                    <td className="px-6 py-4 text-stone-600">
                      {report.locations.length}{' '}
                      {report.locations.length === 1 ? 'local' : 'locales'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={variant}>{label}</Badge>
                    </td>
                    <td className="px-6 py-4 tabular-nums text-stone-600">
                      {report.external_views}
                    </td>
                    <td className="px-6 py-4 text-stone-500">
                      {formatDate(report.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {report.status === 'completed' && (
                        <a
                          href={`/informe/${report.slug}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
                        >
                          Ver informe
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-stone-100 md:hidden">
          {reports.map((report) => {
            const { variant, label } = statusBadge(report.status)

            return (
              <div key={report.id} className="space-y-2 px-6 py-4">
                <div className="flex items-start justify-between">
                  <p className="font-medium text-stone-900">
                    {report.organization_name}
                  </p>
                  <Badge variant={variant}>{label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                  <span>{report.analysis_period}</span>
                  <span>
                    {report.locations.length}{' '}
                    {report.locations.length === 1 ? 'local' : 'locales'}
                  </span>
                  <span>{report.external_views} vistas</span>
                  <span>{formatDate(report.created_at)}</span>
                </div>
                {report.status === 'completed' && (
                  <a
                    href={`/reports/${report.slug}`}
                    className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Ver informe
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
