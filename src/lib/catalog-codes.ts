/**
 * Códigos de partida del catálogo: «DEM-001», «ALB-004»…
 *
 * El catálogo por defecto viene con su código y el importador lo guarda cuando la hoja
 * trae la columna «Código». Un documento que no la trae, o una partida añadida a mano,
 * se quedaba sin código: esas filas salían en blanco y no había forma de citar una
 * partida («la DEM-003») sin buscarla por el nombre.
 *
 * La regla vive aquí, fuera de los módulos de servidor, para poder comprobarla sin
 * base de datos: el prefijo de una sección sale de su nombre (tres letras) y el número
 * es el siguiente libre de esa serie. Los prefijos del catálogo por defecto se
 * reproducen solos con esa regla (Demoliciones → DEM, Albañilería → ALB, …).
 */

import { catalogKey } from '@/lib/catalog-key'

/** Letras del prefijo: los mismos tres de «DEM-001». */
const PREFIX_LENGTH = 3

/** Dígitos del número: «DEM-003», no «DEM-3». */
const NUMBER_DIGITS = 3

/** Prefijo de una sección cuyo nombre no deja ni una palabra utilizable. */
export const FALLBACK_CODE_PREFIX = 'PAR'

/**
 * Palabras que no identifican una sección: un título empieza por «Trabajos» o «Fase»
 * tantas veces como por su oficio, y de ahí no sale un prefijo.
 */
const GENERIC_WORDS = new Set([
  'fase',
  'capitulo',
  'seccion',
  'apartado',
  'bloque',
  'grupo',
  'tajo',
  'zona',
  'trabajo',
  'trabajos',
  'vario',
  'varios',
  'obra',
  'obras',
  'reforma',
  'reformas',
  'instalacion',
  'instalaciones',
  'general',
  'generales'
])

/**
 * Prefijo que le corresponde a una sección por su nombre.
 *
 * `catalogKey` quita acentos y signos, así que «Albañilería,» y «albanileria» dan lo
 * mismo. Se coge la primera palabra con cuerpo (tres letras o más) que no sea genérica.
 */
export function codePrefixForPhase(phaseName: string): string {
  const words = catalogKey(phaseName).split(' ').filter(Boolean)
  const word = words.find((candidate) => candidate.length >= PREFIX_LENGTH && !GENERIC_WORDS.has(candidate))
  const prefix = (word ?? words[0] ?? '').slice(0, PREFIX_LENGTH).toUpperCase()
  return prefix || FALLBACK_CODE_PREFIX
}

/** `ABC-12` → `ABC`, en mayúsculas y sin tocar nada más. */
const CODE_PATTERN = /^([A-Za-z]{2,4})-(\d+)$/

/**
 * Prefijo que ya usa una sección, para no cambiar de serie a mitad de catálogo.
 *
 * Una sección renombrada a mano («Derribos») sigue teniendo partidas `DEM-00x`: el
 * prefijo que manda es el que ya está escrito en sus códigos, no el de su nombre. Si
 * no hay ninguno, se deduce del nombre.
 */
export function phaseCodePrefix(phaseName: string, existingCodes: (string | null | undefined)[]): string {
  const counts = new Map<string, number>()
  for (const code of existingCodes) {
    const match = CODE_PATTERN.exec(String(code ?? '').trim())
    if (!match) continue
    const prefix = match[1].toUpperCase()
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }

  let best: string | null = null
  Array.from(counts.keys()).forEach((prefix) => {
    if (best === null || (counts.get(prefix) ?? 0) > (counts.get(best) ?? 0)) best = prefix
  })

  return best ?? codePrefixForPhase(phaseName)
}

/** Siguiente código libre de la serie: `DEM-001`, `DEM-002` → `DEM-003`. */
export function nextServiceCode(prefix: string, existingCodes: (string | null | undefined)[]): string {
  const wanted = prefix.toUpperCase()
  let highest = 0
  for (const code of existingCodes) {
    const match = CODE_PATTERN.exec(String(code ?? '').trim())
    if (!match || match[1].toUpperCase() !== wanted) continue
    highest = Math.max(highest, Number(match[2]))
  }

  const number = String(highest + 1)
  const padded = number.length >= NUMBER_DIGITS ? number : `${'0'.repeat(NUMBER_DIGITS - number.length)}${number}`
  return `${wanted}-${padded}`
}

/** Códigos consecutivos para varias partidas nuevas de la misma sección. */
export function nextServiceCodes(
  prefix: string,
  existingCodes: (string | null | undefined)[],
  count: number
): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    codes.push(nextServiceCode(prefix, [...existingCodes, ...codes]))
  }
  return codes
}
