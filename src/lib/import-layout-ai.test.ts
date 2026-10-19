import { describe, expect, it } from 'vitest'
import { detectLayout } from '@/lib/import-layout'
import {
  layoutDigest,
  layoutPrompt,
  maskSample,
  parseLayoutAnswer,
  validateLayoutAnswer
} from '@/lib/import-layout-ai'

/**
 * The AI is only asked when the deterministic reader found no price at all, and its
 * answer is worthless until the sheet proves it. These tests are about those two
 * promises: what leaves the server (masked) and what is accepted (almost nothing).
 *
 * Everything below is synthetic: the geometry of a budget, no real client, no real
 * prices, no real file.
 */

const sheet = (() => {
  const rows: unknown[][] = [
    [null, null, null, null, null, 'B 86213790'],
    [null, null, null, null, null, 'C/ PINTO 39,3B'],
    [null, 'Cliente :', 'Cliente de prueba', null, null, null],
    [null, 'Aviso :', 'Llamar al +34 600 123 456', null, null, null],
    [null, 'Capitulo 1 Demoliciones', null, null, null, null, null, null, null]
  ]
  for (let i = 0; i < 40; i++) {
    const quantity = (i % 5) + 1
    const price = 18.5 + i
    rows.push([
      'm2',
      `Partida sintética ${i + 1}`,
      null,
      null,
      null,
      null,
      String(quantity),
      price.toFixed(2),
      (quantity * price).toFixed(2)
    ])
  }
  return rows
})()

const layout = detectLayout(sheet)

describe('maskSample', () => {
  it('quita teléfonos, correos y números largos antes de mandar nada', () => {
    expect(maskSample('+34 600 123 456')).toBe('(teléfono)')
    expect(maskSample('cliente@ejemplo.com')).toBe('(correo)')
    expect(maskSample('08052026')).toBe('(número largo)')
  })

  it('deja intacto lo que hace falta para reconocer una columna', () => {
    expect(maskSample('18,82')).toBe('18,82')
    expect(maskSample('PROTECCION DE SUELOS')).toBe('PROTECCION DE SUELOS')
    // Un texto largo se corta: una descripción sirve, un párrafo no.
    const long = 'x'.repeat(80)
    expect(maskSample(long).length).toBe(60)
    expect(maskSample('')).toBe('')
  })
})

describe('layoutDigest', () => {
  it('describe las columnas sin los datos del membrete', () => {
    const digest = layoutDigest(layout)
    expect(digest).toMatch(/· H ·/)
    expect(digest).toMatch(/números/)
    // El membrete queda por encima de la tabla, así que ni siquiera entra en el digest;
    // y aunque entrara, `maskSample` lo taparía.
    expect(digest).not.toContain('B 86213790')
    expect(digest).not.toContain('600 123 456')
    expect(digest).not.toContain('@')
  })

  it('la pregunta pide el precio unitario y prohíbe inventar', () => {
    const prompt = layoutPrompt(layoutDigest(layout))
    expect(prompt).toMatch(/PRECIO UNITARIO/)
    expect(prompt).toMatch(/null/)
    expect(prompt).toMatch(/"priceCol"/)
  })
})

describe('parseLayoutAnswer', () => {
  it('acepta índices numéricos y también los que llegan entre comillas', () => {
    expect(parseLayoutAnswer({ priceCol: 7, quantityCol: 6, totalCol: 8 })?.priceCol).toBe(7)
    expect(parseLayoutAnswer({ priceCol: '7' })?.priceCol).toBe(7)
    expect(parseLayoutAnswer({ priceCol: null })?.priceCol).toBeNull()
  })

  it('rechaza lo que no es una respuesta', () => {
    expect(parseLayoutAnswer('7')).toBeNull()
    expect(parseLayoutAnswer([])).toBeNull()
    expect(parseLayoutAnswer(null)).toBeNull()
    expect(parseLayoutAnswer({ priceCol: 1.5 })).toBeNull()
    expect(parseLayoutAnswer({ priceCol: 'la de la derecha' })).toBeNull()
  })
})

describe('validateLayoutAnswer', () => {
  it('acepta H como precio y G como cantidad cuando la aritmética cuadra', () => {
    const verdict = validateLayoutAnswer({ priceCol: 7, quantityCol: 6, totalCol: 8 }, layout, sheet)
    expect(verdict).not.toBeNull()
    expect(verdict?.priceCol).toBe(7)
    expect(verdict?.quantityCol).toBe(6)
    expect(verdict?.pricedLines).toBe(40)
    expect(String(verdict?.note)).toMatch(/columna H/)
  })

  it('rechaza la columna del membrete: tres números no son una tarifa', () => {
    expect(validateLayoutAnswer({ priceCol: 5 }, layout, sheet)).toBeNull()
  })

  it('rechaza una columna que no existe o que ya se lee como otra cosa', () => {
    expect(validateLayoutAnswer({ priceCol: 99 }, layout, sheet)).toBeNull()
    expect(validateLayoutAnswer({ priceCol: layout.nameCol }, layout, sheet)).toBeNull()
    expect(validateLayoutAnswer({ priceCol: 1, quantityCol: 0 }, layout, sheet)).toBeNull()
  })

  it('se queda con el precio y tira la cantidad si no puede demostrarla', () => {
    // La columna 0 es la unidad: nunca puede ser la cantidad, y sin cantidad no hay
    // `cantidad × precio` que comprobar.
    const verdict = validateLayoutAnswer({ priceCol: 7, quantityCol: 0 }, layout, sheet)
    expect(verdict?.priceCol).toBe(7)
    expect(verdict?.quantityCol).toBeNull()
  })

  it('rechaza una columna de mediciones disfrazada de precio', () => {
    const measurements = [
      ['Descripción', 'Datos'],
      ...Array.from({ length: 10 }, (_, i) => [`Partida sintética ${i + 1}`, String((i % 3) + 1)])
    ]
    const measurementLayout = detectLayout(measurements)
    expect(validateLayoutAnswer({ priceCol: 1 }, measurementLayout, measurements)).toBeNull()
  })
})
