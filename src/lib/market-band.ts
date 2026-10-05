/**
 * The market band of a catalogue partida when a person fixes it by hand.
 *
 * A band (`price_min` / `price_max`) is a reference: never a limit, never the price
 * itself. Until now only two writers could create one — the seed of the default
 * catalogue and the importer, which inherits the band of the base partida that
 * describes the same work (`findMarketMatch`). That left a real gap: an imported
 * partida the base catalogue does not describe (a «Perfilería PVC Cortizo A-70»
 * window profile, whose only shared word with «Ventana de PVC…» is «pvc») kept a
 * null band forever, and with it the whole section lost the «Mercado» column.
 * This module is the third way in: the company setting the reference itself.
 *
 * Dependency-free on purpose: /catalog is a client component, so this file must stay
 * importable in the browser, and the server action validates with the very same
 * function the person's browser used.
 */

/** The two ends of a band. `null` on both means the partida has no band. */
export interface MarketBandValue {
  price_min: number | null
  price_max: number | null
}

export type MarketBandResult = { ok: true; band: MarketBandValue } | { ok: false; error: string }

/**
 * A band is a band only when both ends exist. Half a band would be invisible: the
 * catalogue renders the range — and the dot that says whether a price sits inside it —
 * only when `price_min` and `price_max` are both set.
 */
export function hasMarketBand(value: { price_min?: number | null; price_max?: number | null }): boolean {
  return value.price_min != null && value.price_max != null
}

const BOTH_ENDS_REQUIRED =
  'Una banda de mercado necesita mínimo y máximo, o ninguno: deja los dos campos vacíos para quitarla.'

const NOT_A_NUMBER = 'La banda tiene que ser un número (18,82 o 1.234,56), o quedarse vacía.'

/** One end of a band as typed: empty means «no band», anything else has to be a number. */
const readEnd = (raw: unknown): { ok: true; value: number | null } | { ok: false } => {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw === 'string' && !raw.trim()) return { ok: true, value: null }
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value)) return { ok: false }
  return { ok: true, value }
}

/**
 * Reads the two ends of a band as somebody typed them.
 *
 * Both empty clears the band. Both filled is accepted while each end is a finite number
 * ≥ 0 and the minimum is not above the maximum — equal ends are allowed, because a tight
 * band is a decision and not a typo. One end on its own is refused instead of stored: a
 * half band shows nowhere, so saving it would only make the person think it worked.
 *
 * Numbers are expected here: the browser reads each field with `parsePriceInput` first, so
 * «1.234,56» has already become 1234.56 by the time this runs.
 */
export function normalizeMarketBand(min: unknown, max: unknown): MarketBandResult {
  const low = readEnd(min)
  const high = readEnd(max)
  if (!low.ok || !high.ok) return { ok: false, error: NOT_A_NUMBER }

  if (low.value === null && high.value === null) return { ok: true, band: { price_min: null, price_max: null } }
  if (low.value === null || high.value === null) return { ok: false, error: BOTH_ENDS_REQUIRED }
  if (low.value < 0 || high.value < 0) return { ok: false, error: 'La banda no puede ser negativa.' }
  if (low.value > high.value) {
    return { ok: false, error: 'El mínimo de la banda no puede ser mayor que el máximo.' }
  }

  return { ok: true, band: { price_min: low.value, price_max: high.value } }
}
