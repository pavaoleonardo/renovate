import { describe, expect, it } from 'vitest'
import {
  applyReview,
  isNoteText,
  isSummaryText,
  parseReviewAnswer,
  reviewDigest,
  reviewLines,
  ruleReview,
  validateReview,
  type ReviewLine,
  type ReviewService
} from '@/lib/import-review'

/**
 * The shape of a real sheet: partidas with a price, avisos without one, a fase total and
 * a description split over two rows because the source PDF wrapped it. Everything below
 * is synthetic — no real client, no real prices, no real file.
 */

const line = (name: string, price: number | null, unit = 'ud', section = 'Obra'): ReviewLine => ({
  section,
  name,
  unit,
  price,
  code: null
})

const fase = (name: string, services: ReviewService[]) => ({ name, services })
const service = (name: string, base_price: number, hasPrice = base_price > 0): ReviewService => ({
  name,
  unit: hasPrice ? 'ud' : '-',
  base_price,
  hasPrice
})

describe('ruleReview', () => {
  it('descarta un aviso sin precio y deja la partida con precio', () => {
    const lines = [line('No esta incluido suministro de caldera', null, '-'), line('Desmontaje de sanitarios', 25)]
    const review = ruleReview(lines)
    expect(review.drop).toEqual([{ line: 0, reason: 'nota' }])
    expect(review.join).toEqual([])
    expect(review.aiUsed).toBe(false)
  })

  it('no descarta un aviso que sí trae precio: eso es una partida', () => {
    expect(ruleReview([line('No esta incluido el montaje de tv', 40)]).drop).toEqual([])
  })

  it('descarta condiciones de pago y totales sin precio', () => {
    const lines = [line('El ultimo pago sera equivalente al importe restante', null), line('Total fase 2', null)]
    expect(ruleReview(lines).drop.map((entry) => entry.reason)).toEqual(['nota', 'total'])
  })

  it('reconoce el aviso con acentos y sin ellos', () => {
    expect(isNoteText('No está incluido el suministro de grifería')).toBe(true)
    expect(isNoteText('NO ESTA INCLUIDO LIMPIEZA FINAL')).toBe(true)
    expect(isNoteText('Suministro de grifería')).toBe(false)
    expect(isSummaryText('Subtotal capítulo 3')).toBe(true)
    expect(isSummaryText('Armario con 3 puertas')).toBe(false)
  })

describe('validateReview', () => {
  const lines = [
    line('Ventana de una hoja oscilobatiente en bicolor bronce/', null),
    line('4/16/4 be con barotillo. medidas 880x1550', 739.19),
    line('No esta incluido suministro de caldera', null, '-'),
    line('Desmontaje de sanitarios y grifería', 25)
  ]

  it('usa lo de la IA sólo si se puede comprobar', () => {
    const review = validateReview(
      { continuations: [1], notItems: [{ line: 3, reason: 'no incluido' }], note: 'dos avisos' },
      lines,
      ruleReview(lines)
    )
    expect(review.join).toEqual([1])
    expect(review.drop.map((entry) => entry.line)).toEqual([2])
    expect(review.aiUsed).toBe(true)
  })

  it('no deja que la IA descarte una partida normal con precio', () => {
    const review = validateReview({ notItems: [{ line: 4, reason: 'no es una partida' }] }, lines, ruleReview(lines))
    expect(review.drop.map((entry) => entry.line)).not.toContain(3)
  })

  it('sí acepta descartar una línea con precio cuando su nombre es un total', () => {
    const withTotal = [...lines, line('Total fase 1', 12000)]
    const review = validateReview({ notItems: [{ line: 5, reason: 'total' }] }, withTotal, ruleReview(withTotal))
    expect(review.drop.map((entry) => entry.line)).toContain(4)
  })

  it('no une dos partidas distintas sólo porque estén seguidas', () => {
    const both = [line('Pintura de paredes', 10), line('Pintura de techos', 12)]
    expect(validateReview({ continuations: [1] }, both, ruleReview(both)).join).toEqual([])
    // Una línea que las reglas ya han descartado tampoco se une: no se puede quedar y
    // desaparecer a la vez.
    expect(validateReview({ continuations: [3] }, lines, ruleReview(lines)).join).toEqual([])
  })

  it('ignora números fuera de rango y respuestas que no son una respuesta', () => {
    expect(
      validateReview({ notItems: [{ line: 99 }], continuations: [0, -3] }, lines, ruleReview(lines)).drop
    ).toEqual(ruleReview(lines).drop)
    expect(validateReview('no json', lines, ruleReview(lines)).aiUsed).toBe(false)
    expect(validateReview({ hello: true }, lines, ruleReview(lines)).aiUsed).toBe(false)
  })

  it('no vacía el documento: como mucho descarta el 40 % de las líneas', () => {
    const many = Array.from({ length: 20 }, (_, index) => line(`Partida ${index + 1}`, 10))
    const answer = { notItems: many.map((_, index) => ({ line: index + 1, reason: 'no es una partida' })) }
    // Con un precio y un nombre normal no se pueden descartar por la puerta de atrás.
    expect(validateReview(answer, many, ruleReview(many)).drop).toEqual([])

    // Con nombre de aviso y precio, la IA sí puede; el tope es el 40 % del documento.
    const avisos = Array.from({ length: 20 }, (_, index) => line(`No esta incluido el trabajo ${index + 1}`, 5))
    expect(validateReview(answer, avisos, ruleReview(avisos)).drop).toHaveLength(8)
  })

  it('acepta números en texto, que es como los manda un modelo a veces', () => {
    expect(parseReviewAnswer({ notItems: [{ line: '3', reason: 'x' }], continuations: ['5'] })).toEqual({
      notItems: [{ line: 3, reason: 'x' }],
      continuations: [5],
      note: ''
    })
    expect(parseReviewAnswer(null)).toBeNull()
  })
})

})


describe('applyReview', () => {
  const phases = [
    fase('Alicatado', [
      service('Ventana de una hoja oscilobatiente en bicolor bronce/', 0, false),
      service('4/16/4 be con barotillo. medidas 880x1550', 739.19),
      service('No esta incluido suministro de caldera', 0, false)
    ]),
    fase('Avisos', [service('No esta incluido limpieza final de obra', 0, false)])
  ]

  it('une la descripción partida y conserva el precio de la línea que lo tenía', () => {
    const applied = applyReview(phases, { drop: [], join: [1], aiUsed: false, note: '' })
    const services = applied.phases[0].services
    expect(services).toHaveLength(2)
    expect(services[0]).toMatchObject({
      name: 'Ventana de una hoja oscilobatiente en bicolor bronce/ 4/16/4 be con barotillo. medidas 880x1550',
      base_price: 739.19,
      hasPrice: true
    })
    expect(applied.joined).toHaveLength(1)
  })

  it('descarta los avisos y quita la sección que se queda vacía', () => {
    const applied = applyReview(phases, {
      drop: [
        { line: 2, reason: 'nota' },
        { line: 3, reason: 'nota' }
      ],
      join: [],
      aiUsed: false,
      note: ''
    })
    expect(applied.phases.map((phase) => phase.name)).toEqual(['Alicatado'])
    expect(applied.dropped.map((entry) => entry.name)).toEqual([
      'No esta incluido suministro de caldera',
      'No esta incluido limpieza final de obra'
    ])
    expect(applied.phases[0].services).toHaveLength(2)
  })

  it('sin revisión no toca nada: es el camino seguro si el cliente no manda la decisión', () => {
    const applied = applyReview(phases, { drop: [], join: [], aiUsed: false, note: '' })
    expect(applied.phases).toEqual(phases)
  })

  it('no une dos líneas que se han quedado sin compañero', () => {
    const applied = applyReview(phases, { drop: [], join: [5, 1], aiUsed: false, note: '' })
    expect(applied.joined).toHaveLength(1)
    expect(applied.phases[0].services).toHaveLength(2)
  })

  it('pone primero la mitad que se lee primero, aunque el precio esté en la otra fila', () => {
    // Caso real: «Armario con 6 puertas…,» (sin precio) y su cola «Interior con melamina…»
    // (con precio) llegaron en ese orden, y la cola es la que está arriba.
    const reversed = [
      fase('Armarios', [
        service('Interior con melamina roble. medidas 1000x2600x400', 1200),
        service('Armario con 6 puertas abatibles lacadas en blanco,', 0, false)
      ])
    ]
    const applied = applyReview(reversed, { drop: [], join: [1], aiUsed: false, note: '' })
    expect(applied.phases[0].services).toHaveLength(1)
    expect(applied.phases[0].services[0]).toMatchObject({
      name: 'Armario con 6 puertas abatibles lacadas en blanco, Interior con melamina roble. medidas 1000x2600x400',
      base_price: 1200,
      hasPrice: true
    })
  })
})

describe('reviewLines / reviewDigest', () => {
  it('aplana el documento en el orden en que se leyó', () => {
    const lines = reviewLines([
      fase('Uno', [service('A', 10), service('B', 0, false)]),
      fase('Dos', [service('C', 30)])
    ])
    expect(lines.map((entry) => [entry.section, entry.name, entry.price])).toEqual([
      ['Uno', 'A', 10],
      ['Uno', 'B', null],
      ['Dos', 'C', 30]
    ])
  })

  it('numera desde 1 y enmascara lo que identifica a alguien', () => {
    const digest = reviewDigest([line('Aviso: llamar al +34 600 123 456', null), line('Partida normal', 12.5)])
    const rows = digest.split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('1 ·')
    expect(rows[1]).toContain('2 ·')
    expect(digest).not.toContain('600 123 456')
    expect(digest).toContain('12.50 €')
  })
})
