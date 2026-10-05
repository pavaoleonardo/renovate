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
