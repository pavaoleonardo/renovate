import { describe, expect, it } from 'vitest'
import {
  applyVoiceOps,
  findExistingLine,
  parseVoiceProposal,
  proposalLineToRow,
  resolveCatalogMatch,
  voiceChangePrompt,
  voiceInsertionIndex,
  VOICE_MAX_LINES,
} from '@/lib/voice-change'
import { PRICE_TO_CONFIRM } from '@/lib/pending-notes'
import type { CatalogService, EstimateRow, VoiceProposalLine } from '@/types'

/**
 * The AI answer is untrusted text. What matters: junk never breaks the editor,
 * a proposed line is never born with a price, and a dictated change lands next to
 * the service it refers to instead of at the end of the budget.
 */

/** Una línea de presupuesto mínima, para las pruebas de colocación. */
function row(type: EstimateRow['type'], name: string): EstimateRow {
  return {
    id: `${type}-${name}`,
    type,
    position: 0,
    phase_name_snapshot: type === 'phase' ? name : null,
    service_name_snapshot: type === 'item' ? name : null,
    unit_snapshot: null,
    price_snapshot: null,
    quantity: 0,
    total: 0,
  }
}

/** Una operación propuesta por la IA, con valores por defecto sensatos. */
function line(partial: Partial<VoiceProposalLine>): VoiceProposalLine {
  return { op: 'add', description: '', quantity: 1, unit: 'ud', anchor: null, source: null, ...partial }
}

describe('parseVoiceProposal', () => {
  it('se queda con las líneas que tienen descripción y normaliza el resto', () => {
    const proposal = parseVoiceProposal({
      summary: 'Más enchufes',
      section: 'Electricidad',
      lines: [
        { description: 'Instalar 3 enchufes', quantity: 3, unit: 'ud' },
        { description: 'Pasar cable', quantity: '10', unit: '' },
        { description: '   ' },
        { quantity: 2 },
      ],
    })
    expect(proposal.summary).toBe('Más enchufes')
    expect(proposal.section).toBe('Electricidad')
    expect(proposal.lines).toEqual([
      { op: 'add', description: 'Instalar 3 enchufes', quantity: 3, unit: 'ud', anchor: null, source: null },
      { op: 'add', description: 'Pasar cable', quantity: 10, unit: 'ud', anchor: null, source: null },
    ])
  })

  it('normaliza la operación y la fuente: lo desconocido cae en add y null', () => {
    const proposal = parseVoiceProposal({
      lines: [
        { op: 'update', description: 'Puertas', quantity: 5 },
        { op: 'remove', description: 'Bañera' },
        { op: 'inventada', description: 'X' },
        { op: 'add', description: 'Plato de ducha', source: 'catalog' },
        { op: 'add', description: 'Otra', source: 'what' },
      ],
    })
    expect(proposal.lines.map((l) => l.op)).toEqual(['update', 'remove', 'add', 'add', 'add'])
    expect(proposal.lines.map((l) => l.source)).toEqual([null, null, null, 'catalog', null])
  })

  it('conserva el anclaje a una línea existente y lo limpia cuando viene vacío', () => {
    const proposal = parseVoiceProposal({
      lines: [
        { description: 'Cambiar bañera por plato de ducha', anchor: '  Bañera blanca 170 cm  ' },
        { description: 'Otra línea', anchor: '   ' },
        { description: 'Sin anclaje' },
      ],
    })
    expect(proposal.lines[0].anchor).toBe('Bañera blanca 170 cm')
    expect(proposal.lines[1].anchor).toBeNull()
    expect(proposal.lines[2].anchor).toBeNull()
  })

  it('cantidad ausente, cero o negativa cae en 1', () => {
    const proposal = parseVoiceProposal({ lines: [{ description: 'x' }, { description: 'y', quantity: 0 }, { description: 'z', quantity: -4 }] })
    expect(proposal.lines.map((l) => l.quantity)).toEqual([1, 1, 1])
  })

  it('section vacía se vuelve null', () => {
    expect(parseVoiceProposal({ section: '  ' }).section).toBeNull()
  })

  it('basura no rompe nada', () => {
    expect(parseVoiceProposal(null)).toEqual({ summary: '', section: null, lines: [] })
    expect(parseVoiceProposal('texto').lines).toEqual([])
    expect(parseVoiceProposal({ lines: 'no es una lista' }).lines).toEqual([])
  })

  it('acota cuántas líneas puede proponer', () => {
    const many = Array.from({ length: VOICE_MAX_LINES + 5 }, (_, i) => ({ description: `línea ${i}` }))
    expect(parseVoiceProposal({ lines: many }).lines).toHaveLength(VOICE_MAX_LINES)
  })
})

describe('proposalLineToRow', () => {
  it('nace sin precio, marcada «por confirmar» y en su sección', () => {
    const row = proposalLineToRow(line({ description: 'Instalar 3 enchufes', quantity: 3 }), 'Electricidad', 'r1', 5)
    expect(row.type).toBe('item')
    expect(row.phase_name_snapshot).toBe('Electricidad')
    expect(row.service_name_snapshot).toContain(PRICE_TO_CONFIRM)
    expect(row.service_name_snapshot).toContain('Instalar 3 enchufes')
    expect(row.price_snapshot).toBe(0)
    expect(row.quantity).toBe(3)
    expect(row.total).toBe(0)
    expect(row.position).toBe(5)
  })
})

describe('voiceChangePrompt', () => {
  it('incluye el texto dictado, el presupuesto, el catálogo y prohíbe inventar precios', () => {
    const prompt = voiceChangePrompt(
      'cambiar la bañera por un plato de ducha',
      [{ section: 'Baño', lines: [{ description: 'Bañera blanca 170 cm', quantity: 1 }] }],
      [{ name: 'Plato de ducha', unit: 'ud', section: 'Baño' }]
    )
    expect(prompt).toContain('cambiar la bañera por un plato de ducha')
    expect(prompt).toContain('Baño: Bañera blanca 170 cm ×1')
    expect(prompt).toContain('Plato de ducha [ud] (Baño)')
    expect(prompt).toContain('NO inventes precios')
  })

  it('sin secciones ni catálogo lo dice, no deja el hueco vacío', () => {
    const prompt = voiceChangePrompt('algo', [], [])
    expect(prompt).toContain('todavía no hay secciones')
    expect(prompt).toContain('tu catálogo está vacío')
  })
})

describe('voiceInsertionIndex', () => {
  it('coloca el cambio justo debajo de la línea a la que se refiere', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera blanca 170 cm'), row('item', 'Alicatado'), row('phase', 'Pintura')]
    expect(voiceInsertionIndex(rows, 'Baño', 'Bañera blanca 170 cm')).toBe(2)
  })

  it('ancla por contención: «bañera» encuentra «Bañera blanca 170 cm»', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera blanca 170 cm'), row('item', 'Alicatado')]
    expect(voiceInsertionIndex(rows, null, 'bañera')).toBe(2)
  })

  it('sin anclaje, cae al final de las líneas de su sección', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera'), row('phase', 'Pintura'), row('item', 'Pintar pared')]
    expect(voiceInsertionIndex(rows, 'Baño', null)).toBe(2)
  })

  it('si el anclaje no existe en el presupuesto, usa la sección', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera'), row('item', 'Alicatado'), row('phase', 'Pintura')]
    expect(voiceInsertionIndex(rows, 'Baño', 'algo que no está')).toBe(3)
  })

  it('sin pistas, cae al final del presupuesto', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera')]
    expect(voiceInsertionIndex(rows, null, null)).toBe(2)
    expect(voiceInsertionIndex([], null, null)).toBe(0)
  })
})

describe('findExistingLine', () => {
  it('encuentra la línea del presupuesto por contención', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera blanca 170 cm'), row('item', 'Alicatado')]
    expect(findExistingLine(rows, 'bañera')).toBe(1)
    expect(findExistingLine(rows, 'un plato de ducha')).toBe(-1)
  })

  it('ignora las cabeceras de sección y los textos vacíos', () => {
    const rows = [row('phase', 'Baño')]
    expect(findExistingLine(rows, 'Baño')).toBe(-1)
    expect(findExistingLine(rows, '')).toBe(-1)
  })
})

describe('resolveCatalogMatch', () => {
  const catalog: CatalogService[] = [
    { id: '1', name: 'Plato de ducha', unit: 'ud', base_price: 180, phase_id: 'p1', phase_name: 'Baño' },
    { id: '2', name: 'Alicatado 20x20', unit: 'm2', base_price: 22, phase_id: 'p1', phase_name: 'Baño' },
  ]

  it('casa por nombre exacto ignorando acentos y mayúsculas', () => {
    expect(resolveCatalogMatch('plato de ducha', catalog)?.id).toBe('1')
  })

  it('casa por contención con el mínimo de longitud', () => {
    expect(resolveCatalogMatch('Instalar alicatado 20x20 en la pared', catalog)?.id).toBe('2')
  })

  it('devuelve null cuando ninguna partida encaja o el texto es corto', () => {
    expect(resolveCatalogMatch('Cambiar la bañera', catalog)).toBeNull()
    expect(resolveCatalogMatch('luz', catalog)).toBeNull()
  })
})

describe('applyVoiceOps', () => {
  const catalog: CatalogService[] = [
    { id: '1', name: 'Plato de ducha', unit: 'ud', base_price: 180, phase_id: 'p1', phase_name: 'Baño' },
  ]

  function counter() {
    let n = 0
    return () => `new-${++n}`
  }

  it('add de catálogo: entra con el nombre, la unidad y el precio del catálogo', () => {
    const rows = [row('phase', 'Baño')]
    const out = applyVoiceOps(rows, [line({ op: 'add', description: 'Plato de ducha', quantity: 2 })], 'Baño', catalog, counter())
    expect(out).toHaveLength(2)
    expect(out[1].service_name_snapshot).toBe('Plato de ducha')
    expect(out[1].unit_snapshot).toBe('ud')
    expect(out[1].price_snapshot).toBe(180)
    expect(out[1].quantity).toBe(2)
    expect(out[1].total).toBe(360)
    expect(out[1].phase_name_snapshot).toBe('Baño')
  })

  it('add nuevo: entra «por confirmar» a precio 0', () => {
    const rows = [row('phase', 'Baño')]
    const out = applyVoiceOps(rows, [line({ op: 'add', description: 'Poner una viga de refuerzo' })], 'Baño', catalog, counter())
    expect(out[1].service_name_snapshot).toContain(PRICE_TO_CONFIRM)
    expect(out[1].price_snapshot).toBe(0)
    expect(out[1].total).toBe(0)
  })

  it('update: fija la cantidad FINAL de la línea existente y recalcula el total', () => {
    const rows = [row('phase', 'Baño'), { ...row('item', 'Puertas'), price_snapshot: 100, quantity: 3, total: 300 }]
    const out = applyVoiceOps(rows, [line({ op: 'update', description: 'Puertas', quantity: 5 })], 'Baño', catalog, counter())
    expect(out).toHaveLength(2)
    expect(out[1].quantity).toBe(5)
    expect(out[1].total).toBe(500)
  })

  it('update sin línea que case: se añade para no perder el cambio', () => {
    const rows = [row('phase', 'Baño')]
    const out = applyVoiceOps(rows, [line({ op: 'update', description: 'Ventana nueva', quantity: 2 })], 'Baño', catalog, counter())
    expect(out).toHaveLength(2)
    expect(out[1].service_name_snapshot).toContain('Ventana nueva')
  })

  it('remove: quita la línea que refiere', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera blanca 170 cm'), row('item', 'Alicatado')]
    const out = applyVoiceOps(rows, [line({ op: 'remove', anchor: 'bañera', description: 'bañera' })], 'Baño', catalog, counter())
    expect(out.map((r) => r.service_name_snapshot || r.phase_name_snapshot)).toEqual(['Baño', 'Alicatado'])
  })

  it('add con anchor se coloca justo debajo de la línea que refiere', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera blanca 170 cm'), row('phase', 'Pintura')]
    const out = applyVoiceOps(rows, [line({ op: 'add', anchor: 'bañera', description: 'Plato de ducha' })], 'Baño', catalog, counter())
    expect(out.map((r) => r.service_name_snapshot || r.phase_name_snapshot)).toEqual(['Baño', 'Bañera blanca 170 cm', 'Plato de ducha', 'Pintura'])
  })

  it('add sin anchor: se cuelga de la línea existente que nombra su propia descripción', () => {
    // La IA a menudo deja `anchor` en null en los «add». Sin esta reserva la línea caería
    // al final de la sección; con ella se pega al «Enchufes» que ya está en el presupuesto.
    const rows = [row('phase', 'Electricidad'), row('item', 'Enchufes'), row('phase', 'Pintura')]
    const out = applyVoiceOps(rows, [line({ op: 'add', description: 'Instalar 2 enchufes' })], 'Electricidad', catalog, counter())
    expect(out.map((r) => r.service_name_snapshot || r.phase_name_snapshot)).toEqual([
      'Electricidad',
      'Enchufes',
      `Instalar 2 enchufes (${PRICE_TO_CONFIRM})`,
      'Pintura',
    ])
  })

  it('add sin anchor ni coincidencia: cae al final de su sección, no del presupuesto', () => {
    const rows = [row('phase', 'Baño'), row('item', 'Bañera blanca 170 cm'), row('phase', 'Pintura')]
    const out = applyVoiceOps(rows, [line({ op: 'add', description: 'Sellar la junta' })], 'Baño', catalog, counter())
    expect(out.map((r) => r.service_name_snapshot || r.phase_name_snapshot)).toEqual([
      'Baño',
      'Bañera blanca 170 cm',
      `Sellar la junta (${PRICE_TO_CONFIRM})`,
      'Pintura',
    ])
  })
})
