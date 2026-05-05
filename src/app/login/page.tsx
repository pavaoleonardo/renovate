import { login, signup } from './actions'
import Link from 'next/link'
import PasswordInput from '@/components/PasswordInput'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto min-h-screen">
      <div className="text-center mb-8">
        <h1 className="font-extrabold text-3xl tracking-tighter text-zinc-900">
          RENOVATE<span className="text-blue-600">.</span>
        </h1>
        <p className="text-zinc-500 font-medium text-sm mt-2">Inicia sesión para gestionar tus presupuestos</p>
      </div>

      <form className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-zinc-800">
        
        <label className="text-md font-bold mt-4" htmlFor="email">
          Correo electrónico
        </label>
        <input
          className="rounded-lg px-4 py-3 bg-zinc-50 border border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition mb-4 font-medium"
          name="email"
          placeholder="tu@ejemplo.com"
          required
        />

        <label className="text-md font-bold" htmlFor="password">
          Contraseña
        </label>
        <PasswordInput name="password" required />


        <div className="flex justify-end -mt-4 mb-4">
          <Link href="/login/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-semibold transition">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <button
          formAction={login}
          className="bg-blue-600 active:scale-[0.98] hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-xl shadow-md transition mb-2"
        >
          Iniciar Sesión
        </button>
        <button
          formAction={signup}
          className="bg-zinc-100 active:scale-[0.98] hover:bg-zinc-200 text-zinc-900 font-bold px-4 py-3 rounded-xl transition mb-2"
        >
          Crear Cuenta
        </button>

        {searchParams?.message && (
          <p className="mt-4 p-4 bg-zinc-100 text-zinc-600 font-medium text-center rounded-lg text-sm">
            {searchParams.message}
          </p>
        )}
      </form>
    </div>
  )
}
