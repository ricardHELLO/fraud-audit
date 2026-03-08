'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { CreditBalance } from '@/components/dashboard/CreditBalance'
import { GamificationChecklist } from '@/components/dashboard/GamificationChecklist'
import { ReportsList, type ReportSummary } from '@/components/dashboard/ReportsList'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { trackUpgradeInitiated } from '@/lib/posthog-events'

/* ------------------------------------------------------------------ */
/*  Dashboard page                                                      */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser()

  // --- State ---
  const [balance, setBalance] = useState<number>(1)
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [completedActions, setCompletedActions] = useState<string[]>(['signup'])
  const [isLoading, setIsLoading] = useState(true)

  // --- Fetch dashboard data ---
  useEffect(() => {
    if (!isUserLoaded || !user) return

    async function loadDashboard() {
      setIsLoading(true)

      try {
        // TODO: Replace with real API calls once endpoints are implemented
        // const [balanceRes, reportsRes, actionsRes] = await Promise.all([
        //   fetch('/api/credits/balance'),
        //   fetch('/api/reports'),
        //   fetch('/api/gamification/status'),
        // ])
        // const balanceData = await balanceRes.json()
        // const reportsData = await reportsRes.json()
        // const actionsData = await actionsRes.json()
        // setBalance(balanceData.balance)
        // setReports(reportsData.reports)
        // setCompletedActions(actionsData.completedActions)

        // Placeholder / mock data for now (beta: generous free credits)
        setBalance(100)
        setReports([])
        setCompletedActions(['signup'])
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
    // TODO: Navigate to Stripe checkout or open pricing modal
    // router.push('/dashboard/pricing')
    trackUpgradeInitiated(0)
  }

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
            <GamificationChecklist completedActions={completedActions} />
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

/* ------------------------------------------------------------------ */
/*  Dashboard nav bar                                                   */
/* ------------------------------------------------------------------ */

function DashboardNav({ userName }: { userName: string | null }) {
  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="text-lg font-bold tracking-tight text-stone-900">
          FraudAudit
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {userName && (
            <span className="hidden text-sm text-stone-600 sm:inline">
              {userName}
            </span>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {userName ? userName.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
      </div>
    </nav>
  )
}
