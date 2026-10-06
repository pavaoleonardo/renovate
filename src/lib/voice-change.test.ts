import { describe, expect, it } from 'vitest'
import {
  parseVoiceProposal,
  proposalLineToRow,
  voiceChangePrompt,
  voiceInsertionIndex,
  VOICE_MAX_LINES,
} from '@/lib/voice-change'
import { PRICE_TO_CONFIRM } from '@/lib/pending-notes'
import type { EstimateRow } from '@/types'

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
      { description: 'Instalar 3 enchufes', quantity: 3, unit: 'ud', anchor: null },
      { description: 'Pasar cable', quantity: 10, unit: 'ud', anchor: null },
    ])
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
    const row = proposalLineToRow({ description: 'Instalar 3 enchufes', quantity: 3, unit: 'ud' }, 'Electricidad', 'r1', 5)
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
      [{ section: 'Baño', lines: ['Bañera blanca 170 cm'] }],
      [{ name: 'Plato de ducha', unit: 'ud', section: 'Baño' }]
    )
    expect(prompt).toContain('cambiar la bañera por un plato de ducha')
    expect(prompt).toContain('Baño: Bañera blanca 170 cm')
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
