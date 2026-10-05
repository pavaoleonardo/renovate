import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG } from '@/lib/default-catalog'
import {
  ambiguousMatches,
  importLineKey,
  itemMatchPrompt,
  matchIncomingService,
  parseItemMatches,
  parseSectionMatches,
  priceChanged,
  unmatchedSections,
  type ExistingService,
  type ImportMatchQuestion
} from '@/lib/catalog-import'

/**
 * What a document's partida becomes in the company catalogue. The four statuses are the
 * contract between the review panel and the commit: `exact`/`auto` merge silently,
 * `similar` is asked, `new` is created.
 */

const demolicion = DEFAULT_CATALOG[0].services[0]

/** The company catalogue as the importer sees it: two partidas, one with a code. */
const existing: ExistingService[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: demolicion.name,
    unit: demolicion.unit,
    base_price: demolicion.base_price,
    phase_id: 'p1',
    phase_name: DEFAULT_CATALOG[0].name,
    code: demolicion.code
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Pintura de paredes y techos',
    unit: 'm2',
    base_price: 9,
    phase_id: 'p2',
    phase_name: 'Pintura y Acabados',
    code: null
  }
]

describe('matchIncomingService', () => {
  it('el mismo nombre en la misma sección es exacto', () => {
    const match = matchIncomingService({ name: demolicion.name }, existing, DEFAULT_CATALOG[0].name)
    expect(match.status).toBe('exact')
    expect(match.reason).toBe('name')
    expect(match.target?.id).toBe(existing[0].id)
  })

  it('el mismo código es exacto aunque el nombre haya cambiado', () => {
    const match = matchIncomingService({ name: 'Tabique de rasillón, demolición', code: demolicion.code }, existing)
    expect(match.status).toBe('exact')
    expect(match.reason).toBe('code')
  })

  it('el mismo trabajo escrito de otra forma se fusiona solo (auto)', () => {
    const incoming = demolicion.name.replace('ladrillo/rasillón', 'ladrillo').replace('Demolición', 'Demolicion')
    const match = matchIncomingService({ name: incoming }, existing, DEFAULT_CATALOG[0].name)
    expect(match.status).toBe('auto')
    expect(match.score).toBeGreaterThanOrEqual(0.72)
    expect(match.score).toBeLessThan(1)
  })

  it('un nombre contenido con dos palabras compartidas se fusiona solo', () => {
    const match = matchIncomingService({ name: 'Pintura de paredes' }, existing, 'Pintura y Acabados')
    expect(match.status).toBe('auto')
  })

  it('un parecido parcial se pregunta en vez de fusionarse en silencio', () => {
    // Otro tipo de tabique: dos palabras en común, pero no para decidir por el usuario.
    const match = matchIncomingService({ name: 'Demolición de tabique de pladur' }, existing, DEFAULT_CATALOG[0].name)
    expect(match.status).toBe('similar')
    expect(match.target?.id).toBe(existing[0].id)
  })

  it('una partida distinta es nueva', () => {
    const match = matchIncomingService({ name: 'Instalación de aire acondicionado split' }, existing, 'Climatización')
    expect(match.status).toBe('new')
    expect(match.target).toBeNull()
  })

  it('«Pintura» sola nunca se fusiona sola con «Pintura de paredes y techos»', () => {
    const match = matchIncomingService({ name: 'Pintura' }, existing, 'Pintura y Acabados')
    expect(match.status).toBe('similar')
  })
})

describe('priceChanged', () => {
  it('un céntimo de diferencia no es un cambio de precio', () => {
    expect(priceChanged(18.82, 18.82)).toBe(false)
    expect(priceChanged(18.82, 18.825)).toBe(false)
    expect(priceChanged(18.82, 19)).toBe(true)
  })

  it('una partida sin precio propio se rellena siempre', () => {
    expect(priceChanged(null, 0)).toBe(true)
  })
})

describe('importLineKey', () => {
  it('la clave de una línea ignora acentos, mayúsculas y espacios de más', () => {
    expect(importLineKey('Demoliciones y Trabajos Previos', 'Demolición de tabique')).toBe(
      importLineKey('DEMOLICIONES Y TRABAJOS PREVIOS', 'demolicion  de tabique')
    )
    // La sección forma parte de la clave: la misma partida en otra sección es otra línea.
    expect(importLineKey('Pintura', 'Pintar paredes')).not.toBe(importLineKey('Albañilería', 'Pintar paredes'))
  })
})

describe('ambiguousMatches', () => {
  it('sólo se pregunta por las dudosas, y cada una una sola vez', () => {
    expect(
      ambiguousMatches([
        { key: 'a', status: 'exact' },
        { key: 'b', status: 'similar' },
        { key: 'c', status: 'new' },
        { key: 'b', status: 'similar' },
        { key: 'd', status: 'auto' }
      ])
    ).toEqual(['b'])
  })
})

describe('unmatchedSections', () => {
  it('devuelve sólo las secciones que no encajan con ninguna existente, sin repetir', () => {
    expect(
      unmatchedSections(
        ['Demoliciones', 'Climatización', 'climatizacion '],
        ['Demoliciones y Trabajos Previos', 'Fontanería']
      )
    ).toEqual(['Climatización'])
  })
})


const question: ImportMatchQuestion = {
  key: importLineKey('Pintura y Acabados', 'Pintar paredes'),
  name: 'Pintar paredes',
  unit: 'm2',
  candidates: [{ id: 'id-pintura', name: 'Pintura de paredes y techos', unit: 'm2', base_price: 9 }]
}

describe('parseItemMatches', () => {
  it('la IA sólo puede elegir entre los candidatos que se le ofrecieron', () => {
    expect(parseItemMatches({ [question.key]: 'id-pintura' }, [question]).get(question.key)).toBe('id-pintura')
    // Por nombre, con otra caja: se acepta porque es un candidato de la lista.
    expect(parseItemMatches({ [question.key]: 'PINTURA DE PAREDES Y TECHOS' }, [question]).get(question.key)).toBe(
      'id-pintura'
    )
    // Inventada, vacía o con una clave que no existe: se ignora y la partida se crea nueva.
    expect(parseItemMatches({ [question.key]: 'Pintura de techos' }, [question]).size).toBe(0)
    expect(parseItemMatches({ [question.key]: '' }, [question]).size).toBe(0)
    expect(parseItemMatches({ otra: 'id-pintura' }, [question]).size).toBe(0)
    expect(parseItemMatches(null, [question]).size).toBe(0)
  })

  it('el prompt lleva la clave de cada línea y los ids de los candidatos', () => {
    const prompt = itemMatchPrompt([question])
    expect(prompt).toMatch(/id-pintura/)
    expect(prompt).toContain(question.key)
    expect(prompt).toMatch(/Pintura de paredes y techos/)
  })
})

describe('parseSectionMatches', () => {
  it('sólo acepta secciones que ya existen; lo demás se crea nuevo', () => {
    const matches = parseSectionMatches(
      { 'Trabajos varios de albañilería': 'Albañilería', Fontanería: 'Sección inventada' },
      ['Trabajos varios de albañilería', 'Fontanería'],
      ['Albañilería']
    )
    expect(matches.get('Trabajos varios de albañilería')).toBe('Albañilería')
    expect(matches.has('Fontanería')).toBe(false)
  })
})
