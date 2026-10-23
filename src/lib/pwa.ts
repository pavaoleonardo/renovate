import type { MetadataRoute } from 'next'

/**
 * The installable app's identity, in one place and with no runtime imports, so a
 * test can read the same values the browser gets.
 *
 * A phone in a `standalone` window is the point: the tester works on site, and
 * an installed app opens straight into *Clientes* without an address bar, a
 * share sheet or a stray "open in Safari" tap between him and the obra. The
 * colours are the ones the layout already paints (`#2563eb` browser bar,
 * `#fafafa` body), so the splash screen does not flash a different white.
 */

export const PWA_NAME = 'Renovate — Presupuestos de obra'
export const PWA_SHORT_NAME = 'Renovate'
export const PWA_THEME_COLOR = '#2563eb'
export const PWA_BACKGROUND_COLOR = '#fafafa'
export const PWA_START_URL = '/clients'

/**
 * Two shapes of the same mark: `any` keeps the rounded blue tile (browsers paint
 * it as-is, e.g. on iOS), `maskable` bleeds to the edges so Android can crop it
 * to a circle or a squircle without cutting the bricks.
 */
export const PWA_ICONS: NonNullable<MetadataRoute.Manifest['icons']> = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

export function pwaManifest(): MetadataRoute.Manifest {
  return {
    name: PWA_NAME,
    short_name: PWA_SHORT_NAME,
    description: 'Presupuestos de reforma, obra a obra, desde el móvil.',
    start_url: PWA_START_URL,
    // One app, one scope: every route belongs to the installed window.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: 'es',
    dir: 'ltr',
    icons: PWA_ICONS,
  }
}
