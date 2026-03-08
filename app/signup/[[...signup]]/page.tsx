import { SignUp } from '@clerk/nextjs'

export const metadata = {
  title: 'Crear Cuenta - FraudAudit',
}

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            FraudAudit
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Crea tu cuenta gratuita y recibe 100 creditos
          </p>
        </div>
        <SignUp
          signInUrl="/login"
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
