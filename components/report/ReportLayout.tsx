'use client'

import React, { useState } from 'react'
import type { ReportData } from '@/lib/types/report'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { trackReportTabClicked } from '@/lib/posthog-events'

import { SummaryTab } from './SummaryTab'
import { CashTab } from './CashTab'
import { InvoicesTab } from './InvoicesTab'
import { ProductsTab } from './ProductsTab'
import { WasteTab } from './WasteTab'
import { InventoryTab } from './InventoryTab'
import { CorrelationTab } from './CorrelationTab'
import { ConclusionsTab } from './ConclusionsTab'
import { ReportBanner } from './ReportBanner'

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'caja', label: 'Caja' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'productos', label: 'Productos' },
  { key: 'mermas', label: 'Mermas' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'correlacion', label: 'Correlacion' },
  { key: 'conclusiones', label: 'Conclusiones' },
] as const

type TabKey = (typeof TABS)[number]['key']

/* ------------------------------------------------------------------ */
/*  Severity mapping for header badge                                  */
/* ------------------------------------------------------------------ */

const riskBadgeVariant: Record<string, 'danger' | 'warning' | 'success'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'success',
}

const riskLabel: Record<string, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ReportLayoutProps {
  data: ReportData
}

export function ReportLayout({ data }: ReportLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('resumen')

  function renderTab() {
    switch (activeTab) {
      case 'resumen':
        return (
          <SummaryTab
            data={data.summary}
            cash={data.cash_discrepancy}
            invoices={data.deleted_invoices}
            waste={data.waste_analysis}
          />
        )
      case 'caja':
        return <CashTab data={data.cash_discrepancy} />
      case 'facturas':
        return <InvoicesTab data={data.deleted_invoices} />
      case 'productos':
        return <ProductsTab data={data.deleted_products} />
      case 'mermas':
        return <WasteTab data={data.waste_analysis} />
      case 'inventario':
        return <InventoryTab data={data.inventory_deviation} />
      case 'correlacion':
        return <CorrelationTab data={data.correlation} />
      case 'conclusiones':
        return <ConclusionsTab data={data.conclusions} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">
                {data.summary.organization_name}
              </h1>
              <p className="text-sm text-stone-500">
                Periodo: {data.summary.analysis_period} &middot;{' '}
                {data.summary.locations_count} locales
              </p>
            </div>
            <Badge
              variant={riskBadgeVariant[data.summary.overall_risk_level]}
              className="px-3 py-1 text-sm"
            >
              Riesgo {riskLabel[data.summary.overall_risk_level]}
            </Badge>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <nav className="-mb-px flex overflow-x-auto scrollbar-none" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { trackReportTabClicked(tab.key); setActiveTab(tab.key) }}
                className={cn(
                  'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Tab content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {renderTab()}

        {/* Bottom banner */}
        <ReportBanner />
      </main>
    </div>
  )
}
