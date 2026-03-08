'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser, SignOutButton } from '@clerk/nextjs'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Transaction {
  id: string
  amount: number
  reason: string
  created_at: string
}

interface SettingsData {
  user: {
    email: string
    name: string | null
    organization_name: string
  }
  balance: number
  transactions: Transaction[]
}

/* ------------------------------------------------------------------ */
/*  Reason labels                                                       */
/* ------------------------------------------------------------------ */

const REASON_LABELS: Record<string, string> = {
  signup_bonus: 'Bienvenida',
  purchase: 'Compra de ejecuciones',
  analysis: 'Analisis ejecutado',
  feedback: 'Feedback enviado',
  referral: 'Referido',
  referred_bonus: 'Bonus por referido',
  first_share_view: 'Informe compartido',
  bug_report: 'Bug reportado',
  second_source: 'Segunda fuente conectada',
  first_update: 'Primera actualizacion',
}

function formatReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/* ------------------------------------------------------------------ */
/*  Settings page                                                       */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser()

  const [data, setData] = useState<SettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [nameInput, setNameInput] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  // Fetch settings data
  useEffect(() => {
    if (!isUserLoaded || !clerkUser) return

    async function loadSettings() {
      setIsLoading(true)
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const result = await res.json()
          setData(result)
          setNameInput(result.user.name ?? '')
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [isUserLoaded, clerkUser])

  // Save name handler
  async function handleSaveName() {
    if (!nameInput.trim() || nameInput === data?.user.name) return

    setIsSavingName(true)
    setNameSaved(false)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      })

      if (res.ok) {
        setData((prev) =>
          prev
            ? { ...prev, user: { ...prev.user, name: nameInput.trim() } }
            : prev
        )
        setNameSaved(true)
        setTimeout(() => setNameSaved(false), 3000)
      }
    } catch (err) {
      console.error('Failed to save name:', err)
    } finally {
      setIsSavingName(false)
    }
  }

  const userName =
    clerkUser?.firstName ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null

  // Loading state
  if (!isUserLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <DashboardNav userName={null} />
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
          <Skeleton variant="card" className="h-24" />
          <Skeleton variant="card" className="h-32" />
          <Skeleton variant="card" className="h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <DashboardNav userName={userName} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/dashboard"
            className="text-stone-500 hover:text-stone-700"
          >
            Dashboard
          </Link>
          <span className="text-stone-300">/</span>
          <span className="font-medium text-stone-900">Configuracion</span>
        </div>

        <h1 className="mb-8 text-2xl font-bold tracking-tight text-stone-900">
          Configuracion
        </h1>

        <div className="space-y-6">
          {/* Section 1: Account */}
          <Card>
            <CardHeader>
              <CardTitle>Cuenta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Email
                </label>
                <p className="mt-1 text-sm text-stone-700">
                  {data?.user.email ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''}
                </p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Nombre
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Tu nombre"
                    maxLength={100}
                    className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveName}
                    loading={isSavingName}
                    disabled={!nameInput.trim() || nameInput === data?.user.name}
                  >
                    {nameSaved ? 'Guardado' : 'Guardar'}
                  </Button>
                </div>
              </div>

              {/* Organization */}
              {data?.user.organization_name && (
                <div>
                  <label className="block text-xs font-medium text-stone-500 uppercase tracking-wide">
                    Organizacion
                  </label>
                  <p className="mt-1 text-sm text-stone-700">
                    {data.user.organization_name}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Current plan */}
          <Card>
            <CardHeader>
              <CardTitle>Plan actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-stone-500">Ejecuciones disponibles</p>
                  <p
                    className={cn(
                      'text-3xl font-bold tabular-nums',
                      (data?.balance ?? 0) >= 3
                        ? 'text-green-600'
                        : (data?.balance ?? 0) >= 1
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    )}
                  >
                    {data?.balance ?? 0}
                  </p>
                </div>
                <Link href="/dashboard/upload">
                  <Button variant="primary" size="sm">
                    Comprar mas
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Transaction history */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de creditos</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.transactions && data.transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200">
                        <th className="pb-2 text-left font-medium text-stone-500">
                          Fecha
                        </th>
                        <th className="pb-2 text-left font-medium text-stone-500">
                          Razon
                        </th>
                        <th className="pb-2 text-right font-medium text-stone-500">
                          Movimiento
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {data.transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2 text-stone-600">
                            {formatDate(tx.created_at)}
                          </td>
                          <td className="py-2 text-stone-700">
                            {formatReason(tx.reason)}
                          </td>
                          <td
                            className={cn(
                              'py-2 text-right font-medium tabular-nums',
                              tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {tx.amount > 0 ? '+' : ''}
                            {tx.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-stone-400">
                  No hay transacciones todavia.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Sign out */}
          <Card>
            <CardContent className="py-4">
              <SignOutButton>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                  Cerrar sesion
                </Button>
              </SignOutButton>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
