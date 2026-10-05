import { describe, expect, it } from 'vitest'
import { hasMarketBand } from '@/lib/market-band'

/**
 * The «Mercado» column shows up only where a band exists, and a band exists only when both
 * ends do. The two writers are the seed of the default catalogue and the importer, which
 * inherits one when the base catalogue describes the same work: a partida neither
 * describes has no band, and its section then shows no column at all — and no price is
 * invented for it either (it stays at 0,00 € for the company to fill in).
 */
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
