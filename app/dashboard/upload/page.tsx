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
