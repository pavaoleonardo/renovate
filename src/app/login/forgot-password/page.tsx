import { forgotPassword } from '../actions'
import Link from 'next/link'

export default function ForgotPasswordPage({
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
        <p className="text-zinc-500 font-medium text-sm mt-2">Restablece tu contraseña</p>
      </div>

      {isSuccess ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">📬</div>
          <p className="font-bold text-green-800 text-lg">¡Correo enviado!</p>
          <p className="text-green-700 text-sm mt-1">
            Revisa tu bandeja de entrada y sigue el enlace para restablecer tu contraseña.
          </p>
          <Link
            href="/login"
            className="inline-block mt-4 text-blue-600 hover:text-blue-700 font-semibold text-sm transition"
          >
            ← Volver al inicio de sesión
          </Link>
        </div>
      ) : (
        <form className="flex flex-col w-full gap-2 text-zinc-800">
          <label className="text-md font-bold mt-4" htmlFor="email">
            Correo electrónico
          </label>
          <input
            className="rounded-lg px-4 py-3 bg-zinc-50 border border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition mb-2 font-medium"
            name="email"
            type="email"
            placeholder="tu@ejemplo.com"
            required
          />
          <p className="text-zinc-400 text-xs mb-4">
            Te enviaremos un enlace para restablecer tu contraseña.
          </p>

          <button
            formAction={forgotPassword}
            className="bg-blue-600 active:scale-[0.98] hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-xl shadow-md transition mb-2"
          >
            Enviar enlace de recuperación
          </button>

          <Link
            href="/login"
            className="text-center text-zinc-500 hover:text-zinc-700 font-medium text-sm transition"
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
