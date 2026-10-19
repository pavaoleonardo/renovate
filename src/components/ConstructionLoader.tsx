import type { CSSProperties } from 'react'

export type LoaderSize = 'sm' | 'md' | 'lg'
export type LoaderTone = 'light' | 'invert'

/**
 * The app's one and only loading indicator: a brick wall being laid, course by
 * course, for as long as the app is still working on something.
 *
 * It is the same picture everywhere — a page opening, a form saving, a document
 * being read, a row being deleted — because one familiar mark says "still moving"
 * faster than a different animation in every corner. What is actually happening
 * is said by the `label`, so the loader never has to change shape to explain it.
 *
 * Everything is pure CSS (`globals.css`, `.cl-*` classes), so there are no timers
 * or effects to leak, and `prefers-reduced-motion` freezes it into a still
 * picture. The palette lives in CSS variables, so the same markup reads on a white
 * card (`tone="light"`) and inside a dark or blue button (`tone="invert"`).
 */

const BOX: Record<LoaderSize, string> = {
  sm: 'h-4 w-7',
  md: 'h-6 w-10',
  lg: 'h-9 w-14',
}

const TEXT: Record<LoaderSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

/** A wall three courses high, running bond, each brick set down after the one before. */
function Wall({ box }: { box: string }) {
  return (
    <span className={`relative flex flex-col gap-[2px] rounded-[3px] bg-[color:var(--cl-mortar)] p-[2px] ${box}`}>
      {[0, 1, 2].map((row) => (
        <span
          key={row}
          className="flex flex-1 gap-[2px]"
          style={row === 1 ? { paddingLeft: '22%' } : undefined}
        >
          {[0, 1, 2].map((brick) => (
            <span
              key={brick}
              className="cl-brick flex-1 rounded-[1px] bg-[color:var(--cl-accent)]"
              style={{ animationDelay: `${(row * 3 + brick) * 0.14}s` } as CSSProperties}
            />
          ))}
        </span>
      ))}
    </span>
  )
}

export default function ConstructionLoader({
  size = 'md',
  tone = 'light',
  label,
  className = '',
}: {
  size?: LoaderSize
  tone?: LoaderTone
  /** Visible text next to the bricks. Without it the loader is announced as «Cargando». */
  label?: string
  className?: string
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`cl-loader ${tone === 'invert' ? 'cl-loader-invert' : ''} inline-flex items-center gap-2.5 ${className}`}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        <Wall box={BOX[size]} />
      </span>
      {label ? (
        <span className={`font-bold ${TEXT[size]} ${tone === 'invert' ? 'text-white' : 'text-zinc-600'}`}>
          {label}
        </span>
      ) : (
        <span className="sr-only">Cargando…</span>
      )}
    </span>
  )
}
