import { describe, expect, it } from 'vitest'
import { openNotes, pendingToRow, PRICE_TO_CONFIRM } from '@/lib/pending-notes'
import { PendingNote } from '@/types'

/**
 * What a captured change becomes when it turns into a budget line. The rule that
 * matters: a note without a price must never look like a priced line.
 */

const note = (over: Partial<PendingNote> = {}): PendingNote => ({
  id: 'n1',
  estimate_id: 'e1',
  text: 'Añadir 3 enchufes en el salón',
  section: null,
  quantity: null,
  price: null,
  status: 'open',
  ...over,
})

describe('pendingToRow', () => {
  it('sin precio deja la línea marcada «por confirmar» y a 0 €', () => {
    const row = pendingToRow(note(), 'row-1')
    expect(row.type).toBe('item')
    expect(row.service_name_snapshot).toContain(PRICE_TO_CONFIRM)
    expect(row.price_snapshot).toBe(0)
    expect(row.quantity).toBe(1)
    expect(row.total).toBe(0)
  })

  it('con precio usa el texto tal cual y calcula el total', () => {
    const row = pendingToRow(note({ price: 25, quantity: 3 }), 'row-2')
    expect(row.service_name_snapshot).toBe('Añadir 3 enchufes en el salón')
    expect(row.price_snapshot).toBe(25)
    expect(row.quantity).toBe(3)
    expect(row.total).toBe(75)
  })

  it('una cantidad ausente o cero cae en 1, nunca en 0', () => {
    expect(pendingToRow(note({ price: 10, quantity: 0 }), 'x').quantity).toBe(1)
    expect(pendingToRow(note({ price: 10 }), 'x').quantity).toBe(1)
  })
})

describe('openNotes', () => {
  it('deja pasar solo las que siguen abiertas', () => {
    const notes = [
      note({ id: 'a' }),
      note({ id: 'b', status: 'converted' }),
      note({ id: 'c', status: 'dismissed' }),
    ]
    expect(openNotes(notes).map((n) => n.id)).toEqual(['a'])
  })
})
