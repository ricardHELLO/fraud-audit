'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Route-level error boundary for /informe/[slug].
 *
 * Se activa cuando un render o un data-fetch tira una excepción en el segmento
 * (fallo de Supabase, `report_data` corrupto, parser de AI insights que explota,
 * etc). Mantiene el shell de la app (layout padre) y ofrece reintento o salida.
 *
 * AUDIT-012 refuerzo: complementa al <TabErrorBoundary> que envuelve cada tab
 * dentro de <ReportLayout>. Ese captura errores de **tab**; este captura errores
 * del **segmento** (fetch del reporte, metadata, hidratación inicial).
 */
export default function InformeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server-side ya tiene el stack en logs de Vercel (vía error.digest).
    // En el navegador logueamos el mensaje para que aparezca en Sentry/PostHog
    // si se configuran. No incluimos el stack completo para no contaminar la UI.
    console.error('[Informe] render error', {
      digest: error.digest,
      message: error.message,
    })
  }, [error])

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-8 w-8 text-red-600"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-stone-900">
          No pudimos cargar este informe
        </h2>

        <p className="mt-2 text-sm text-stone-500">
          Ha ocurrido un error inesperado al renderizar el informe. Esto suele
          resolverse reintentando en unos segundos.
        </p>

        {isDev && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-stone-900 px-3 py-2 text-left text-xs text-stone-100">
            {error.message}
          </pre>
        )}

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-stone-400">
            Ref. técnica: <span className="select-all">{error.digest}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 sm:w-auto"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="w-full rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 sm:w-auto"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
