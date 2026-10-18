import { describe, expect, it } from 'vitest'
import {
  isPriceUnconfirmed,
  openNotes,
  pendingToRow,
  PRICE_TO_CONFIRM,
  unconfirmedRows,
} from '@/lib/pending-notes'
import { EstimateRow, PendingNote } from '@/types'

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

describe('isPriceUnconfirmed', () => {
  const line = (over: Partial<EstimateRow> = {}): EstimateRow => ({
    id: 'r1',
    type: 'item',
    position: 0,
    phase_name_snapshot: null,
    service_name_snapshot: 'Instalar 3 enchufes',
    unit_snapshot: 'un',
    price_snapshot: 25,
    quantity: 1,
    total: 25,
    ...over,
  })

  it('una línea con precio real no bloquea el envío', () => {
    expect(isPriceUnconfirmed(line())).toBe(false)
  })

  it('la marca «por confirmar» bloquea aunque el precio no sea cero', () => {
    expect(isPriceUnconfirmed(line({ service_name_snapshot: `Enchufes (${PRICE_TO_CONFIRM})` }))).toBe(true)
    expect(isPriceUnconfirmed(line({ price_snapshot: 40, service_name_snapshot: `Enchufes (${PRICE_TO_CONFIRM})` }))).toBe(true)
  })

  it('la marca se detecta sin importar mayúsculas', () => {
    expect(isPriceUnconfirmed(line({ service_name_snapshot: 'Enchufes (Por Confirmar)' }))).toBe(true)
  })

  it('un precio a cero o nulo bloquea aunque falte la marca', () => {
    expect(isPriceUnconfirmed(line({ price_snapshot: 0 }))).toBe(true)
    expect(isPriceUnconfirmed(line({ price_snapshot: null }))).toBe(true)
    expect(isPriceUnconfirmed(line({ price_snapshot: undefined }))).toBe(true)
    expect(isPriceUnconfirmed(line({ price_snapshot: Number.NaN }))).toBe(true)
  })

  it('los títulos de sección nunca bloquean', () => {
    const phase: EstimateRow = {
      id: 'p1',
      type: 'phase',
      position: 0,
      phase_name_snapshot: 'ELECTRICIDAD',
      service_name_snapshot: null,
      unit_snapshot: null,
      price_snapshot: null,
      quantity: 0,
      total: 0,
    }
    expect(isPriceUnconfirmed(phase)).toBe(false)
  })
})

describe('unconfirmedRows', () => {
  it('devuelve solo las líneas pendientes, en el orden del documento', () => {
    const rows: EstimateRow[] = [
      { id: 'a', type: 'phase', position: 0, phase_name_snapshot: 'P', service_name_snapshot: null, unit_snapshot: null, price_snapshot: null, quantity: 0, total: 0 },
      { id: 'b', type: 'item', position: 1, phase_name_snapshot: null, service_name_snapshot: 'OK', unit_snapshot: 'un', price_snapshot: 10, quantity: 1, total: 10 },
      { id: 'c', type: 'item', position: 2, phase_name_snapshot: null, service_name_snapshot: `Falta (${PRICE_TO_CONFIRM})`, unit_snapshot: 'un', price_snapshot: 0, quantity: 1, total: 0 },
      { id: 'd', type: 'item', position: 3, phase_name_snapshot: null, service_name_snapshot: 'A cero', unit_snapshot: 'un', price_snapshot: 0, quantity: 2, total: 0 },
    ]
    expect(unconfirmedRows(rows).map((r) => r.id)).toEqual(['c', 'd'])
  })

  it('un presupuesto terminado no devuelve nada', () => {
    const rows: EstimateRow[] = [
      { id: 'a', type: 'item', position: 0, phase_name_snapshot: null, service_name_snapshot: 'Línea', unit_snapshot: 'm2', price_snapshot: 12.5, quantity: 4, total: 50 },
    ]
    expect(unconfirmedRows(rows)).toHaveLength(0)
  })
})
