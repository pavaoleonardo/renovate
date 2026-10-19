import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * Shape of the budget editor while its six reads are in flight
 * (`getEstimateDetails`, pending notes, clients, catalogue, company…). Both
 * routes that render `EstimateEditorLoader` share it, so following a link to an
 * obra never lands on a blank page.
 */
const LINE_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-3/5', 'w-2/5', 'w-1/2']

export default function EstimateEditorSkeleton() {
  return (
    <div role="status" aria-live="polite" className="max-w-shell mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <ConstructionLoader variant="crane" size="lg" label="Abriendo el presupuesto…" />
        <p className="text-zinc-400 text-sm font-medium mt-2 pl-[4.25rem]">
          Cargando las partidas, el catálogo y los datos de la empresa.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="mb-4 h-8 w-2/5 rounded-lg bg-zinc-100 animate-pulse" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border border-zinc-100 p-3">
                <div className="h-6 w-6 shrink-0 rounded bg-zinc-100 animate-pulse" />
                <div className={`h-3.5 rounded bg-zinc-100 animate-pulse ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
                <div className="ml-auto h-3.5 w-14 shrink-0 rounded bg-zinc-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-44 rounded-2xl border border-zinc-100 bg-white animate-pulse" />
          <div className="h-28 rounded-2xl border border-zinc-100 bg-white animate-pulse" />
        </div>
      </div>

      <div className="mx-auto mt-8 h-16 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white/90 animate-pulse" />
    </div>
  )
}
