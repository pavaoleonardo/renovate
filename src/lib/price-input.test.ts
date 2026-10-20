import { describe, expect, it } from 'vitest'
import { formatPriceInput, parsePriceInput } from '@/lib/price-input'

/**
 * Reading prices a person typed by hand. The value here is the `null`: callers keep the
 * previous price instead of saving a 0, so a stray letter must never wipe a rate.
 *
 * Test descriptions are Spanish on purpose: they read as behaviour of the Spanish-facing
 * product and name the same cases the importer sees in real files.
 */
describe('parsePriceInput', () => {
  it('lee los precios que la gente escribe de verdad', () => {
    expect(parsePriceInput('18,82')).toBe(18.82)
    expect(parsePriceInput('1.234,56 €')).toBe(1234.56)
    expect(parsePriceInput('1,234.56')).toBe(1234.56)
    expect(parsePriceInput('  45.90  ')).toBe(45.9)
    expect(parsePriceInput('-5,5')).toBe(-5.5)
  })

  it('un punto que agrupa de tres en tres es de millares, salvo detrás de un 0', () => {
    expect(parsePriceInput('1.200')).toBe(1200)
    expect(parsePriceInput('12.345.678')).toBe(12345678)
    // «0.500» es medio euro, no quinientos: los decimales se escriben con punto.
    expect(parsePriceInput('0.500')).toBe(0.5)
    // Un punto que no agrupa de tres en tres es decimal.
    expect(parsePriceInput('12.5')).toBe(12.5)
  })

  it('deja pasar los números, cero incluido', () => {
    expect(parsePriceInput(18.82)).toBe(18.82)
    expect(parsePriceInput(0)).toBe(0)
  })

  it('devuelve null cuando no hay ningún número que leer', () => {
    expect(parsePriceInput('')).toBeNull()
    expect(parsePriceInput('   ')).toBeNull()
    expect(parsePriceInput('pendiente')).toBeNull()
    expect(parsePriceInput('€')).toBeNull()
    expect(parsePriceInput(null)).toBeNull()
    expect(parsePriceInput(undefined)).toBeNull()
    expect(parsePriceInput(Number.NaN)).toBeNull()
    expect(parsePriceInput(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

/**
 * The other direction: what the field shows for a stored price. A comma, because
 * that is how it is typed here, and an empty field for zero — a 0 in an estimate
 * means «pendiente», not «gratis».
 */
describe('formatPriceInput', () => {
  it('escribe los decimales con coma, como se teclean aquí', () => {
    expect(formatPriceInput(18.82)).toBe('18,82')
    expect(formatPriceInput(0.5)).toBe('0,5')
    expect(formatPriceInput(1234.56)).toBe('1234,56')
  })

  it('un número entero se queda sin decimales', () => {
    expect(formatPriceInput(1200)).toBe('1200')
    expect(formatPriceInput(1)).toBe('1')
  })

  it('no deja ver la basura del coma flotante', () => {
    expect(formatPriceInput(0.1 + 0.2)).toBe('0,3')
  })

  it('cero y vacío se leen como «sin precio todavía»', () => {
    expect(formatPriceInput(0)).toBe('')
    expect(formatPriceInput(null)).toBe('')
    expect(formatPriceInput(undefined)).toBe('')
    expect(formatPriceInput(Number.NaN)).toBe('')
  })
})

