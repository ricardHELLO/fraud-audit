'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { CreditBalance } from '@/components/dashboard/CreditBalance'
import { GamificationChecklist } from '@/components/dashboard/GamificationChecklist'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { ReportsList, type ReportSummary } from '@/components/dashboard/ReportsList'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import { useToast } from '@/components/ui/toast'
import { AlertRulesCard } from '@/components/dashboard/AlertRulesCard'
import { trackUpgradeInitiated } from '@/lib/posthog-events'
import type { AlertRule } from '@/lib/types/alerts'

/* ------------------------------------------------------------------ */
/*  Dashboard page                                                      */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  // --- State ---
  const [balance, setBalance] = useState<number>(0)
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [completedActions, setCompletedActions] = useState<string[]>(['signup'])
  const [alertRules, setAlertRules] = useState<AlertRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false)

  // --- Check for purchase success parameter ---
  useEffect(() => {
    if (searchParams.get('purchase') === 'success') {
      setShowPurchaseSuccess(true)
      // Clean URL without reloading
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [searchParams])

  // --- Fetch dashboard data ---
  useEffect(() => {
    if (!isUserLoaded || !user) return

    async function loadDashboard() {
      setIsLoading(true)

      try {
        const res = await fetch('/api/dashboard')

        if (res.ok) {
          const data = await res.json()
          setBalance(data.balance)
          setReports(data.reports)
          setCompletedActions(data.completedActions)
          setAlertRules(data.alertRules ?? [])
        } else {
          console.error('Dashboard API returned error:', res.status)
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboard()
  }, [isUserLoaded, user])

  // --- Buy more handler ---
  function handleBuyMore() {
    trackUpgradeInitiated(0)
    window.location.href = '/dashboard/upload'
  }

  // --- Gamification action completed handler ---
  const handleActionCompleted = useCallback(
    (actionId: string, creditAwarded: boolean) => {
      if (creditAwarded) {
        setCompletedActions((prev) =>
          prev.includes(actionId) ? prev : [...prev, actionId]
        )
        setBalance((prev) => prev + 1)
        showToast('+1 ejecucion ganada', 'success')
      }
    },
    [showToast]
  )

  // --- Loading state ---
  if (!isUserLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <DashboardNav userName={null} />
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
          <Skeleton variant="card" className="h-24" />
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav userName={user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? null} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Purchase success alert */}
        {showPurchaseSuccess && (
          <div className="mb-6">
            <Alert
              variant="success"
              title="Compra completada"
              description="Tus creditos se han anadido a tu cuenta. Ya puedes ejecutar nuevos analisis."
            />
          </div>
        )}

        {/* Page header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Gestiona tus informes de fraude y creditos
            </p>
          </div>
          <Link href="/dashboard/upload">
            <Button variant="primary" size="lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Nuevo informe
            </Button>
          </Link>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: Credit balance + Gamification */}
          <div className="space-y-6 lg:col-span-1">
            <CreditBalance balance={balance} onBuyMore={handleBuyMore} />
            <AlertRulesCard initialRules={alertRules} />
            <GamificationChecklist
              completedActions={completedActions}
              reports={reports}
              onActionCompleted={handleActionCompleted}
            />
          </div>

          {/* Right column: Reports list */}
          <div className="lg:col-span-2">
            <ReportsList reports={reports} />
          </div>
        </div>
      </div>
    </div>
  )
}

