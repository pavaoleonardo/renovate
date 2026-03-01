'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-bold text-zinc-900">Algo ha ido mal</h2>
      <p className="text-zinc-500 font-medium">{error.message}</p>
      <button
        onClick={() => reset()}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold transition"
      >
        Intentar de nuevo
      </button>
    </div>
  )
}
