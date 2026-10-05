import { describe, expect, it } from 'vitest'
import { computeTotals, normalizeTaxRate, round2, taxHint, taxLabel } from '@/lib/estimate-totals'

/**
 * The money in a budget. This file exists because the VAT was once hardcoded in two
 * places with two meanings (the editor added 21 % on top, /estimates showed the base
 * amount). Every case below is a figure a client can end up reading on a PDF.
 */

describe('round2', () => {
  it('redondea a céntimos y no devuelve nunca un NaN', () => {
    expect(round2(18.825)).toBe(18.83)
    expect(round2(0.004)).toBe(0)
    expect(round2(Number.NaN)).toBe(0)
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('normalizeTaxRate', () => {
  it('acepta 0, 10 y 21 vengan como vengan', () => {
    expect(normalizeTaxRate(21)).toBe(21)
    expect(normalizeTaxRate('10')).toBe(10)
    expect(normalizeTaxRate(0)).toBe(0)
  })

  it('un valor que falta o no es un tipo válido cae en el 21 %, nunca en «sin IVA»', () => {
    // El fallo que este test protege: un presupuesto sin tipo elegido no puede
    // imprimirse sin IVA por accidente.
    expect(normalizeTaxRate(null)).toBe(21)
    expect(normalizeTaxRate(undefined)).toBe(21)
    expect(normalizeTaxRate('')).toBe(21)
    expect(normalizeTaxRate('mucho')).toBe(21)
    expect(normalizeTaxRate(15)).toBe(21)
  })
})

describe('computeTotals', () => {
  it('suma el IVA sobre la base y da el total que se imprime en el PDF', () => {
    expect(computeTotals(100, 21)).toEqual({ subtotal: 100, taxRate: 21, tax: 21, total: 121 })
    expect(computeTotals(1000, 10)).toEqual({ subtotal: 1000, taxRate: 10, tax: 100, total: 1100 })
    expect(computeTotals(250.5, 0)).toEqual({ subtotal: 250.5, taxRate: 0, tax: 0, total: 250.5 })
  })

  it('redondea a céntimos sin descuadrar el total', () => {
    const totals = computeTotals(99.99, 10)
    expect(totals.tax).toBe(10)
    expect(totals.total).toBe(109.99)
  })

  it('un presupuesto vacío es cero, no un error', () => {
    expect(computeTotals(0, 21)).toEqual({ subtotal: 0, taxRate: 21, tax: 0, total: 0 })
  })
})

describe('taxLabel y taxHint', () => {
  it('la etiqueta y la pista van con el tipo aplicado', () => {
    expect(taxLabel(0)).toBe('Sin IVA')
    expect(taxLabel('21')).toBe('IVA (21%)')
    expect(taxHint(10)).toMatch(/vivienda/)
    expect(taxHint(0)).toMatch(/sin IVA/i)
  })
})
