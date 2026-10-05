import { catalogKey } from '@/lib/catalog-key'
import { DEFAULT_CATALOG } from '@/lib/default-catalog'

/** Banda de mercado de una partida del catálogo por defecto. */
export interface MarketBand {
  code: string
  name: string
  unit: string
  price_min: number
  price_max: number
}

/** La partida del catálogo por defecto con la que se emparejó una línea importada. */
export interface MarketMatch {
  band: MarketBand
  /** Nombre de la partida del catálogo por defecto («Demolición de tabique…»). */
  name: string
  /** 1 cuando el emparejado fue exacto (código o nombre); < 1 cuando fue por parecido. */
  score: number
  reason: 'code' | 'name' | 'similar'
}

const bandByName = new Map<string, MarketBand>()
const bandByCode = new Map<string, MarketBand>()
const bandEntries: MarketBand[] = []

for (const phase of DEFAULT_CATALOG) {
  for (const service of phase.services) {
    const band: MarketBand = {
      code: service.code,
      name: service.name,
      unit: service.unit,
      price_min: service.price_min,
      price_max: service.price_max
    }
    bandByName.set(catalogKey(service.name), band)
    bandByCode.set(catalogKey(service.code), band)
    bandEntries.push(band)
  }
}

/**
 * Dos nombres son «el mismo» a partir de aquí. Es el umbral del emparejado de
 * secciones.
 */
export const SAME_NAME_SIMILARITY = 0.6

/**
 * A partir de aquí la fusión es segura y no se pregunta: es el mismo trabajo escrito
 * de otra forma («Demolición de tabique de ladrillo» vs «Demolición tabique ladrillo»).
 */
export const AUTO_MERGE_SIMILARITY = 0.72

/**
 * Por debajo de esto no se propone nada: son partidas distintas y forzar el
 * emparejado crearía fusiones falsas. Entre este umbral y `AUTO_MERGE_SIMILARITY` la
 * decisión es de la persona: la app propone y pregunta.
 */
export const AMBIGUOUS_SIMILARITY = 0.4

/** A name shorter than this is never merged by containment: «Otros» would swallow anything. */
const MIN_CONTAINMENT_LENGTH = 6

/**
 * Palabras que no distinguen nada («de», «y», «la», «2»): se quedan fuera del
 * solapamiento para que no diluyan la comparación.
 */
const STOPWORD_MAX_LENGTH = 2

const tokenSet = (key: string) =>
  new Set(key.split(' ').filter((token) => token.length > STOPWORD_MAX_LENGTH))

export interface NameComparison {
  /** 0 (nada que ver) … 1 (el mismo nombre, escrito igual). */
  score: number
  /** Cuántas palabras significativas comparten los dos nombres. */
  shared: number
}

/**
 * Cómo de parecidos son dos nombres de partida.
 *
 * Exacto = 1. Un nombre contenido en el otro = 0,85, pero **sólo** si comparten dos
 * palabras o más: «Pintura» dentro de «Pintura de paredes y techos» es demasiado
 * poco para fusionar sin preguntar, así que se queda en la banda de dudas (0,5). El
 * resto es el solapamiento de palabras (Jaccard), que junta «Fontanería y
 * saneamiento» con «Fontanería» (0,67 → se propone y decide la persona).
 */
export function compareNames(a: string, b: string): NameComparison {
  const keyA = catalogKey(a)
  const keyB = catalogKey(b)
  if (!keyA || !keyB) return { score: 0, shared: 0 }
  if (keyA === keyB) return { score: 1, shared: Math.max(tokenSet(keyA).size, 1) }

  const tokensA = tokenSet(keyA)
  const tokensB = tokenSet(keyB)
  let shared = 0
  // forEach, not for…of: the project targets ES5 and a Set is not an array.
  tokensA.forEach((token) => {
    if (tokensB.has(token)) shared++
  })

  const union = tokensA.size + tokensB.size - shared
  const jaccard = union === 0 ? 0 : shared / union

  const contained =
    (keyA.length >= MIN_CONTAINMENT_LENGTH && keyB.includes(keyA)) ||
    (keyB.length >= MIN_CONTAINMENT_LENGTH && keyA.includes(keyB))

  if (!contained) return { score: jaccard, shared }
  return { score: shared >= 2 ? 0.85 : Math.max(jaccard, 0.5), shared }
}

/** Atajo de `compareNames` para quien sólo necesita la nota. */
export const nameSimilarity = (a: string, b: string) => compareNames(a, b).score

/**
 * Nombre de la sección que ya existe y con la que se debe fusionar una importada.
 *
 * Primero la coincidencia exacta (sin acentos ni mayúsculas); después «un nombre
 * está contenido en el otro», que es lo que junta «Demoliciones» con
 * «Demoliciones y Trabajos Previos»; y por último el solapamiento de palabras, que
 * junta «Fontanería y saneamiento» con «Fontanería».
 *
 * Es la misma regla que la fusión de partidas (`matchIncomingService`), así que una
 * sección y una partida parecidas se reconocen igual.
 */
export function matchSimilarName(incoming: string, existing: string[]): string | null {
  const key = catalogKey(incoming)
  if (!key) return null

  for (const name of existing) if (catalogKey(name) === key) return name

  // Las secciones conservan la regla de siempre: basta con que un nombre esté contenido
  // en el otro (6 caracteres o más), que es lo que junta «Demoliciones» con
  // «Demoliciones y Trabajos Previos». Fusionar una sección de más se deshace en un
  // momento; fusionar una partida de más puede perderse un precio, y por eso las
  // partidas usan reglas más estrictas (`matchIncomingService`).
  for (const name of existing) {
    const other = catalogKey(name)
    if (!other) continue
    if (key.length >= MIN_CONTAINMENT_LENGTH && other.includes(key)) return name
    if (other.length >= MIN_CONTAINMENT_LENGTH && key.includes(other)) return name
  }

  let best: { name: string; score: number } | null = null
  for (const name of existing) {
    const score = nameSimilarity(incoming, name)
    if (score >= SAME_NAME_SIMILARITY && (!best || score > best.score)) best = { name, score }
  }

  return best?.name ?? null
}

/**
 * Sección que ya existe y con la que se debe fusionar una importada. Es
 * determinista y gratis: una pasada de IA sólo merece la pena cuando esto devuelve
 * `null` y el usuario la pide, porque cada importación sería una llamada de pago.
 */
export function matchPhaseName(incoming: string, existing: string[]): string | null {
  return matchSimilarName(incoming, existing)
}

/**
 * Partida del catálogo por defecto que le corresponde a una línea importada.
 *
 * Por código primero (el único identificador exacto que puede traer una hoja), por
 * nombre exacto después y, si no hay nada, por parecido: así una línea escrita a su
 * manera («Alicatado de baño con material incluido») hereda la banda de mercado de
 * la partida del catálogo base que describe el mismo trabajo.
 *
 * La banda es una referencia NUESTRA y sólo se propone cuando es creíble, porque
 * una banda de mentira es peor que ninguna: en el tramo por parecido se exige
 * compartir palabras significativas y la misma unidad —una banda de m2 no dice nada
 * de una línea que se mide por unidades—.
 */
export function findMarketMatch(input: { name: string; code?: string | null; unit?: string | null }): MarketMatch | null {
  if (input.code) {
    const byCode = bandByCode.get(catalogKey(input.code))
    if (byCode) return { band: byCode, name: byCode.name, score: 1, reason: 'code' }
  }

  const byName = bandByName.get(catalogKey(input.name))
  if (byName) return { band: byName, name: byName.name, score: 1, reason: 'name' }

  let best: { band: MarketBand; score: number } | null = null
  for (const candidate of bandEntries) {
    if (input.unit && candidate.unit !== input.unit) continue
    const comparison = compareNames(input.name, candidate.name)
    const credible = comparison.score >= AUTO_MERGE_SIMILARITY || comparison.shared >= 2
    if (!credible || comparison.score < AMBIGUOUS_SIMILARITY) continue
    if (!best || comparison.score > best.score) best = { band: candidate, score: comparison.score }
  }

  if (!best) return null
  return { band: best.band, name: best.band.name, score: best.score, reason: 'similar' }
}

/**
 * Banda del catálogo por defecto que le corresponde a una línea importada. `null`
 * significa que no tenemos referencia para esa línea: se importa sin banda, que es
 * lo correcto. La banda es una referencia nuestra; el precio sigue siendo el del
 * documento y no se le atribuye ninguna base.
 */
export function findMarketBand(input: { name: string; code?: string | null; unit?: string | null }): MarketBand | null {
  return findMarketMatch(input)?.band ?? null
}

/**
 * Precio orientativo para una partida que el documento no trae con precio: el punto
 * medio de la banda de mercado, redondeado al medio euro.
 *
 * Es una **estimación nuestra** para que nadie se quede con un 0,00 € en el
 * catálogo, no una tarifa: la app la etiqueta como estimación y la persona la
 * cambia cuando quiere (docs/catalogo-precios.md).
 */
export function bandSuggestedPrice(priceMin: number, priceMax: number): number {
  const middle = (priceMin + priceMax) / 2
  return Math.round(middle * 2) / 2
}
