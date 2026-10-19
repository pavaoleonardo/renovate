import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * Full-screen wait, for a job that owns the page: reading an Excel, importing
 * hundreds of partidas, rewriting the whole catalogue.
 *
 * It is not decoration — while it is up the underlying buttons cannot be pressed
 * twice, which is exactly the bug a slow import invites. It is deliberately not
 * used for a single-row save (those get a loader inside their own button, so the
 * screen does not flash).
 */
export default function LoadingOverlay({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-white/70 px-4 backdrop-blur-sm print:hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-8 py-8 shadow-[0_10px_40px_rgba(0,0,0,0.10)]">
        <ConstructionLoader size="lg" />
        <p className="text-center text-sm font-bold text-zinc-900">{label}</p>
        {hint ? <p className="text-center text-xs font-medium leading-snug text-zinc-500">{hint}</p> : null}
      </div>
    </div>
  )
}
