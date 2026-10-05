import { catalogKey } from '@/lib/catalog-key'
import {
  AMBIGUOUS_SIMILARITY,
  AUTO_MERGE_SIMILARITY,
  compareNames,
  matchPhaseName
} from '@/lib/catalog-match'

/**
 * Las decisiones puras de una importación de Excel.
 *
 * Viven fuera de los módulos de servidor a propósito, igual que `catalog-key` y
 * `catalog-match`: son las reglas que deciden si una partida que ya existe se toca y
 * con qué sección se fusiona una que no encaja, y hay que poder comprobarlas sin base
 * de datos, sin sesión y sin clave de OpenAI. Los módulos de servidor se quedan con lo
 * que sí necesita red o datos.
 */

/** Un céntimo de diferencia no es un cambio de precio: es el mismo número redondeado. */
export const PRICE_EPSILON = 0.005

/** ¿El documento trae un precio distinto del que ya tiene la partida? */
export const priceChanged = (current: number | null, incoming: number) =>
  current === null || Math.abs(current - incoming) > PRICE_EPSILON

/**
 * Las secciones del documento que no encajan con ninguna de las que ya existen, sin
 * repetir y en el orden en que aparecen.
 *
 * Este filtro es lo que hace barata la IA: sólo se pregunta por lo que la fusión
 * determinista no supo resolver, y si no queda nada, no hay llamada que pagar.
 */
export function unmatchedSections(incoming: string[], existingNames: string[]): string[] {
  const unmatched: string[] = []
  for (const name of incoming) {
    if (matchPhaseName(name, existingNames)) continue
    if (unmatched.some((other) => catalogKey(other) === catalogKey(name))) continue
    unmatched.push(name)
  }
  return unmatched
}

/**
 * El texto que se le manda a la IA: las secciones que ya existen, las nuevas que no
 * encajaron, y la instrucción de elegir entre las existentes o ninguna.
 */
export function sectionMatchPrompt(unmatched: string[], existingNames: string[]): string {
  return `Eres un experto en presupuestos de obra y reformas en España.

El catálogo de la empresa ya tiene estas secciones:
${existingNames.map((name) => `- ${name}`).join('\n')}

Al importar un presupuesto aparecen estas secciones, que no coinciden con ninguna de las anteriores:
${unmatched.map((name) => `- ${name}`).join('\n')}

Decide con qué sección existente debe fusionarse cada sección nueva cuando se trate del mismo tipo de trabajo (por ejemplo, «Trabajos varios de albañilería» → «Albañilería»). Si una sección nueva no encaja con ninguna, deja su valor como cadena vacía: se creará como sección nueva.

Devuelve ÚNICAMENTE un JSON con este formato, usando EXACTAMENTE los nombres escritos arriba:
{ "nombre de la sección nueva": "nombre de la sección existente, o cadena vacía" }`
}

/**
 * Respuesta de la IA → «nombre importado → nombre de una sección que ya existe».
 *
 * La IA no puede crear ni renombrar nada: cualquier valor que no case con una sección
 * existente (inventado, vacío, o de otro tipo) se descarta, y esa sección se creará
 * nueva, que es lo seguro. Todo se compara por nombre normalizado, así que da igual
 * que el modelo devuelva el nombre con otra caja o con espacios de más.
 */
export function parseSectionMatches(
  answer: Record<string, unknown> | null | undefined,
  unmatched: string[],
  existingNames: string[]
): Map<string, string> {
  const answerByKey = new Map<string, string>()
  const entries: Record<string, unknown> = answer ?? {}
  Object.keys(entries).forEach((key) => {
    const value = entries[key]
    if (typeof value === 'string' && value.trim()) answerByKey.set(catalogKey(key), value)
  })

  const existingByKey = new Map<string, string>()
  for (const name of existingNames) existingByKey.set(catalogKey(name), name)

  const matches = new Map<string, string>()
  for (const incoming of unmatched) {
    const chosen = answerByKey.get(catalogKey(incoming))
    const existing = chosen ? existingByKey.get(catalogKey(chosen)) : undefined
    if (existing) matches.set(incoming, existing)
  }
  return matches
}

/**
 * Cómo de bien encaja una partida importada con una que la empresa ya tiene.
 *
 * - `exact`: el mismo nombre (sin acentos ni mayúsculas) o el mismo código que una
 *   partida que ya existe → se fusiona y sólo se corrige el precio si el documento
 *   trae otro.
 * - `auto`: escrito de otra forma, pero es claramente la misma partida → se fusiona
 *   sin preguntar.
 * - `similar`: se parece, pero no lo suficiente para decidir por su cuenta → la app
 *   propone la fusión y **pregunta** (al usuario, o a la IA si el usuario la activa).
 * - `new`: no se parece a nada → se crea.
 */
export type ServiceMatchStatus = 'exact' | 'auto' | 'similar' | 'new'

/** Una partida que la empresa ya tiene en su catálogo. */
export interface ExistingService {
  id: string
  name: string
  unit: string
  base_price: number
  phase_id: string
  phase_name?: string | null
  code?: string | null
}

/** Una partida leída del documento, con lo mínimo para decidir qué hacer con ella. */
export interface ImportedServiceInput {
  name: string
  unit: string
  base_price: number
  code?: string | null
  /** El documento trae precio para esta línea (0 sin esto es «sin precio»). */
  has_price?: boolean
}

export interface ServiceMatch {
  status: ServiceMatchStatus
  /** 1 en `exact`; la nota de parecido en `auto` / `similar`; 0 en `new`. */
  score: number
  /** Partida con la que se fusiona. `null` sólo cuando el estado es `new`. */
  target: ExistingService | null
  reason: 'code' | 'name' | 'similar' | 'none'
}

/** Clave estable de una línea importada: sección + partida, sin acentos ni mayúsculas. */

/**
 * Qué hacer con una partida importada frente a lo que la empresa ya tiene.
 *
 * El orden es el de siempre en este proyecto: primero lo exacto (código, después
 * nombre, dando preferencia a la misma sección) y sólo si no hay nada, el parecido.
 * Por debajo de `AMBIGUOUS_SIMILARITY` la partida es nueva; en la banda intermedia el
 * estado no es `auto` a propósito, porque ahí decide la persona.
 */
export function matchIncomingService(
  incoming: { name: string; code?: string | null },
  existing: ExistingService[],
  phaseName?: string | null
): ServiceMatch {
  const nameKey = catalogKey(incoming.name)
  const phaseKey = phaseName ? catalogKey(phaseName) : ''
  const inSamePhase = (service: ExistingService) =>
    !phaseKey || catalogKey(service.phase_name ?? '') === phaseKey

  if (incoming.code) {
    const codeKey = catalogKey(incoming.code)
    const byCode = existing.find(
      (service) => Boolean(service.code) && catalogKey(String(service.code)) === codeKey
    )
    if (byCode) return { status: 'exact', score: 1, target: byCode, reason: 'code' }
  }

  if (nameKey) {
    const exact = existing.find((service) => inSamePhase(service) && catalogKey(service.name) === nameKey)
    const anywhere = exact ?? existing.find((service) => catalogKey(service.name) === nameKey)
    if (anywhere) return { status: 'exact', score: 1, target: anywhere, reason: 'name' }
  }

  let best: { target: ExistingService; score: number } | null = null
  if (nameKey) {
    for (const service of existing) {
      const { score } = compareNames(incoming.name, service.name)
      if (score < AMBIGUOUS_SIMILARITY) continue
      const adjusted = score + (inSamePhase(service) ? SAME_PHASE_BONUS : 0)
      if (!best || adjusted > best.score) best = { target: service, score: adjusted }
    }
  }

  if (!best) return { status: 'new', score: 0, target: null, reason: 'none' }
  return {
    status: best.score >= AUTO_MERGE_SIMILARITY ? 'auto' : 'similar',
    score: best.score,
    target: best.target,
    reason: 'similar'
  }
}

/**
 * El plan de una importación: qué se hace con cada línea del documento. Es el mismo
 * objeto que ve el usuario en el resumen previo y el que se aplica al confirmar, así
 * que lo que se aprueba es exactamente lo que se guarda.
 */
export interface ImportPlanEntry {
  /** Clave de la línea (`importLineKey`). */
  key: string
  phaseName: string
  service: ImportedServiceInput
  match: ServiceMatch
}

export function importLineKey(phaseName: string, serviceName: string): string {
  return `${catalogKey(phaseName)}|${catalogKey(serviceName)}`
}

/**
 * La misma sección empuja la nota hacia arriba: una partida repetida dentro de su
 * fase es más probablemente la misma que una que casualmente se llama parecido en
 * otra fase.
 */
const SAME_PHASE_BONUS = 0.06


/** Una partida dudosa, con los candidatos de su catálogo entre los que elegir. */
export interface ImportMatchQuestion {
  /** Clave de la línea (`importLineKey`), la misma que devuelve el resumen previo. */
  key: string
  name: string
  unit?: string
  /** Candidatos ya acotados por la app: la IA elige entre ellos, o ninguno. */
  candidates: { id: string; name: string; unit: string; base_price: number }[]
}

/**
 * El texto que se le manda a la IA: las partidas que se parecen a algo del catálogo
 * pero no lo suficiente para fusionarlas solas, y los candidatos de cada una.
 *
 * La clave de cada línea se copia literalmente en la respuesta, así que la IA no
 * puede inventarse partidas nuevas: sólo elegir un candidato de la lista o decir que
 * ninguna encaja.
 */
export function itemMatchPrompt(questions: ImportMatchQuestion[]): string {
  const blocks = questions
    .map((question) => {
      const candidates = question.candidates
        .map(
          (candidate) =>
            `    - ${candidate.id} → «${candidate.name}» (${candidate.unit}, ${candidate.base_price} €)`
        )
        .join('\n')
      return [
        `- Clave: ${question.key}`,
        `  Partida importada: «${question.name}»${question.unit ? ` (${question.unit})` : ''}`,
        '  Partidas parecidas de su catálogo:',
        candidates
      ].join('\n')
    })
    .join('\n\n')

  return [
    'Eres un experto en presupuestos de obra y reformas en España.',
    '',
    'Al importar un presupuesto, algunas partidas se parecen a partidas que la empresa ya tiene',
    'en su catálogo, pero no lo suficiente para saber si son la misma. Decide, partida por partida,',
    'si la partida importada ES la partida del catálogo (el mismo trabajo, aunque esté escrita de',
    'otra forma) o si son trabajos distintos.',
    '',
    'Sé conservador: sólo fusiona cuando sea realmente el mismo trabajo. Si dudas, deja la cadena',
    'vacía y se creará una partida nueva.',
    '',
    blocks,
    '',
    'Devuelve ÚNICAMENTE un JSON cuya clave sea EXACTAMENTE la clave de cada línea y cuyo valor',
    'sea el id del candidato elegido o la cadena vacía:',
    '{ "clave-de-la-linea": "id-del-candidato-o-cadena-vacia" }'
  ].join('\n')
}

/**
 * Respuesta de la IA → «clave de la línea → id de la partida con la que se fusiona».
 *
 * La IA no puede inventarse nada: el id tiene que ser uno de los candidatos que se le
 * ofrecieron para esa línea (por id o por nombre normalizado) y la clave tiene que
 * existir, así que una respuesta rara se ignora y esa partida se crea nueva, que es
 * lo seguro.
 */
export function parseItemMatches(
  answer: Record<string, unknown> | null | undefined,
  questions: ImportMatchQuestion[]
): Map<string, string> {
  const answers = new Map<string, unknown>()
  const entries: Record<string, unknown> = answer ?? {}
  Object.keys(entries).forEach((key) => {
    answers.set(catalogKey(key), entries[key])
  })

  const matches = new Map<string, string>()
  for (const question of questions) {
    const chosen = answers.get(catalogKey(question.key)) ?? answers.get(catalogKey(question.name))
    if (typeof chosen !== 'string' || !chosen.trim()) continue

    const wanted = catalogKey(chosen)
    const candidate = question.candidates.find(
      (option) => option.id === chosen.trim() || catalogKey(option.name) === wanted
    )
    if (candidate) matches.set(question.key, candidate.id)
  }

  return matches
}

/**
 * Las líneas que hay que preguntar: las que se parecen a algo (estado `similar`) pero
 * no lo suficiente para fusionarlas solas. Es el filtro que hace barata la IA: sólo
 * se pregunta por las dudosas y, si no queda ninguna, no hay llamada que pagar.
 */
export function ambiguousMatches(matches: { key: string; status: ServiceMatchStatus }[]): string[] {
  const keys: string[] = []
  for (const match of matches) {
    if (match.status === 'similar' && !keys.includes(match.key)) keys.push(match.key)
  }
  return keys
}

