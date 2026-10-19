import { describe, expect, it } from 'vitest'
import { cellText, detectLayout, normalizeUnit } from '@/lib/import-layout'

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

describe('cellText', () => {
  it('no toca las mayúsculas: la partida se guarda como está escrita en el documento', () => {
    // Un presupuesto de proveedor llega en MAYÚSCULAS. Si el lector cambiara la caja, el
    // nombre guardado no sería el que el cliente lee en el PDF ni el que aparece en el
    // desplegable del presupuesto: la partida dejaría de reconocerse de un vistazo.
    expect(cellText('TIRAS PLETINAS PVC 50 MM')).toBe('TIRAS PLETINAS PVC 50 MM')
    expect(cellText('Perfilería PVC Cortizo A-70')).toBe('Perfilería PVC Cortizo A-70')
    // Los acentos tampoco se tocan: son parte de la descripción, no ruido que quitar.
    expect(cellText('  RETIRADA DE ESCOMBROS  ')).toBe('RETIRADA DE ESCOMBROS')
  })

  it('trata el 0 y el hueco como cosas distintas', () => {
    // Un 0 de la hoja es una cantidad, no una celda vacía: lo que decide es `null`, no el falsy.
    expect(cellText(0)).toBe('0')
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
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
    expect(normalizeUnit('CJ')).toBe('CJ')
  })
})

/**
 * The shape of the budget that broke the importer (2026-10, «PRESUPUESTO REFORMA
 * JJ91»): no header row, a letterhead with three numbers in column F, then 120
 * partidas whose quantity / unit price / line total live in G / H / I.
 *
 * Nothing of the real file is copied here — not one description, not one price, and
 * of course no client data. Only the geometry, which is what `detectLayout` reads.
 */
const budgetWithLetterhead = (() => {
  const rows: unknown[][] = [
    [null, null, null, null, null, 'B 86213790'],
    [null, null, null, null, null, 'C/ PINTO 39,3B'],
    [null, null, null, null, null, '28982 PARLA'],
    [null, 'Cliente :', 'Cliente de prueba', null, null, null],
    [null, 'Obra :', 'Calle de prueba 91', null, null, null],
    [null, 'Madrid 8 de mayo de 2026', null, null, null, null],
    [null, null, null, null, 'Presupuesto 08052026.', null],
    [null, null, null, null, null, null],
    [null, 'Capitulo 1 Demoliciones', null, null, null, null, null, null, null]
  ]
  // 120 partidas, three sections: always qty × price = line total.
  for (let i = 0; i < 120; i++) {
    if (i % 40 === 0) rows.push([null, `Capitulo ${i / 40 + 2} Reformas`, null, null, null, null, null, null, null])
    const quantity = (i % 12) + 1
    const price = 6 + (i % 47) * 1.35
    rows.push(['m2', `Partida sintética ${i + 1}`, null, null, null, null, String(quantity), price.toFixed(2).replace('.', ','), (quantity * price).toFixed(2).replace('.', ',')])
  }
  return rows
})()

describe('detectLayout · presupuesto sin cabeceras con membrete', () => {
  it('lee el precio de H y la cantidad de G, no los tres números del membrete de F', () => {
    const layout = detectLayout(budgetWithLetterhead)
    // F tiene tres números (los del membrete): antes empataba a 1.000 con H e I y ganaba
    // por ser la primera, así que las 120 partidas entraban sin precio.
    expect(layout.priceCol).toBe(7)
    expect(layout.quantityCol).toBe(6)
    expect(layout.priceSource).toBe('numbers')
    expect(layout.priceDetectedByHeader).toBe(false)
  })

  it('lo dice en el resumen: nombra la columna del membrete y la que se ha leído', () => {
    const layout = detectLayout(budgetWithLetterhead)
    const note = String(layout.priceNote)
    expect(note).toMatch(/columna H/)
    expect(note).toMatch(/columna F solo tiene 3 números/)
    expect(note).toMatch(/cabecera del documento/)
  })

  it('ninguna partida se queda a 0 €: toda fila con cantidad trae su precio', () => {
    const layout = detectLayout(budgetWithLetterhead)
    const partidas = budgetWithLetterhead.filter((row) => String((row as unknown[])[1] ?? '').startsWith('Partida sintética'))
    expect(partidas).toHaveLength(120)
    for (const row of partidas) {
      const price = (row as unknown[])[layout.priceCol]
      expect(price).not.toBeNull()
      expect(Number(String(price).replace('.', '').replace(',', '.'))).toBeGreaterThan(0)
    }
  })

  it('un presupuesto con cabecera no cambia: su «Importe» nunca sustituye al «Precio»', () => {
    const layout = detectLayout(normalBudget)
    expect(layout.priceCol).toBe(4)
    expect(layout.quantityCol).toBe(3)
    expect(layout.priceSource).toBe('header')
  })
})

