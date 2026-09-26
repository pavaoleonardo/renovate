import { signup } from '../actions'
import Link from 'next/link'
import PasswordInput from '@/components/PasswordInput'

const inputClass =
  'rounded-lg px-4 py-3 bg-zinc-50 border border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition font-medium'

export default function SignupPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  const isSuccess = searchParams?.message?.includes('Check your email')

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto min-h-screen">
      <div className="text-center mb-8">
        <h1 className="font-extrabold text-3xl tracking-tighter text-zinc-900">
          RENOVATE<span className="text-blue-600">.</span>
        </h1>
        <p className="text-zinc-500 font-medium text-sm mt-2">Crea tu cuenta para empezar a presupuestar</p>
      </div>

      {isSuccess ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">📬</div>
          <p className="font-bold text-green-800 text-lg">¡Cuenta creada!</p>
          <p className="text-green-700 text-sm mt-1">
            Te hemos enviado un correo para confirmarla. Ábrelo y después inicia sesión.
          </p>
          <Link
            href="/login"
            className="inline-block mt-4 text-blue-600 hover:text-blue-700 font-semibold text-sm transition"
          >
            ← Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <form className="flex flex-col w-full gap-2 text-zinc-800">
          <label className="text-md font-bold mt-4" htmlFor="companyName">
            Nombre de la empresa
          </label>
          <input
            id="companyName"
            name="companyName"
            className={inputClass}
            placeholder="Reformas García S.L."
            autoComplete="organization"
          />
          <p className="text-zinc-400 text-xs">
            Aparecerá en la cabecera de tus presupuestos. Podrás cambiarlo en Ajustes.
          </p>

          <label className="text-md font-bold mt-2" htmlFor="email">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className={inputClass}
            placeholder="tu@ejemplo.com"
            autoComplete="email"
            required
          />

          <label className="text-md font-bold mt-2" htmlFor="password">
            Contraseña
          </label>
          <PasswordInput name="password" id="password" minLength={8} required />
          <p className="text-zinc-400 text-xs">Mínimo 8 caracteres.</p>

          <label className="text-md font-bold mt-2" htmlFor="confirmPassword">
            Repite la contraseña
          </label>
          <PasswordInput name="confirmPassword" id="confirmPassword" minLength={8} required />

          <button
            formAction={signup}
            className="bg-blue-600 active:scale-[0.98] hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-xl shadow-md transition mt-4"
          >
            Crear Cuenta
          </button>

          <Link
            href="/login"
            className="text-center text-zinc-500 hover:text-zinc-700 font-medium text-sm transition mt-3"
          >
            ← Volver al inicio de sesión
          </Link>

          {searchParams?.message && !isSuccess && (
            <p className="mt-4 p-4 bg-red-50 text-red-600 font-medium text-center rounded-lg text-sm border border-red-100">
              {searchParams.message}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
