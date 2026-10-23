import type { MetadataRoute } from 'next'
import { pwaManifest } from '@/lib/pwa'

/**
 * Next serves this at `/manifest.webmanifest` and links it from every page, which
 * is what makes "Añadir a pantalla de inicio" open the app full screen instead of
 * a browser tab. The values live in `src/lib/pwa.ts` so they can be tested.
 */
export default function manifest(): MetadataRoute.Manifest {
  return pwaManifest()
}
