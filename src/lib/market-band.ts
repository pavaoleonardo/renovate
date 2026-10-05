/**
 * The market band of a catalogue partida — the reference the «Mercado» column shows.
 *
 * A band (`price_min` / `price_max`) is a reference: never a limit, never the price
 * itself. Two writers create one — the seed of the default catalogue and the importer,
 * which inherits the band of the base partida that describes the same work
 * (`findMarketMatch`). It is not editable: a partida the base catalogue does not
 * describe has no band, and its section then shows no «Mercado» column.
 *
 * Dependency-free on purpose: /catalog is a client component, so this file must stay
 * importable in the browser.
 */


/**
 * A band is a band only when both ends exist. Half a band would be invisible: the
 * catalogue renders the range — and the dot that says whether a price sits inside it —
 * only when `price_min` and `price_max` are both set.
 */
export function hasMarketBand(value: { price_min?: number | null; price_max?: number | null }): boolean {
  return value.price_min != null && value.price_max != null
}


