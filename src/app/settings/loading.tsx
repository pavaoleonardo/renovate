import ConstructionLoader from '@/components/ConstructionLoader'

/** Ajustes reads the company profile through /api/company on mount. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <ConstructionLoader size="lg" label="Cargando los datos de tu empresa…" />
      <p className="text-zinc-400 text-sm font-medium mt-2 pl-[4.25rem]">
        Nombre, CIF, contacto y logo: es lo que firma cada presupuesto.
      </p>

      <div className="mt-8 bg-white p-6 sm:p-8 rounded-2xl border border-zinc-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-6">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="h-32 w-32 shrink-0 rounded-2xl bg-zinc-100 animate-pulse" />
          <div className="flex-1 space-y-2 pt-2">
            <div className="h-4 w-40 rounded bg-zinc-100 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-zinc-100 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-zinc-100 animate-pulse" />
          </div>
        </div>

        <div className="space-y-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-32 rounded bg-zinc-100 animate-pulse" />
              <div className="h-12 rounded-xl bg-zinc-50 border border-zinc-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
