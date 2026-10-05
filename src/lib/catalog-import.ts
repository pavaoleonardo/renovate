import { catalogKey } from '@/lib/catalog-key'
import { matchPhaseName } from '@/lib/catalog-match'

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
