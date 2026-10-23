import { describe, expect, it } from 'vitest'
import { PWA_ICONS, PWA_START_URL, pwaManifest } from '@/lib/pwa'

/**
 * The manifest is the difference between "a web page" and "the app on the home
 * screen". A typo here is invisible in `tsc` and in `next build`, and only shows
 * up when an install prompt never appears — hence the assertions.
 */
describe('pwaManifest', () => {
  const manifest = pwaManifest()

  it('abre instalada en Clientes, no en una pestaña con barra de direcciones', () => {
    expect(manifest.start_url).toBe('/clients')
    expect(PWA_START_URL).toBe('/clients')
    expect(manifest.display).toBe('standalone')
    expect(manifest.scope).toBe('/')
  })

  it('lleva el color de la app, para que la splash no parpadee en otro blanco', () => {
    expect(manifest.theme_color).toBe('#2563eb')
    expect(manifest.background_color).toBe('#fafafa')
  })

  it('se identifica en español', () => {
    expect(manifest.name).toContain('Renovate')
    expect(manifest.short_name).toBe('Renovate')
    expect(manifest.lang).toBe('es')
  })

  it('trae 192 y 512 para instalar, y un maskable que Android puede recortar', () => {
    const sizes = PWA_ICONS.map((icon) => `${icon.sizes}:${icon.purpose}`)
    expect(sizes).toContain('192x192:any')
    expect(sizes).toContain('512x512:any')
    expect(sizes).toContain('512x512:maskable')
    for (const icon of PWA_ICONS) {
      expect(icon.src).toMatch(/^\/icons\/[a-z0-9-]+\.png$/)
      expect(icon.type).toBe('image/png')
    }
  })
})
