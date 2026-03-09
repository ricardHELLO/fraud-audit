'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { AlertRule, AlertMetric, AlertOperator } from '@/lib/types/alerts'
import {
  METRIC_LABELS,
  OPERATOR_LABELS,
  VALID_METRICS,
  VALID_OPERATORS,
  RISK_LEVEL_LABELS,
} from '@/lib/types/alerts'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AlertRuleModalProps {
  open: boolean
  onClose: () => void
  onCreated: (rule: AlertRule) => void
}

export function AlertRuleModal({ open, onClose, onCreated }: AlertRuleModalProps) {
  const [name, setName] = useState('')
  const [metric, setMetric] = useState<AlertMetric>('cash_discrepancy')
  const [operator, setOperator] = useState<AlertOperator>('gt')
  const [threshold, setThreshold] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRiskLevel = metric === 'risk_level'

  function resetForm() {
    setName('')
    setMetric('cash_discrepancy')
    setOperator('gt')
    setThreshold('')
    setError(null)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    const thresholdNum = Number(threshold)
    if (isNaN(thresholdNum)) {
      setError('El umbral debe ser un numero valido')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          metric,
          operator,
          threshold: thresholdNum,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        resetForm()
        onCreated(data.rule)
      } else {
        const data = await res.json()
        setError(data.error || 'Error al crear la alerta')
      }
    } catch {
      setError('Error de conexion. Intenta de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nueva alerta">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="alert-name" className="block text-sm font-medium text-stone-700 mb-1">
            Nombre de la alerta
          </label>
          <input
            id="alert-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Descuadre alto"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Metric */}
        <div>
          <label htmlFor="alert-metric" className="block text-sm font-medium text-stone-700 mb-1">
            Metrica
          </label>
          <select
            id="alert-metric"
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value as AlertMetric)
              setThreshold('')
            }}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {VALID_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        {/* Operator */}
        <div>
          <label htmlFor="alert-operator" className="block text-sm font-medium text-stone-700 mb-1">
            Condicion
          </label>
          <select
            id="alert-operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value as AlertOperator)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {VALID_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </option>
            ))}
          </select>
        </div>

        {/* Threshold */}
        <div>
          <label htmlFor="alert-threshold" className="block text-sm font-medium text-stone-700 mb-1">
            Umbral
          </label>
          {isRiskLevel ? (
            <select
              id="alert-threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Selecciona nivel</option>
              {Object.entries(RISK_LEVEL_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="alert-threshold"
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="Ej: 500"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
