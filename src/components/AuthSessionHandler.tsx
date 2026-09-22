'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'missing'

/**
 * Completes Supabase auth links (password recovery + email confirmation).
 *
 * Email links land on the app with the credentials in the URL:
 *   - PKCE flow:       ?code=xxxxxxxx        -> must be exchanged for a session
 *   - Implicit flow:   #access_token=...     -> picked up by supabase-js on init
 *
 * Nothing else in the app did this, so `/auth/reset-password` arrived without a
 * session and `auth.updateUser()` failed with "Auth session missing!".
 * Mounted in the root layout so it works from any landing page.
 */
export default function AuthSessionHandler() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    let cancelled = false

    async function establishSession() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const hasHashToken = window.location.hash.includes('access_token')

      const hasLink = Boolean(code) || hasHashToken
      let linkFailed = false

      // 1. PKCE flow: exchange the one-time code for a session cookie.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        linkFailed = Boolean(error)

        // Remove the (now consumed) code so a reload can't reuse it.
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.pathname + url.search)
      }

      // 2. Read the session (also lets supabase-js finish parsing the URL hash).
      let session = (await supabase.auth.getSession()).data.session

      if (!session && hasHashToken) {
        await new Promise((resolve) => setTimeout(resolve, 600))
        session = (await supabase.auth.getSession()).data.session
      }

      if (hasHashToken) {
        // Tokens are single-use: strip them from the address bar.
        window.history.replaceState({}, '', url.pathname + url.search)
      }

      if (cancelled) return

      // A consumed or expired link must NEVER fall back to a session left over from
      // an earlier login: GoTrue refuses password changes from sessions older than
      // 24h ("Password update requires reauthentication" / reauthentication_needed),
      // which is a confusing error for someone resetting a password. Clear the stale
      // session so the user gets an actionable message instead.
      if (hasLink && (linkFailed || !session)) {
        await supabase.auth.signOut()
        if (!cancelled) setStatus('missing')
        return
      }

      if (hasLink) {
        // Fresh session cookie is now set client-side: re-render server components.
        router.refresh()
      }
    }

    establishSession()

    return () => {
      cancelled = true
    }
  }, [supabase, router])

  if (status === 'missing') {
    return (
      <div className="max-w-md mx-auto mt-6 px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="font-bold text-amber-900 text-sm">Enlace caducado o ya utilizado</p>
          <p className="text-amber-800 text-xs mt-1">
            Pide un enlace nuevo desde «¿Olvidaste tu contraseña?» y ábrelo en este mismo navegador.
          </p>
        </div>
      </div>
    )
  }

  return null
}
