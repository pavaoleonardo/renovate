'use client'

import { useEffect } from 'react'

/**
 * Registers the shell service worker (`public/sw.js`).
 *
 * It is a client component with no markup: the worker is a browser API, and the
 * only thing the server needs to do is ship this one script.
 *
 * Deliberately **production only**. In development the worker would cache the
 * output of `next dev`, whose URLs do not change between saves, so the browser
 * would keep serving yesterday's bundle after an edit and the reloads would look
 * like a broken app. Unregistering the old worker is also part of the job: a
 * browser that installed one in a previous session has to let go of it.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => void registration.unregister()))
        .catch(() => undefined)
      return undefined
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
        // A failed registration must never break the app: it only means the
        // offline page will not be there.
        console.error('sw: registration failed', error)
      })
    }

    if (document.readyState === 'complete') {
      register()
      return undefined
    }

    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
