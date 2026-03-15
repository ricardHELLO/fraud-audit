'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { POS_CONNECTORS, INVENTORY_CONNECTORS } from '@/lib/types/connectors'
import { detectVolume, type VolumeInfo } from '@/lib/volume-detector'
import { FileDropZone } from '@/components/upload/FileDropZone'
import { VolumePreview } from '@/components/upload/VolumePreview'
import { UpgradePrompt } from '@/components/upload/UpgradePrompt'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { trackFileUploaded, trackVolumeLimitShown, trackUpgradePromptShown, trackUpgradeInitiated } from '@/lib/posthog-events'

/* ------------------------------------------------------------------ */
/*  Connector dropdown                                                  */
/* ------------------------------------------------------------------ */

interface ConnectorDropdownProps {
  label: string
  connectors: typeof POS_CONNECTORS
  value: string
  onChange: (value: string) => void
}

function ConnectorDropdown({ label, connectors, value, onChange }: ConnectorDropdownProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <option value="">Selecciona un conector...</option>
        {connectors.map((c) => (
          <option key={c.id} value={c.id} disabled={!c.isActive}>
            {c.name} {!c.isActive ? '(Proximamente)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Upload page                                                         */
/* ------------------------------------------------------------------ */

export default function UploadPage() {
  const router = useRouter()

  // --- Restaurant name ---
  const [restaurantName, setRestaurantName] = useState<string>('')

  // --- Connector selection ---
  const [posConnector, setPosConnector] = useState<string>('')
  const [inventoryConnector, setInventoryConnector] = useState<string>('')

  // --- File state ---
  const [posFile, setPosFile] = useState<File | null>(null)
  const [inventoryFile, setInventoryFile] = useState<File | null>(null)

  // --- Volume detection ---
  const [posVolume, setPosVolume] = useState<VolumeInfo | null>(null)
  const [inventoryVolume, setInventoryVolume] = useState<VolumeInfo | null>(null)

  // --- Credits ---
  const [userCredits, setUserCredits] = useState<number | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

  // --- Demo mode ---
  const [isDemo, setIsDemo] = useState(false)

  // --- UI state ---
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Fetch real balance on mount ---
  useEffect(() => {
    async function fetchBalance() {
      try {
        const res = await fetch('/api/dashboard')
        if (res.ok) {
          const data = await res.json()
          setUserCredits(data.balance)
        }
      } catch {
        // Fallback — don't block user
        setUserCredits(100)
      }
    }
    fetchBalance()
  }, [])

  // --- File handlers ---
  const handlePosFileSelect = useCallback(
    async (file: File) => {
      setPosFile(file)
      setError(null)

      try {
        const text = await file.text()
        const volume = detectVolume(text, posConnector)
        setPosVolume(volume)

        trackFileUploaded({
          connector_type: posConnector,
          source_category: 'pos',
          file_size_bytes: file.size,
          detected_rows: volume.totalRows,
          detected_months: volume.monthsCovered,
          detected_locations: volume.locations.length,
        })

        // Check if user needs more credits
        const credits = userCredits ?? 0
        if (volume.creditsRequired > credits) {
          trackVolumeLimitShown({
            months_in_data: volume.monthsCovered,
            locations_in_data: volume.locations.length,
          })
          trackUpgradePromptShown()
          setShowUpgrade(true)
        } else {
          setShowUpgrade(false)
        }
      } catch (err) {
        console.error('Volume detection failed:', err)
        setError(
          'No se pudo analizar el archivo. Asegurate de que el formato sea CSV valido.'
        )
        setPosVolume(null)
      }
    },
    [posConnector, userCredits]
  )

  const handleInventoryFileSelect = useCallback(
    async (file: File) => {
      setInventoryFile(file)
      setError(null)

      try {
        const text = await file.text()
        const volume = detectVolume(text, inventoryConnector)
        setInventoryVolume(volume)
      } catch (err) {
        console.error('Inventory volume detection failed:', err)
        // Inventory parsing errors are non-blocking
      }
    },
    [inventoryConnector]
  )

  // --- Upload file helper ---
  async function uploadFile(file: File, connectorType: string, sourceCategory: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('connectorType', connectorType)
    formData.append('sourceCategory', sourceCategory)

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Error al subir el archivo')
    }

    return res.json()
  }

  // --- Submit analysis ---
  const canAnalyze =
    posConnector !== '' &&
    posFile !== null &&
    posVolume !== null &&
    !showUpgrade &&
    !isAnalyzing &&
    userCredits !== null

  async function handleAnalyze() {
    if (!canAnalyze) return

    setIsAnalyzing(true)
    setError(null)

    try {
      // Step 1: Upload POS file
      const posUpload = await uploadFile(posFile!, posConnector, 'pos')
      const posUploadId = posUpload.uploadId

      // Step 2: Upload inventory file (optional)
      let inventoryUploadId: string | undefined
      if (inventoryFile && inventoryConnector) {
        const invUpload = await uploadFile(inventoryFile, inventoryConnector, 'inventory')
        inventoryUploadId = invUpload.uploadId
      }

      // Step 3: Trigger analysis
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posUploadId,
          posConnector,
          inventoryUploadId,
          inventoryConnector: inventoryConnector || undefined,
          restaurantName: restaurantName.trim() || undefined,
          isDemo: isDemo || undefined,
        }),
      })

      if (!analyzeRes.ok) {
        const data = await analyzeRes.json()
        if (analyzeRes.status === 402) {
          throw new Error('Creditos insuficientes. Adquiere mas ejecuciones para continuar.')
        }
        throw new Error(data.error || 'Error al iniciar el analisis')
      }

      const { reportId } = await analyzeRes.json()

      // Step 4: Redirect to processing page with real report ID
      router.push(`/dashboard/processing/${reportId}`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al iniciar el analisis'
      setError(message)
      setIsAnalyzing(false)
    }
  }

  async function handleSelectPlan(planId: string) {
    const creditMap: Record<string, number> = { pack_5: 5, pack_15: 15, pack_50: 50 }
    trackUpgradeInitiated(creditMap[planId] ?? 0)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: planId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al crear la sesion de pago')
        return
      }

      const { checkoutUrl } = await res.json()
      window.location.href = checkoutUrl
    } catch {
      setError('Error al conectar con el sistema de pagos')
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <nav className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            Dashboard
          </Link>
          <span className="text-stone-300">/</span>
          <span className="text-sm font-semibold text-stone-900">
            Nuevo informe
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Subir datos para analisis
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Sube los archivos exportados de tu POS y sistema de inventario
          </p>
        </div>

        <div className="space-y-8">
          {/* --- Restaurant name --- */}
          <Card>
            <CardHeader>
              <CardTitle>Nombre del restaurante</CardTitle>
              <CardDescription>
                Opcional. Identifica tu informe en el dashboard y en comparativas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder="Ej: Paella Dorada — Valencia Centro"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </CardContent>
          </Card>

          {/* --- POS Section --- */}
          <Card>
            <CardHeader>
              <CardTitle>Datos del POS</CardTitle>
              <CardDescription>
                Obligatorio. Sube el archivo de ventas exportado de tu sistema POS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ConnectorDropdown
                label="Sistema POS"
                connectors={POS_CONNECTORS}
                value={posConnector}
                onChange={setPosConnector}
              />

              {posConnector && (
                <FileDropZone
                  onFileSelect={handlePosFileSelect}
                  accept=".csv,.xlsx,.xls"
                  label="Archivo CSV o Excel del POS"
                />
              )}

              {posVolume && userCredits !== null && (
                <VolumePreview volumeInfo={posVolume} userCredits={userCredits} />
              )}
            </CardContent>
          </Card>

          {/* --- Demo data prompt --- */}
          {!posFile && (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-5 text-center">
              <p className="text-sm font-medium text-stone-600">
                No tienes datos ahora?
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/demo/lastapp-demo.csv')
                    const blob = await res.blob()
                    const demoFile = new File([blob], 'lastapp-demo.csv', { type: 'text/csv' })
                    setPosConnector('lastapp')
                    setRestaurantName('Demo — Paella Dorada')
                    setIsDemo(true)
                    // Slight delay to let connector state update before file handler reads it
                    setTimeout(() => handlePosFileSelect(demoFile), 50)
                  } catch {
                    setError('No se pudo cargar los datos demo')
                  }
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M4.606 12.97a.75.75 0 01-.134 1.051 2.494 2.494 0 00-.93 2.437 2.494 2.494 0 002.437-.93.75.75 0 111.186.918 3.995 3.995 0 01-4.482 1.332.75.75 0 01-.461-.461 3.994 3.994 0 011.332-4.482.75.75 0 011.052.134z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M5.752 12A13.07 13.07 0 008 14.248v4.002c0 .414.336.75.75.75a5 5 0 004.797-6.414 12.984 12.984 0 005.45-10.848.75.75 0 00-.735-.735 12.984 12.984 0 00-10.849 5.45A5 5 0 001 11.25c.001.414.337.75.751.75h4.002zM13 9a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Probar con datos de ejemplo
              </button>
              <p className="mt-1.5 text-xs text-stone-400">
                Genera un informe demo en 30 segundos
              </p>
            </div>
          )}

          {/* --- Inventory Section --- */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Datos de Inventario</CardTitle>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                  Opcional
                </span>
              </div>
              <CardDescription>
                Conectar datos de inventario permite un analisis cruzado mas completo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ConnectorDropdown
                label="Sistema de inventario"
                connectors={INVENTORY_CONNECTORS}
                value={inventoryConnector}
                onChange={setInventoryConnector}
              />

              {inventoryConnector && (
                <FileDropZone
                  onFileSelect={handleInventoryFileSelect}
                  accept=".csv,.xlsx,.xls"
                  label="Archivo CSV o Excel de inventario"
                />
              )}

              {inventoryVolume && userCredits !== null && (
                <VolumePreview
                  volumeInfo={inventoryVolume}
                  userCredits={userCredits}
                />
              )}
            </CardContent>
          </Card>

          {/* --- Upgrade prompt --- */}
          {showUpgrade && posVolume && (
            <UpgradePrompt
              creditsNeeded={posVolume.creditsRequired}
              currentCredits={userCredits ?? 0}
              onSelectPlan={handleSelectPlan}
            />
          )}

          {/* --- Error alert --- */}
          {error && (
            <Alert variant="danger" title="Error" description={error} />
          )}

          {/* --- Trust badges --- */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-stone-500">
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-600">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              Cifrado seguro
            </span>
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-600">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 3.68V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
              Eliminado tras analisis
            </span>
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-600">
                <path fillRule="evenodd" d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.589 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 01-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.077-2.75z" clipRule="evenodd" />
              </svg>
              GDPR compliant
            </span>
          </div>

          {/* --- Analyze button --- */}
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="lg"
              disabled={!canAnalyze}
              loading={isAnalyzing}
              onClick={handleAnalyze}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
                  clipRule="evenodd"
                />
              </svg>
              Analizar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
