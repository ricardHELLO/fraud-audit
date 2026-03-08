import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase'
import { ReportLayout } from '@/components/report/ReportLayout'
import type { ReportData } from '@/lib/types/report'
import { serverTrackReportViewed } from '@/lib/posthog-server-events'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ReportRow {
  id: string
  slug: string
  status: string
  report_data: ReportData | null
  external_views: number
  organization_id: string
  organizations: {
    name: string
  }
}

interface PageProps {
  params: { slug: string }
}

/* ------------------------------------------------------------------ */
/*  Metadata generation                                                 */
/* ------------------------------------------------------------------ */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const supabase = createServerClient()

  const { data: report } = await supabase
    .from('reports')
    .select('slug, status, report_data, organizations(name)')
    .eq('slug', params.slug)
    .single<Pick<ReportRow, 'slug' | 'status' | 'report_data' | 'organizations'>>()

  if (!report || report.status !== 'completed') {
    return {
      title: 'Informe - FraudAudit',
    }
  }

  const orgName =
    report.report_data?.summary?.organization_name ??
    report.organizations?.name ??
    'Restaurante'

  return {
    title: `Informe de Fraude - ${orgName}`,
    description: `Informe de analisis de fraude operativo para ${orgName}. Generado por FraudAudit.`,
    openGraph: {
      title: `Informe de Fraude - ${orgName}`,
      description: `Analisis de fraude operativo con deteccion de cancelaciones sospechosas, descuadres de caja y patrones irregulares.`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Informe de Fraude - ${orgName}`,
      description: `Analisis de fraude operativo para ${orgName}.`,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Page component (Server Component)                                   */
/* ------------------------------------------------------------------ */

export default async function InformePage({ params }: PageProps) {
  const supabase = createServerClient()

  // Fetch the report by slug
  const { data: report, error } = await supabase
    .from('reports')
    .select(
      'id, slug, status, report_data, external_views, organization_id, organizations(name)'
    )
    .eq('slug', params.slug)
    .single<ReportRow>()

  // Report not found
  if (error || !report) {
    notFound()
  }

  // Increment external_views counter (fire-and-forget)
  supabase
    .from('reports')
    .update({ external_views: (report.external_views ?? 0) + 1 })
    .eq('id', report.id)
    .then(() => {
      // View counter updated silently
    })

  // Track report view in PostHog
  serverTrackReportViewed(report.organization_id || 'anonymous', {
    slug: report.slug,
    is_owner: false, // Public page, assume external viewer
    source: 'shared_link',
  })

  // --- Status: Processing ---
  if (report.status === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="mx-auto max-w-md px-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
            <svg
              className="h-8 w-8 animate-spin text-brand-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Informe en proceso
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            Tu informe esta siendo generado. Vuelve en unos minutos para ver los
            resultados.
          </p>
          <p className="mt-6 text-xs text-stone-400">
            Slug: {report.slug}
          </p>
        </div>
      </div>
    )
  }

  // --- Status: Failed ---
  if (report.status === 'failed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="mx-auto max-w-md px-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-8 w-8 text-red-600"
            >
              <path
                fillRule="evenodd"
                d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Error al generar informe
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            Hubo un error al procesar tus datos. Contacta con soporte si el
            problema persiste.
          </p>
        </div>
      </div>
    )
  }

  // --- Status: Completed but no data ---
  if (!report.report_data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="mx-auto max-w-md px-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Informe sin datos
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            Este informe no contiene datos de analisis. Esto puede ocurrir si el
            archivo subido no tenia informacion suficiente.
          </p>
        </div>
      </div>
    )
  }

  // --- Status: Completed ---
  return <ReportLayout data={report.report_data} />
}
