'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import ConstructionLoader, { type LoaderTone, type LoaderVariant } from '@/components/ConstructionLoader'

/**
 * A submit button that tells the truth while its form is in flight.
 *
 * `useFormStatus` reads the pending state of the enclosing <form>, so a page that
 * is a server component (the client's ficha, the client list, the login screens)
 * gets a loader and a disabled button back without becoming a client page itself.
 * The server action keeps living where it was: this only owns the feedback.
 */
export default function SubmitButton({
  children,
  pendingLabel = 'Guardando…',
  pendingHint,
  variant = 'crane',
  tone = 'invert',
  className = '',
  ...rest
}: {
  children: ReactNode
  /** Text shown while the form is in flight («Creando la obra…»). */
  pendingLabel?: string
  /** Optional second line, for a wait that deserves an explanation. */
  pendingHint?: string
  variant?: LoaderVariant
  tone?: LoaderTone
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  const { pending } = useFormStatus()

  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={`${className} ${pending ? 'cursor-progress' : 'disabled:cursor-not-allowed'}`}
    >
      {pending ? (
        <span className="inline-flex flex-col items-center justify-center gap-0.5">
          <ConstructionLoader variant={variant} size="sm" tone={tone} label={pendingLabel} />
          {pendingHint ? (
            <span className={`text-[10px] font-semibold ${tone === 'invert' ? 'text-white/80' : 'text-zinc-500'}`}>
              {pendingHint}
            </span>
          ) : null}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
