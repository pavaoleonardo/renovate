import { describe, expect, it } from 'vitest'
import { detectLayout, normalizeUnit } from '@/lib/import-layout'

/**
 * Telling a price column from a column of measurements. Every case here is a shape a
 * real budget arrived in: the header row lies, the «Precio» column is full of
 * quantities, or there is no usable header at all.
 */

/** A well-formed budget: headers first, one row per partida. */
const normalBudget = [
  ['Código', 'Descripción', 'Ud', 'Cantidad', 'Precio', 'Importe'],
  ['DEM-001', 'Demolición de tabique', 'm2', '12', '18,82', '225,84'],
  ['DEM-002', 'Picado de alicatado', 'm2', '25', '12,40', '310,00'],
  ['RET-001', 'Retirada de escombros', 'ud', '1', '180,00', '180,00']
]

describe('detectLayout', () => {
  it('lee un presupuesto normal por su columna «Precio»', () => {
    const layout = detectLayout(normalBudget)
    expect(layout.priceCol).toBe(4)
    expect(layout.nameCol).toBe(1)
    expect(layout.unitCol).toBe(2)
    expect(layout.codeCol).toBe(0)
    expect(layout.priceDetectedByHeader).toBe(true)
    expect(layout.priceNote).toBeNull()
  })

  it('si «Precio» está lleno de mediciones, manda la columna del dinero y se explica', () => {
    const rows = [
      ['Descripción', 'Ud', 'Precio', 'Precio final'],
      ['Demolición de tabique', 'm2', '1', '18,82'],
      ['Picado de alicatado de baño', 'm2', '2', '310,50'],
      ['Retirada de escombros', 'ud', '3', '180,00']
    ]
    const layout = detectLayout(rows)
    expect(layout.priceCol).toBe(3)
    // La respuesta a «aquí no se ven mis precios»: el resumen dice qué columna ha leído.
    expect(String(layout.priceNote)).toMatch(/mediciones/)
  })

  it('con una sola columna «Precio» llena de mediciones, la conserva y avisa', () => {
    const rows = [
      ['Descripción', 'Ud', 'Precio'],
      ['Demolición de tabique', 'm2', '1'],
      ['Picado de alicatado de baño', 'm2', '2'],
      ['Retirada de escombros', 'ud', '3']
    ]
    // No hay nada mejor: se queda con ella (el resumen marca los precios sospechosos y
    // ofrece elegir la columna a mano), pero no la lee como si fueran tarifas creíbles.
    const layout = detectLayout(rows)
    expect(layout.priceCol).toBe(2)
  })

  it('un documento sin ninguna columna de precios se rechaza con la instrucción manual', () => {
    const rows = [
      ['Descripción', 'Datos'],
      ['Demolición de tabique', 'pendiente'],
      ['Picado de alicatado', 'pendiente']
    ]
    expect(() => detectLayout(rows)).toThrow(/columna del precio a mano/)
  })

  it('una columna «Cantidad» nunca es el precio, aunque sea la única con números', () => {
    const rows = [
      ['Descripción', 'Cantidad', 'Precio'],
      ['Demolición de tabique', '12', ''],
      ['Picado de alicatado', '25', ''],
      ['Retirada de escombros', '1', '']
    ]
    const layout = detectLayout(rows)
    // Se conserva la columna «Precio» vacía: es un presupuesto pendiente de tarifar.
    expect(layout.priceCol).toBe(2)
    expect(layout.priceDetectedByHeader).toBe(true)
  })

  it('la plantilla Excel del producto vuelve a entrar con su código, su sección y su precio', () => {
    const rows = [
      ['Fase', 'Código', 'Partida', 'Descripción', 'Unidad', 'Precio', 'Precio mín.', 'Precio máx.'],
      ['Demoliciones', 'DEM-001', 'Demolición de tabique', 'Demolición de tabique', 'm2', '8,5', '7', '10'],
      ['Demoliciones', 'DEM-002', 'Picado de alicatado', 'Picado de alicatado', 'm2', '7,5', '6', '9']
    ]
    const layout = detectLayout(rows)
    expect(layout.codeCol).toBe(1)
    expect(layout.nameCol).toBe(2)
    expect(layout.unitCol).toBe(4)
    expect(layout.sectionCol).toBe(0)
    expect(layout.priceCol).toBe(5)
  })

  it('la columna elegida a mano manda sobre cualquier detección', () => {
    const rows = [
      ['Descripción', 'Datos', 'Pendiente'],
      ['Demolición de tabique', 'pendiente', '18,82'],
      ['Picado de alicatado', 'pendiente', '12,40']
    ]
    const layout = detectLayout(rows, { priceCol: 2 })
    expect(layout.priceCol).toBe(2)
    expect(layout.priceSource).toBe('user')
    expect(layout.priceNote).toBeNull()
  })
})

describe('normalizeUnit', () => {
  it('normaliza lo que reconoce y respeta lo que no', () => {
    expect(normalizeUnit('M2')).toBe('m2')
    expect(normalizeUnit('Ud.')).toBe('ud')
    expect(normalizeUnit('')).toBe('ud')
    expect(normalizeUnit('ml')).toBe('ml')
    // Una unidad propia de la empresa no se puede inventar: se queda como está escrita.
    expect(normalizeUnit('jornal')).toBe('jornal')
  })
})
