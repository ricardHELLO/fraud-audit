'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface BugReportModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (creditAwarded: boolean) => void
}

export function BugReportModal({ open, onClose, onSuccess }: BugReportModalProps) {
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!description.trim()) {
      setError('Por favor, describe el bug o tu sugerencia.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al enviar el reporte')
        return
      }

      const data = await res.json()
      setDescription('')
      onSuccess(data.creditAwarded)
      onClose()
    } catch {
      setError('Error de conexion. Intentalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-900">
              Reportar un bug o sugerir mejora
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Cuentanos que encontraste o que podemos mejorar. Gana +1 ejecucion
              por tu primer reporte.
            </p>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe el bug o tu sugerencia..."
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
            >
              Enviar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
