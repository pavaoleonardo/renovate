'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * The app's one-question dialog: a name, typed here instead of in
 * `window.prompt`.
 *
 * The browser prompt is a grey box with the page's language, a text field the size
 * of a desktop window and a dismiss button that a thumb hits by accident. On site
 * nobody can tell whether what they typed was saved. This card asks the same thing
 * with the app's own type, keeps the answer on Enter, shows the loader while the
 * section is being created, and — like `ConfirmDialog` — never closes itself: if
 * the action fails, the reason stays next to the field and the name stays typed.
 */
export default function NameDialog({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = 'Crear',
  pendingLabel = 'Creando…',
  pending = false,
  error = null,
  onSubmit,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  /** Visible label for the field: what is being named. */
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  pendingLabel?: string
  /** The action is in flight: the loader replaces the label and nothing can be pressed. */
  pending?: boolean
  /** Why it failed. It stays inside the dialog, which stays open. */
  error?: string | null
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // A fresh question starts with an empty field, and the cursor is already in it —
  // on a phone that is the difference between one tap and two.
  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    inputRef.current?.focus()
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onCancel])

  if (!open) return null

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0 && !pending

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-dialog-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onCancel()
      }}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-zinc-100 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) onSubmit(trimmed)
        }}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-blue-50 p-2 text-blue-600">
            <Plus size={20} />
          </div>
          <div className="min-w-0">
            <h3 id="name-dialog-title" className="text-lg font-extrabold text-zinc-900">
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-sm font-medium leading-snug text-zinc-500">{description}</p>
            ) : null}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="done"
            disabled={pending}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 font-bold text-zinc-900 transition placeholder:font-medium placeholder:text-zinc-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-xl bg-zinc-100 px-4 py-2.5 font-bold text-zinc-900 transition hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={pending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {pending ? <ConstructionLoader size="sm" tone="invert" label={pendingLabel} /> : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
