import { SignIn } from '@clerk/nextjs'

export const metadata = {
  title: 'Iniciar Sesion - FraudAudit',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            FraudAudit
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Inicia sesion para acceder a tu panel de analisis
          </p>
        </div>
        <SignIn
          signUpUrl="/signup"
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'shadow-sm border border-stone-200',
            },
          }}
        />
      </div>
    </main>
  )
}
