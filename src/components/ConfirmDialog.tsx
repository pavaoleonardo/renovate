'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * A confirmation dialog that can show the work it starts.
 *
 * `window.confirm` freezes the page and cannot say anything while the delete runs,
 * so the destructive actions of the app ask inside this card instead: once
 * confirmed, the confirm button turns into the app's loader and both answers wait
 * (`pending`) until the action comes back. The dialog never closes itself — a
 * failed delete has to keep its reason on screen, so the caller decides when it
 * goes away.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Eliminar',
  pendingLabel = 'Eliminando…',
  tone = 'danger',
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  /** The consequence, stated plainly: what disappears and what does not. */
  description?: React.ReactNode
  confirmLabel?: string
  pendingLabel?: string
  tone?: 'danger' | 'default'
  /** The action is in flight: the loader replaces the label and nothing can be pressed. */
  pending?: boolean
  /** Why it failed. It stays inside the dialog, which stays open. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus lands on the safe answer, and Escape leaves while nothing is running.
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onCancel])

  if (!open) return null

  const danger = tone === 'danger'

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onCancel()
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-100 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-full p-2 ${danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h3 id="confirm-dialog-title" className="text-lg font-extrabold text-zinc-900">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-sm font-medium leading-snug text-zinc-500">{description}</p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-xl bg-zinc-100 px-4 py-2.5 font-bold text-zinc-900 transition hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Espera…' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:cursor-progress ${
              danger ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400' : 'bg-zinc-900 hover:bg-black disabled:bg-zinc-500'
            }`}
          >
            {pending ? (
              <ConstructionLoader size="sm" tone="invert" label={pendingLabel} />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
