'use client'

import React from 'react'
import type { ConclusionsResult } from '@/lib/types/report'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const severityBorderColor: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
}

const severityBadgeVariant: Record<string, 'danger' | 'warning' | 'success'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'success',
}

const severityLabel: Record<string, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ConclusionsTabProps {
  data: ConclusionsResult
}

export function ConclusionsTab({ data }: ConclusionsTabProps) {
  return (
    <div className="space-y-8">
      {/* Conclusions */}
      <section>
        <h2 className="text-xl font-bold text-stone-800 mb-4">Conclusiones</h2>
        <div className="space-y-4">
          {data.conclusions.map((c, i) => (
            <Card
              key={i}
              className={`border-l-4 ${severityBorderColor[c.severity] || 'border-l-stone-300'}`}
            >
              <CardContent className="py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Badge
                    variant={severityBadgeVariant[c.severity] || 'default'}
                  >
                    {severityLabel[c.severity] || c.severity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-stone-800">
                      {c.title}
                    </h3>
                    <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                      {c.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Immediate actions */}
      {data.immediate_actions.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-red-700">
                Acciones Inmediatas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2">
                {data.immediate_actions.map((action, i) => (
                  <li
                    key={i}
                    className="text-sm text-stone-700 leading-relaxed pl-1"
                  >
                    {action}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Structural actions */}
      {data.structural_actions.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-blue-700">
                Acciones Estructurales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2">
                {data.structural_actions.map((action, i) => (
                  <li
                    key={i}
                    className="text-sm text-stone-700 leading-relaxed pl-1"
                  >
                    {action}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
