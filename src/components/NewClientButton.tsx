'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus } from 'lucide-react'
import { addClient } from '@/app/actions'
import ConstructionLoader from '@/components/ConstructionLoader'

/**
 * «Nuevo cliente» and the form it opens.
 *
 * The three fields used to sit open in the page header, always on screen and always
 * squeezing the list on a phone: a permanent form for something done once in a while.
 * Closed by default, the header keeps one job — the one the page is for, reading the
 * list — and the fields appear in a card over the page, the app's shape for every
 * question it asks (`NameDialog`, `ConfirmDialog`).
 *
 * Enter in any field creates the client; the card never closes itself, so a rejected
 * insert keeps the typed name next to its reason. On success the app goes straight to
 * the new ficha, because a client without an obra is a card with nothing to do.
 */
export default function NewClientButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // A fresh form every time, with the cursor already in the first field: on a phone
  // that is the difference between one tap and two.
  useEffect(() => {
    if (!open) return
    setName('')
    setEmail('')
    setPhone('')
    setError(null)
    nameRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving])

  const canSubmit = name.trim().length > 0 && !saving

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const client = await addClient(name.trim(), { email: email.trim(), phone: phone.trim() })
      // No `setSaving(false)` on the way out: the card stays covered by its own loader
      // until the ficha replaces it, so the tap never looks like it was lost.
      router.push(`/clients/${client.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el cliente.')
      setSaving(false)
    }
  }

  const field =
    'mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-zinc-900 transition placeholder:font-medium placeholder:text-zinc-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50'
  const caption = 'text-[10px] font-black uppercase tracking-widest text-zinc-400'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-5 py-2.5 font-bold text-white shadow transition hover:bg-blue-700 active:scale-95 sm:w-auto"
      >
        <Plus size={16} /> Nuevo cliente
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-client-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!saving) setOpen(false)
          }}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-zinc-100 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-full bg-blue-50 p-2 text-blue-600">
                <UserPlus size={20} />
              </div>
              <div className="min-w-0">
                <h3 id="new-client-title" className="text-lg font-extrabold text-zinc-900">
                  Nuevo cliente
                </h3>
                <p className="mt-1 text-sm font-medium leading-snug text-zinc-500">
                  Solo el nombre es obligatorio. El email y el teléfono salen en los presupuestos
                  que le envíes.
                </p>
              </div>
            </div>

            <label className="mt-4 block">
              <span className={caption}>Nombre</span>
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre del cliente..."
                maxLength={120}
                autoComplete="off"
                enterKeyHint="next"
                disabled={saving}
                className={`${field} font-bold`}
              />
            </label>

            <label className="mt-3 block">
              <span className={caption}>Email</span>
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@correo.com"
                maxLength={120}
                autoComplete="off"
                enterKeyHint="next"
                disabled={saving}
                className={`${field} font-medium`}
              />
            </label>

            <label className="mt-3 block">
              <span className={caption}>Teléfono</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="600 000 000"
                maxLength={40}
                autoComplete="off"
                enterKeyHint="done"
                disabled={saving}
                className={`${field} font-medium`}
              />
            </label>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="flex-1 rounded-xl bg-zinc-100 px-4 py-2.5 font-bold text-zinc-900 transition hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                aria-busy={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {saving ? (
                  <ConstructionLoader size="sm" tone="invert" label="Creando…" />
                ) : (
                  'Crear cliente'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
