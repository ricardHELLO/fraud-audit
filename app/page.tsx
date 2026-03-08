import Link from 'next/link'

const steps = [
  {
    number: '01',
    title: 'Sube tus datos',
    description:
      'Exporta los datos de tu sistema POS en formato CSV o Excel y subilos a la plataforma en segundos.',
    icon: (
      <svg
        className="h-8 w-8 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Analisis automatico',
    description:
      'Nuestro motor analiza cancelaciones, descuentos, cortesias y patrones sospechosos con inteligencia artificial.',
    icon: (
      <svg
        className="h-8 w-8 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
        />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Informe compartible',
    description:
      'Recibis un informe visual con hallazgos clave, ranking de riesgo por empleado y recomendaciones accionables.',
    icon: (
      <svg
        className="h-8 w-8 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    ),
  },
]

const stats = [
  { value: '2,400+', label: 'Informes generados' },
  { value: '$1.2M', label: 'Fraude detectado' },
  { value: '350+', label: 'Restaurantes protegidos' },
  { value: '< 5 min', label: 'Tiempo de analisis' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      {/* Navbar */}
      <nav className="border-b border-stone-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight text-stone-900">
            FraudAudit
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
            >
              Iniciar sesion
            </Link>
            <Link href="/login" className="btn-primary">
              Comenzar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
              Plataforma de auditoria para restaurantes
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
              Detecta fraude operativo en tu restaurante{' '}
              <span className="text-brand-600">en minutos</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-stone-600">
              Subi los datos de tu POS y obtene un informe detallado con
              cancelaciones sospechosas, descuentos irregulares y un ranking de
              riesgo por empleado. Sin instalar nada.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/login" className="btn-primary text-base">
                Genera tu informe gratis
              </Link>
              <Link href="#como-funciona" className="btn-secondary text-base">
                Como funciona
              </Link>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
          aria-hidden="true"
        >
          <div
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-brand-200 to-brand-50 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
          />
        </div>
      </section>

      {/* How It Works */}
      <section id="como-funciona" className="border-t border-stone-200 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              Como funciona
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              De datos crudos a decisiones en 3 pasos
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-12 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="relative text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                  {step.icon}
                </div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-brand-600">
                  Paso {step.number}
                </span>
                <h3 className="text-lg font-semibold text-stone-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="border-t border-stone-200 bg-stone-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              Resultados que hablan por si solos
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              Restaurantes de toda Latinoamerica ya usan FraudAudit para
              proteger sus operaciones.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold tracking-tight text-brand-600 sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm font-medium text-stone-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-stone-200 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-3xl rounded-2xl bg-stone-900 px-8 py-16 text-center shadow-xl sm:px-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Protege tu restaurante hoy
            </h2>
            <p className="mt-4 text-lg text-stone-300">
              Genera tu primer informe de fraude gratis. Sin tarjeta de credito,
              sin compromisos.
            </p>
            <div className="mt-10">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
              >
                Genera tu informe gratis
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="text-sm font-semibold text-stone-900">
              FraudAudit
            </span>
            <p className="text-sm text-stone-500">
              &copy; {new Date().getFullYear()} FraudAudit. Todos los derechos
              reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
