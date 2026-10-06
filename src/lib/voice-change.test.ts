import { describe, expect, it } from 'vitest'
import { parseVoiceProposal, proposalLineToRow, voiceChangePrompt, VOICE_MAX_LINES } from '@/lib/voice-change'
import { PRICE_TO_CONFIRM } from '@/lib/pending-notes'

/**
 * The AI answer is untrusted text. What matters: junk never breaks the editor,
 * and a proposed line is never born with a price.
 */

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
      { description: 'Instalar 3 enchufes', quantity: 3, unit: 'ud' },
      { description: 'Pasar cable', quantity: 10, unit: 'ud' },
    ])
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
  it('incluye el texto dictado y las secciones, y prohíbe inventar precios', () => {
    const prompt = voiceChangePrompt('poner tres enchufes en el salón', ['Electricidad', 'Pintura'])
    expect(prompt).toContain('poner tres enchufes en el salón')
    expect(prompt).toContain('Electricidad, Pintura')
    expect(prompt).toContain('NO inventes precios')
  })

  it('sin secciones lo dice, no deja el hueco vacío', () => {
    expect(voiceChangePrompt('algo', [])).toContain('todavía no hay secciones')
  })
})
