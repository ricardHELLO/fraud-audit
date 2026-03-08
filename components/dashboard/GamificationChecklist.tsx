'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

/* ------------------------------------------------------------------ */
/*  Gamification action definitions                                    */
/* ------------------------------------------------------------------ */

interface GamificationAction {
  id: string
  label: string
  reward: number
}

const GAMIFICATION_ACTIONS: GamificationAction[] = [
  { id: 'signup', label: 'Crear cuenta', reward: 1 },
  { id: 'feedback', label: 'Dar feedback de tu primer informe', reward: 1 },
  { id: 'referral', label: 'Invitar a otro restaurante', reward: 2 },
  { id: 'share', label: 'Compartir tu informe', reward: 1 },
  { id: 'second_source', label: 'Conectar una segunda fuente de datos', reward: 1 },
  { id: 'bug_report', label: 'Reportar un bug o sugerir mejora', reward: 1 },
]

const TOTAL_ACTIONS = GAMIFICATION_ACTIONS.length

/* ------------------------------------------------------------------ */
/*  GamificationChecklist                                              */
/* ------------------------------------------------------------------ */

export interface GamificationChecklistProps {
  completedActions: string[]
}

export function GamificationChecklist({
  completedActions,
}: GamificationChecklistProps) {
  const completedSet = new Set(completedActions)
  const completedCount = GAMIFICATION_ACTIONS.filter((a) =>
    completedSet.has(a.id)
  ).length

  const pendingRewards = GAMIFICATION_ACTIONS.filter(
    (a) => !completedSet.has(a.id)
  ).reduce((sum, a) => sum + a.reward, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gana ejecuciones gratis</CardTitle>
        <p className="text-sm text-stone-500">
          {completedCount}/{TOTAL_ACTIONS} acciones completadas
          {pendingRewards > 0 && (
            <> &mdash; {pendingRewards} ejecuciones por ganar</>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Progress bar */}
        <ProgressBar
          value={completedCount}
          max={TOTAL_ACTIONS}
          color={
            completedCount === TOTAL_ACTIONS
              ? 'green'
              : completedCount > 0
                ? 'blue'
                : 'blue'
          }
        />

        {/* Action list */}
        <ul className="space-y-3">
          {GAMIFICATION_ACTIONS.map((action) => {
            const isCompleted = completedSet.has(action.id)

            return (
              <li
                key={action.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                  isCompleted ? 'bg-green-50' : 'bg-stone-50'
                )}
              >
                {/* Checkbox / checkmark */}
                {isCompleted ? (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="h-5 w-5 shrink-0 rounded-full border-2 border-stone-300" />
                )}

                {/* Label */}
                <span
                  className={cn(
                    'flex-1 text-sm',
                    isCompleted
                      ? 'text-green-800 line-through'
                      : 'text-stone-700'
                  )}
                >
                  {action.label}
                </span>

                {/* Reward badge */}
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'bg-brand-50 text-brand-700'
                  )}
                >
                  +{action.reward} {action.reward === 1 ? 'ejecucion' : 'ejecuciones'}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
