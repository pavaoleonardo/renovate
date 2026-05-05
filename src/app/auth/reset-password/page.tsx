import { updatePassword } from '@/app/login/actions'
import Link from 'next/link'
import PasswordInput from '@/components/PasswordInput'

export default function ResetPasswordPage({
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
        <p className="text-zinc-500 font-medium text-sm mt-2">Crea una nueva contraseña</p>
      </div>

      <form className="flex flex-col w-full gap-2 text-zinc-800">
        <label className="text-md font-bold mt-4" htmlFor="password">
          Nueva contraseña
        </label>
        <PasswordInput name="password" minLength={8} required />
        <p className="text-zinc-400 text-xs mb-4">Mínimo 8 caracteres.</p>

        <button
          formAction={updatePassword}
          className="bg-blue-600 active:scale-[0.98] hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-xl shadow-md transition mb-2"
        >
          Guardar nueva contraseña
        </button>

        {searchParams?.message && (
          <p className="mt-4 p-4 bg-red-50 text-red-600 font-medium text-center rounded-lg text-sm border border-red-100">
            {searchParams.message}
          </p>
        )}
      </form>

      <Link
        href="/login"
        className="text-center text-zinc-400 hover:text-zinc-600 font-medium text-sm transition mt-4"
      >
        ← Volver al inicio de sesión
      </Link>
    </div>
  )
}
