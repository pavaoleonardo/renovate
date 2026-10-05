import { catalogKey } from '@/lib/catalog-key'
import { DEFAULT_CATALOG } from '@/lib/default-catalog'

/** Banda de mercado de una partida del catálogo por defecto. */
export interface MarketBand {
  code: string
  price_min: number
  price_max: number
}

const bandByName = new Map<string, MarketBand>()
const bandByCode = new Map<string, MarketBand>()

for (const phase of DEFAULT_CATALOG) {
  for (const service of phase.services) {
    const band: MarketBand = { code: service.code, price_min: service.price_min, price_max: service.price_max }
    bandByName.set(catalogKey(service.name), band)
    bandByCode.set(catalogKey(service.code), band)
  }
}

/**
 * Banda del catálogo por defecto que le corresponde a una línea importada: por
 * código primero (el único identificador exacto que puede traer una hoja) y por
 * nombre después.
 *
 * `null` significa que no tenemos referencia para esa línea: se importa sin banda,
 * que es lo correcto. La banda es una referencia NUESTRA; el precio sigue siendo
 * el del documento y no se le atribuye ninguna base.
 */
export function findMarketBand(input: { name: string; code?: string | null }): MarketBand | null {
  if (input.code) {
    const byCode = bandByCode.get(catalogKey(input.code))
    if (byCode) return byCode
  }
  return bandByName.get(catalogKey(input.name)) ?? null
}

const tokenSet = (key: string) => new Set(key.split(' ').filter(Boolean))

const tokenOverlap = (a: Set<string>, b: Set<string>) => {
  let shared = 0
  // forEach, not for…of: the project targets ES5 and a Set is not an array.
  a.forEach((token) => {
    if (b.has(token)) shared++
  })
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

/** A name shorter than this is never merged by containment: «Otros» would swallow anything. */
const MIN_CONTAINMENT_LENGTH = 6

/** Two names are «similar» from here on (token overlap). */
const SIMILARITY_THRESHOLD = 0.6

/**
 * Nombre de la sección que ya existe y con la que se debe fusionar una importada.
 *
 * Primero la coincidencia exacta (sin acentos ni mayúsculas); después «un nombre
 * está contenido en el otro», que es lo que junta «Demoliciones» con
 * «Demoliciones y Trabajos Previos»; y por último el solapamiento de palabras, que
 * junta «Fontanería y saneamiento» con «Fontanería».
 *
 * Es determinista y gratis. Una pasada de IA sólo merece la pena cuando esto
 * devuelve `null` y el usuario la pide, porque cada importación sería una llamada
 * de pago.
 */
export function matchPhaseName(incoming: string, existing: string[]): string | null {
  const key = catalogKey(incoming)
  if (!key) return null

  for (const name of existing) if (catalogKey(name) === key) return name

  for (const name of existing) {
    const other = catalogKey(name)
    if (!other) continue
    if (key.length >= MIN_CONTAINMENT_LENGTH && other.includes(key)) return name
    if (other.length >= MIN_CONTAINMENT_LENGTH && key.includes(other)) return name
  }

  let best: { name: string; score: number } | null = null
  const tokens = tokenSet(key)
  for (const name of existing) {
    const other = tokenSet(catalogKey(name))
    if (other.size === 0) continue
    const score = tokenOverlap(tokens, other)
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { name, score }
  }

  return best?.name ?? null
}
