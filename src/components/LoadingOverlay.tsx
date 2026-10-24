import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * The app's one wait with a card around it: a centred panel over a dimmed page, for
 * every job that owns the screen — opening a route, reading the company profile, a
 * whole catalogue of partidas, saving a budget, deleting an obra.
 *
 * It is a modal on purpose. The loader used to sit at the top of a skeleton page, so
 * the answer to «did my click land?» was a small mark far from the thumb that pressed
 * it; centred, at the same place every time and over a scrim that stops the next tap,
 * a slow save can neither be missed nor be started twice.
 *
 * `open` exists so a caller can render it unconditionally next to its own state
 * (`<LoadingOverlay open={saving} … />`) instead of branching in its JSX. Callers that
 * fire on something the user just pressed — a save, a delete — show it only after a
 * short delay, so a request that lands in 120 ms does not flash a dialog.
 */
export default function LoadingOverlay({
  label,
  hint,
  open = true,
}: {
  label: string
  hint?: string
  open?: boolean
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm print:hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-zinc-100 bg-white px-6 py-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
        <ConstructionLoader size="lg" />
        <div className="min-w-0">
          <p className="text-center text-base font-extrabold leading-tight text-zinc-900">{label}</p>
          {hint ? <p className="mt-1.5 text-center text-xs font-medium leading-snug text-zinc-500">{hint}</p> : null}
        </div>
      </div>
    </div>
  )
}
