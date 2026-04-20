'use client'

import React, { Component, useState } from 'react'
import type { ReportData } from '@/lib/types/report'
import type { AIInsights } from '@/lib/types/ai-insights'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { AIInsightsTab } from './AIInsightsTab'

/* ------------------------------------------------------------------ */
/*  BUG-UI02: Tab Error Boundary                                       */
/* ------------------------------------------------------------------ */

interface TabErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class TabErrorBoundary extends Component<
  { children: React.ReactNode },
  TabErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ReportLayout tab error:', error, info.componentStack)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">
            Error al renderizar esta pesta\u00f1a
          </p>
          <p className="mt-1 text-xs text-red-500">
            {this.state.error?.message ?? 'Error desconocido'}
          </p>
          <button
            className="mt-3 text-xs text-red-600 underline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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
  { key: 'ia', label: 'IA Insights' },
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
  reportId?: string // Only provided when the owner views it
  aiInsights?: AIInsights | null
}

export function ReportLayout({ data, reportId, aiInsights }: ReportLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('resumen')

  /**
   * AUDIT-001 (B9): WAI-ARIA Tabs keyboard navigation.
   * https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
   *
   * Required keys for a horizontal tablist:
   *   ArrowRight / ArrowLeft: move focus to next / prev tab (wrapping).
   *   Home / End:             jump to first / last tab.
   *   Enter / Space:          activated by the button default behavior.
   *
   * After changing the active tab we must move focus to the new tab button.
   * Without focus-sync, the previous tab remains focused but inert (its
   * tabIndex just became -1), stranding keyboard users.
   */
  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) {
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % TABS.length
        break
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = TABS.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const nextTab = TABS[nextIndex]
    trackReportTabClicked(nextTab.key)
    setActiveTab(nextTab.key)
    // Focus must move AFTER React commits the tabIndex update to the DOM; a
    // microtask-next-frame is the lightest guarantee without useEffect.
    requestAnimationFrame(() => {
      document.getElementById(`tab-${nextTab.key}`)?.focus()
    })
  }

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
      case 'ia':
        return <AIInsightsTab data={aiInsights ?? null} reportId={reportId} />
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
            <div className="flex items-center gap-3">
              {reportId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(`/api/reports/${reportId}/pdf`, '_blank')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Descargar PDF
                </Button>
              )}
              <Badge
                variant={riskBadgeVariant[data.summary.overall_risk_level]}
                className="px-3 py-1 text-sm"
              >
                Riesgo {riskLabel[data.summary.overall_risk_level]}
              </Badge>
            </div>
          </div>
        </div>

        {/* Tab navigation — AUDIT-001: patrón ARIA tablist completo. */}
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <nav
            role="tablist"
            aria-label="Secciones del informe"
            className="-mb-px flex overflow-x-auto scrollbar-none"
          >
            {TABS.map((tab, index) => {
              const selected = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  role="tab"
                  id={`tab-${tab.key}`}
                  type="button"
                  aria-selected={selected}
                  aria-controls={`tabpanel-${tab.key}`}
                  // tabIndex pattern del WAI-ARIA Tabs: solo el tab activo es
                  // focusable via tab-key; los otros se alcanzan con flechas.
                  tabIndex={selected ? 0 : -1}
                  onClick={() => { trackReportTabClicked(tab.key); setActiveTab(tab.key) }}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn(
                    'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                    selected
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700'
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Tab content — wrapped in Error Boundary (BUG-UI02) */}
      <main
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
      >
        <TabErrorBoundary key={activeTab}>
          {renderTab()}
        </TabErrorBoundary>

        {/* Bottom banner — only shown to non-owners (public/shared views) */}
        {!reportId && <ReportBanner />}
      </main>
    </div>
  )
}
