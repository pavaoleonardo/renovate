import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG } from '@/lib/default-catalog'
import {
  bandSuggestedPrice,
  compareNames,
  findMarketMatch,
  matchPhaseName,
  nameSimilarity
} from '@/lib/catalog-match'

/**
 * The market band is *our* reference figure, so a wrong band is worse than no band: it
 * must only be inherited when the name and the unit really agree.
 */

const pintura = DEFAULT_CATALOG.find((phase) => phase.name === 'Pintura y Acabados')!.services.find(
  (service) => service.code === 'PIN-002'
)!
const demolicion = DEFAULT_CATALOG[0].services[0]

describe('compareNames', () => {
  it('puntúa como asumen los umbrales', () => {
    expect(compareNames('Fontanería', 'Fontanería').score).toBe(1)
    // La misma partida escrita de otra forma: se fusiona sin preguntar.
    expect(compareNames('Pintura de paredes', 'Pintura de paredes y techos').score).toBeGreaterThanOrEqual(0.72)
    // Una palabra sola es demasiado poco: se pregunta.
    expect(compareNames('Pintura', 'Pintura de paredes y techos').score).toBeLessThan(0.72)
    expect(compareNames('Pintura', 'Alicatado de baño').score).toBe(0)
  })

  it('nameSimilarity es el atajo de compareNames', () => {
    expect(nameSimilarity('Pintura de paredes', 'Pintura de paredes y techos')).toBe(
      compareNames('Pintura de paredes', 'Pintura de paredes y techos').score
    )
  })
})

describe('matchPhaseName', () => {
  it('fusiona secciones por nombre exacto, contenido o parecido', () => {
    expect(matchPhaseName('Demoliciones y Trabajos Previos', ['Demoliciones y Trabajos Previos'])).toBe(
      'Demoliciones y Trabajos Previos'
    )
    expect(matchPhaseName('Demoliciones', ['Demoliciones y Trabajos Previos'])).toBe(
      'Demoliciones y Trabajos Previos'
    )
    expect(matchPhaseName('Fontanería', ['Fontanería y saneamiento'])).toBe('Fontanería y saneamiento')
    expect(matchPhaseName('Climatización', ['Demoliciones y Trabajos Previos'])).toBeNull()
  })
})

/**
 * Las secciones del catálogo por defecto, tal cual. Los documentos que sube la gente
 * titulan sus capítulos a su manera («Fase 1: Demoliciones»), y ese título no puede
 * crear una segunda «Demoliciones y Trabajos Previos» al lado de la del catálogo.
 */
const DEFAULT_PHASE_NAMES = [
  'Demoliciones y Trabajos Previos',
  'Albañilería y Ayudas de Oficio',
  'Fontanería, Saneamiento y Calefacción',
  'Electricidad e Iluminación',
  'Pintura y Acabados',
  'Climatización y Aire Acondicionado',
  'Carpintería de Madera y Cerrajería',
  'Solados y Alicatados',
  'Pladur, Techos y Aislamientos',
  'Trámites y legalizaciones'
]

describe('matchPhaseName con títulos de documento real', () => {
  it('reconoce las ocho secciones del presupuesto que subió el usuario', () => {
    // Los nombres tal cual quedaron en su catálogo al importar (2026-10-05).
    expect(matchPhaseName('Fase 1: Demoliciones', DEFAULT_PHASE_NAMES)).toBe(
      'Demoliciones y Trabajos Previos'
    )
    expect(matchPhaseName('Fase 2: Albañileria', DEFAULT_PHASE_NAMES)).toBe(
      'Albañilería y Ayudas de Oficio'
    )
    expect(matchPhaseName('Fase 5: Instalacion de electricidad.', DEFAULT_PHASE_NAMES)).toBe(
      'Electricidad e Iluminación'
    )
    expect(matchPhaseName('Fase 6: Pintura.', DEFAULT_PHASE_NAMES)).toBe('Pintura y Acabados')
    expect(matchPhaseName('Fase 7: Calefaccion.', DEFAULT_PHASE_NAMES)).toBe(
      'Fontanería, Saneamiento y Calefacción'
    )
    expect(matchPhaseName('Fase 8: Climatizacion.', DEFAULT_PHASE_NAMES)).toBe(
      'Climatización y Aire Acondicionado'
    )
    expect(matchPhaseName('Fase 9: Carpinteria de madera.', DEFAULT_PHASE_NAMES)).toBe(
      'Carpintería de Madera y Cerrajería'
    )
    // «Fase 4» cubre fontanería Y climatización: esa sí la decide la IA, no esta regla.
    expect(matchPhaseName('Fase 4: Instalacion fontaneria y climatizacion', DEFAULT_PHASE_NAMES)).toBeNull()
  })

  it('la caja no importa: un documento en mayúsculas se reconoce igual', () => {
    expect(matchPhaseName('FASE 2: ALBAÑILERIA', DEFAULT_PHASE_NAMES)).toBe(
      'Albañilería y Ayudas de Oficio'
    )
    expect(matchPhaseName('DEMOLICIONES', DEFAULT_PHASE_NAMES)).toBe('Demoliciones y Trabajos Previos')
  })

  it('reconoce un capítulo numerado sin la palabra «fase»', () => {
    expect(matchPhaseName('3. Albañilería', DEFAULT_PHASE_NAMES)).toBe('Albañilería y Ayudas de Oficio')
    expect(matchPhaseName('CAPÍTULO 2 - FONTANERÍA', DEFAULT_PHASE_NAMES)).toBe(
      'Fontanería, Saneamiento y Calefacción'
    )
  })

  it('el singular y el plural de la misma palabra no separan dos secciones', () => {
    expect(matchPhaseName('Aislamiento', DEFAULT_PHASE_NAMES)).toBe('Pladur, Techos y Aislamientos')
  })

  it('una sección que cubre dos capítulos no se fusiona sola: ahí decide la IA', () => {
    expect(matchPhaseName('Fase 4: Instalacion fontaneria y climatizacion', DEFAULT_PHASE_NAMES)).toBeNull()
  })

  it('una sección genérica no se fusiona con cualquiera', () => {
    expect(matchPhaseName('Trabajos varios', DEFAULT_PHASE_NAMES)).toBeNull()
    expect(matchPhaseName('Varios', DEFAULT_PHASE_NAMES)).toBeNull()
    expect(matchPhaseName('Actuaciones generales', DEFAULT_PHASE_NAMES)).toBeNull()
  })
})

describe('findMarketMatch', () => {
  it('una línea con el nombre exacto hereda la banda', () => {
    const match = findMarketMatch({ name: pintura.name, unit: pintura.unit })!
    expect(match.reason).toBe('name')
    expect(match.band.price_min).toBe(pintura.price_min)
    expect(match.band.price_max).toBe(pintura.price_max)
  })

  it('una línea escrita de otra forma también hereda la banda (por parecido)', () => {
    const match = findMarketMatch({ name: 'Pintado con pintura plástica de paredes', unit: 'm2' })!
    expect(match.reason).toBe('similar')
    expect(match.band.code).toBe(pintura.code)
  })

  it('el código manda sobre el nombre', () => {
    const match = findMarketMatch({ name: 'lo que el cliente escribió', code: demolicion.code })!
    expect(match.reason).toBe('code')
    expect(match.band.code).toBe(demolicion.code)
  })

  it('nunca hereda una banda si la unidad no coincide', () => {
    // Una banda de m2 no dice nada de una línea que se mide por unidades.
    expect(findMarketMatch({ name: 'Pintado con pintura plástica de paredes', unit: 'ud' })).toBeNull()
  })

  it('una partida desconocida se queda sin banda', () => {
    expect(findMarketMatch({ name: 'Cambio de grifo monomando', unit: 'ud' })).toBeNull()
  })
})

describe('bandSuggestedPrice', () => {
  it('es el punto medio de la banda redondeado al medio euro', () => {
    expect(bandSuggestedPrice(22, 32)).toBe(27)
    expect(bandSuggestedPrice(11, 17)).toBe(14)
    expect(bandSuggestedPrice(7, 11)).toBe(9)
    expect(bandSuggestedPrice(7.2, 11.4)).toBe(9.5)
  })
})
