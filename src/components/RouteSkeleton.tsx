import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * What a route shows while its server component is still fetching.
 *
 * Next renders the nearest `loading.tsx` the moment a link is followed, so the
 * click has an answer even when the page needs several round trips (the editor
 * awaits six). The shape mirrors the real page — a title block, a list of rows
 * with their amounts — so nothing jumps when the data lands.
 */

/** Fixed widths: a random one would hydrate differently on the server. */
const ROW_WIDTHS = ['w-1/2', 'w-2/5', 'w-3/5', 'w-1/3', 'w-1/2', 'w-2/5']

export default function RouteSkeleton({
  label,
  hint,
  rows = 4,
}: {
  label: string
  hint?: string
  rows?: number
}) {
  return (
    <div role="status" aria-live="polite" className="max-w-shell mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <ConstructionLoader size="lg" label={label} />
          <p className="text-zinc-400 text-sm font-medium mt-2 pl-[4.25rem]">
            {hint ?? 'Un momento: los datos vienen de la base de datos.'}
          </p>
        </div>
        <div className="h-10 w-full md:w-56 rounded-xl bg-zinc-100 animate-pulse" />
      </div>

      <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="divide-y divide-zinc-50">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-4">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-zinc-100 animate-pulse" />
              <div className={`h-3.5 rounded bg-zinc-100 animate-pulse ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
              <div className="ml-auto h-3.5 w-16 shrink-0 rounded bg-zinc-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
