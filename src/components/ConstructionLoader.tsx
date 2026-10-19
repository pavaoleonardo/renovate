import type { CSSProperties, ReactElement } from 'react'

export type LoaderVariant = 'wall' | 'crane' | 'level' | 'mixer'
export type LoaderSize = 'sm' | 'md' | 'lg'
export type LoaderTone = 'light' | 'invert'

/**
 * The app's loading indicator: a construction material doing the work being
 * waited for, instead of a generic spinner.
 *
 * - `wall`  — bricks being laid, for a page or a list that is being built.
 * - `crane` — a load on the hook, for a save or an import that will land.
 * - `level` — the bubble of a spirit level running along its vial, for a check
 *             that is pending (the AI pass over doubtful lines).
 * - `mixer` — a turning cement drum, for a slow background job (an upload).
 *
 * Everything is pure CSS (`globals.css`, `.cl-*` classes), so there are no timers
 * or effects to leak, and `prefers-reduced-motion` freezes them into a still
 * picture. The palette lives in CSS variables, so the same markup reads on a white
 * card (`tone="light"`) and inside a dark or blue button (`tone="invert"`).
 */

const BOX: Record<LoaderVariant, Record<LoaderSize, string>> = {
  wall: { sm: 'h-4 w-7', md: 'h-6 w-10', lg: 'h-9 w-14' },
  crane: { sm: 'h-6 w-6', md: 'h-9 w-9', lg: 'h-12 w-12' },
  level: { sm: 'h-3.5 w-8', md: 'h-5 w-12', lg: 'h-7 w-16' },
  mixer: { sm: 'h-6 w-6', md: 'h-9 w-9', lg: 'h-12 w-12' },
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

/** A tower crane: mast, jib, and the load riding the hook. */
function Crane({ box }: { box: string }) {
  return (
    <span className={`relative ${box}`}>
      <span className="absolute left-[18%] top-0 h-full w-[2px] rounded bg-[color:var(--cl-line)]" />
      <span className="absolute left-[18%] top-0 h-[2px] w-[82%] rounded bg-[color:var(--cl-line)]" />
      <span className="cl-crane-hook absolute right-[4%] top-[2px] flex h-[80%] w-[36%] flex-col items-center">
        <span className="w-[1.5px] flex-1 bg-[color:var(--cl-line)]" />
        <span className="h-[38%] w-full rounded-[2px] bg-[color:var(--cl-accent)]" />
      </span>
    </span>
  )
}

/** A spirit level: the vial, and the bubble looking for the middle. */
function Level({ box }: { box: string }) {
  return (
    <span
      className={`relative flex items-center rounded-full border-2 border-[color:var(--cl-line)] bg-[color:var(--cl-mortar)] p-[2px] ${box}`}
    >
      <span className="flex h-full flex-1 items-center overflow-hidden rounded-full bg-[color:var(--cl-solid)]">
        <span className="cl-level-bubble mx-auto h-[70%] w-[26%] rounded-full bg-[color:var(--cl-accent)]" />
      </span>
    </span>
  )
}

/** A cement mixer: the drum turning on its chassis. */
function Mixer({ box }: { box: string }) {
  return (
    <span className={`relative ${box}`}>
      <span className="absolute inset-x-0 bottom-0 h-[14%] rounded-full bg-[color:var(--cl-line)]" />
      <span className="absolute inset-x-[4%] bottom-[12%] top-0 overflow-hidden rounded-[46%] bg-[color:var(--cl-solid)]">
        <span className="cl-mixer-drum absolute inset-0">
          <span className="absolute inset-x-0 top-0 h-1/2 bg-[color:var(--cl-accent)]" />
          <span className="absolute left-1/2 top-1/2 h-1/2 w-[2px] -translate-x-1/2 bg-[color:var(--cl-accent)]" />
        </span>
      </span>
    </span>
  )
}

const ART: Record<LoaderVariant, (props: { box: string }) => ReactElement> = {
  wall: Wall,
  crane: Crane,
  level: Level,
  mixer: Mixer,
}

export default function ConstructionLoader({
  variant = 'wall',
  size = 'md',
  tone = 'light',
  label,
  className = '',
}: {
  variant?: LoaderVariant
  size?: LoaderSize
  tone?: LoaderTone
  /** Visible text next to the material. Without it the loader is announced as «Cargando». */
  label?: string
  className?: string
}) {
  const Art = ART[variant]
  const box = BOX[variant][size]

  return (
    <span
      role="status"
      aria-live="polite"
      className={`cl-loader ${tone === 'invert' ? 'cl-loader-invert' : ''} inline-flex items-center gap-2.5 ${className}`}
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        <Art box={box} />
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
