import { describe, expect, it } from 'vitest'
import { hasMarketBand, normalizeMarketBand } from '@/lib/market-band'

/**
 * The market band a person fixes by hand — the third way a band can exist, next to the
 * seeded default catalogue and the band an import inherits.
 *
 * The value here is in the refusals: half a band and a minimum above the maximum must
 * never reach the database, because the catalogue only renders a band when both ends
 * exist, so a stored half band would be a silent no-op.
 */
describe('normalizeMarketBand', () => {
  it('acepta una banda escrita con números', () => {
    expect(normalizeMarketBand(400, 620)).toEqual({ ok: true, band: { price_min: 400, price_max: 620 } })
    expect(normalizeMarketBand(0, 12.5)).toEqual({ ok: true, band: { price_min: 0, price_max: 12.5 } })
  })

  it('acepta lo que sale de los dos campos del catálogo', () => {
    expect(normalizeMarketBand('400', '620')).toEqual({ ok: true, band: { price_min: 400, price_max: 620 } })
    expect(normalizeMarketBand(' 400 ', '620')).toEqual({ ok: true, band: { price_min: 400, price_max: 620 } })
  })

  it('deja los dos extremos vacíos para quitar la banda', () => {
    expect(normalizeMarketBand('', '')).toEqual({ ok: true, band: { price_min: null, price_max: null } })
    expect(normalizeMarketBand('   ', '')).toEqual({ ok: true, band: { price_min: null, price_max: null } })
    expect(normalizeMarketBand(null, null)).toEqual({ ok: true, band: { price_min: null, price_max: null } })
    expect(normalizeMarketBand(undefined, undefined)).toEqual({ ok: true, band: { price_min: null, price_max: null } })
  })

  it('permite una banda estrecha, incluso de un solo valor', () => {
    expect(normalizeMarketBand(50, 50)).toEqual({ ok: true, band: { price_min: 50, price_max: 50 } })
  })

  it('rechaza media banda, porque el catálogo no la mostraría', () => {
    expect(normalizeMarketBand(400, '')).toEqual({ ok: false, error: expect.stringContaining('mínimo y máximo') })
    expect(normalizeMarketBand('', 620)).toEqual({ ok: false, error: expect.stringContaining('mínimo y máximo') })
    expect(normalizeMarketBand(400, null).ok).toBe(false)
    expect(normalizeMarketBand(null, 620).ok).toBe(false)
  })

  it('rechaza que el mínimo quede por encima del máximo', () => {
    expect(normalizeMarketBand(620, 400)).toEqual({ ok: false, error: expect.stringContaining('mayor que el máximo') })
  })

  it('rechaza una banda negativa', () => {
    expect(normalizeMarketBand(-1, 10)).toEqual({ ok: false, error: expect.stringContaining('negativa') })
    expect(normalizeMarketBand(10, -5)).toEqual({ ok: false, error: expect.stringContaining('negativa') })
  })

  it('rechaza lo que no es un número', () => {
    expect(normalizeMarketBand('pendiente', 10)).toEqual({ ok: false, error: expect.stringContaining('número') })
    expect(normalizeMarketBand('1.234,56', 10).ok).toBe(false)
    expect(normalizeMarketBand(Number.NaN, 10).ok).toBe(false)
    expect(normalizeMarketBand(Number.POSITIVE_INFINITY, 10).ok).toBe(false)
  })
})

describe('hasMarketBand', () => {
  it('sólo hay banda cuando existen los dos extremos', () => {
    expect(hasMarketBand({ price_min: 400, price_max: 620 })).toBe(true)
    expect(hasMarketBand({ price_min: 0, price_max: 0 })).toBe(true)
    expect(hasMarketBand({ price_min: null, price_max: null })).toBe(false)
    expect(hasMarketBand({ price_min: 400, price_max: null })).toBe(false)
    expect(hasMarketBand({ price_min: null, price_max: 620 })).toBe(false)
    expect(hasMarketBand({})).toBe(false)
  })
})
