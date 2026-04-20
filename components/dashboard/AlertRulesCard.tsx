'use client'

import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { AlertRuleModal } from './AlertRuleModal'
import type { AlertRule } from '@/lib/types/alerts'
import { METRIC_LABELS, OPERATOR_LABELS } from '@/lib/types/alerts'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AlertRulesCardProps {
  initialRules: AlertRule[]
}

export function AlertRulesCard({ initialRules }: AlertRulesCardProps) {
  const [rules, setRules] = useState<AlertRule[]>(initialRules)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const { showToast } = useToast()

  // Toggle rule on/off
  async function handleToggle(ruleId: string, currentActive: boolean) {
    setTogglingId(ruleId)
    try {
      const res = await fetch(`/api/alerts/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      })

      if (res.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === ruleId ? { ...r, is_active: !currentActive } : r
          )
        )
      } else {
        showToast('Error al actualizar alerta', 'error')
      }
    } catch {
      showToast('Error al actualizar alerta', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  // Delete rule — AUDIT-004 fix: confirm before destructive action
  async function handleDelete(ruleId: string) {
    const ruleName = rules.find((r) => r.id === ruleId)?.name ?? 'esta alerta'
    if (!window.confirm(`\u00bfEliminar "${ruleName}"? Esta acci\u00f3n no se puede deshacer.`)) return

    try {
      const res = await fetch(`/api/alerts/${ruleId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId))
        showToast('Alerta eliminada', 'success')
      } else {
        showToast('Error al eliminar alerta', 'error')
      }
    } catch {
      showToast('Error al eliminar alerta', 'error')
    }
  }

  // On rule created
  function handleRuleCreated(rule: AlertRule) {
    setRules((prev) => [rule, ...prev])
    setIsModalOpen(false)
    showToast('Alerta creada correctamente', 'success')
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Alertas</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Nueva alerta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-stone-500">
              No tienes alertas configuradas. Crea una para recibir notificaciones
              cuando las metricas superen tus umbrales.
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-800 truncate">
                      {rule.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      {METRIC_LABELS[rule.metric]} {OPERATOR_LABELS[rule.operator]}{' '}
                      {rule.threshold}
                    </p>
                    {rule.last_triggered_at && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        Ultima alerta:{' '}
                        {new Date(rule.last_triggered_at).toLocaleDateString('es-ES')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {/* Toggle switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.is_active}
                      disabled={togglingId === rule.id}
                      onClick={() => handleToggle(rule.id, rule.is_active)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        rule.is_active ? 'bg-blue-600' : 'bg-stone-200'
                      } ${togglingId === rule.id ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          rule.is_active ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Delete button — AUDIT-005: aria-label con el nombre
                        de la alerta para que un lector de pantalla distinga
                        este botón de los demás "Eliminar" en la lista. */}
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600 transition-colors"
                      aria-label={`Eliminar alerta: ${rule.name}`}
                      title="Eliminar alerta"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertRuleModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleRuleCreated}
      />
    </>
  )
}
