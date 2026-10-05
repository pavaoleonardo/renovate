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

/**
 * Palabras con las que un presupuesto anuncia un título, no una sección: «Fase 1:
 * Demoliciones» y «Demoliciones» son la misma sección. Los documentos reales casi
 * nunca titulan sus capítulos como el catálogo por defecto, así que este ruido se
 * quita antes de comparar.
 */
const SECTION_HEADING =
  /^\s*(fase|cap[ií]tulo|secci[óo]n|apartado|bloque|grupo|tajo|zona|actuaci[óo]n|conjunto|unidad(?:es)? de obra)s?\b[\s.:\-–]*/i

/** «1. », «2) », «3-»: la numeración del capítulo, que tampoco distingue una sección. */
const SECTION_NUMBERING = /^\s*\d{1,2}\s*[.):\-–]\s*/

/**
 * Palabras que no distinguen una sección: que lo único que compartan dos nombres sea
 * «trabajos», «varios» o «instalaciones» no es motivo para fusionarlos.
 */
const GENERIC_SECTION_TOKENS = new Set([
  'trabajo',
  'trabajos',
  'vario',
  'varios',
  'varia',
  'varias',
  'otro',
  'otros',
  'otra',
  'otras',
  'general',
  'generales',
  'obra',
  'obras',
  'reforma',
  'reformas',
  'actuacion',
  'actuaciones',
  'instalacion',
  'instalaciones',
  'vivienda',
  'viviendas',
  'local',
  'locales'
])

/**
 * El nombre de una sección sin el ruido de su título («Capítulo 1. Demoliciones» →
 * «demoliciones»). Dos pasadas porque un título puede encadenar las dos cosas.
 */
export function sectionKey(value: string): string {
  let key = value
  for (let i = 0; i < 2; i++) key = key.replace(SECTION_HEADING, '').replace(SECTION_NUMBERING, '')
  return catalogKey(key)
}

/**
 * Palabras significativas de una sección, en singular y sin las que no distinguen.
 *
 * El plural importa: «Aislamiento» y «Pladur, Techos y Aislamientos» son la misma
 * sección aunque el documento escriba una en plural. Se guardan las dos formas en
 * lugar de elegir una, que es lo que hace que «aislamientos» y «aislamiento» se
 * encuentren sin inventar un lematizador.
 */
function sectionTokens(value: string): Set<string> {
  const tokens = new Set<string>()
  sectionKey(value)
    .split(' ')
    .forEach((token) => {
      if (token.length <= STOPWORD_MAX_LENGTH) return
      tokens.add(token)
      if (/ones$/.test(token)) tokens.add(token.replace(/ones$/, 'on'))
      else if (/s$/.test(token) && token.length > STOPWORD_MAX_LENGTH + 2) tokens.add(token.slice(0, -1))
    })
  return tokens
}

/**
 * Con qué fracción de las palabras del nombre más corto hay que quedarse para dar dos
 * secciones por la misma.
 *
 * «Demoliciones» (1 palabra) frente a «Demoliciones y Trabajos Previos» (3) comparte
 * 1 de 1 = 1,0 → se fusionan. «Instalación de fontanería y climatización» frente a
 * «Fontanería, saneamiento y calefacción» comparte 1 de 3 = 0,33 → no se fusionan
 * solas, y ahí es justo donde debe decidir la persona (o la IA): la sección del
 * documento cubre dos capítulos del catálogo.
 */
export const SECTION_COVERAGE = 0.5

/**
 * Cómo de bien cubre una sección a la otra por sus palabras. `0` cuando lo único que
 * comparten son palabras que no distinguen nada.
 */
function sectionCoverage(a: string, b: string): number {
  const tokensA = sectionTokens(a)
  const tokensB = sectionTokens(b)
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let shared = 0
  let distinctive = false
  tokensA.forEach((token) => {
    if (!tokensB.has(token)) return
    shared++
    if (!GENERIC_SECTION_TOKENS.has(token)) distinctive = true
  })

  if (!distinctive) return 0
  return shared / Math.min(tokensA.size, tokensB.size)
}

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
 * Sección que ya existe y con la que se debe fusionar una importada.
 *
 * Dos pasos, los dos deterministas y gratis:
 *
 * 1. La regla de siempre (`matchSimilarName`): nombre igual, uno contenido en el otro,
 *    o bastante solape de palabras.
 * 2. La cobertura de palabras del nombre más corto, que es lo que entiende cómo
 *    titulan los documentos reales: «Fase 1: Demoliciones» comparte su única palabra
 *    con «Demoliciones y Trabajos Previos», así que es la misma sección. Antes esto no
 *    se veía (el «Fase 1:» diluía el solape) y cada importación creaba ocho secciones
 *    nuevas al lado de las del catálogo por defecto.
 *
 * Una sección sin pistas suficientes —«Instalación de fontanería y climatización»,
 * que cubre dos capítulos— devuelve `null`: ahí decide la persona o la IA, porque
 * elegir por su cuenta sería inventarse una fusión.
 */
export function matchPhaseName(incoming: string, existing: string[]): string | null {
  const byName = matchSimilarName(incoming, existing)
  if (byName) return byName

  // Un nombre corto se fusiona con demasiadas cosas («Obra», «Varios»): la cobertura
  // exige el mismo mínimo que la contención de siempre.
  if (sectionKey(incoming).length < MIN_CONTAINMENT_LENGTH) return null

  let best: { name: string; score: number } | null = null
  for (const name of existing) {
    const score = sectionCoverage(incoming, name)
    if (score < SECTION_COVERAGE) continue
    if (!best || score > best.score) best = { name, score }
  }

  return best?.name ?? null
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
