import type { PriceSourceKind } from '@/types'

/**
 * Price-basis helpers for /catalog.
 *
 * Kept dependency-free and outside any server module: the catalogue page is a client
 * component, so this file must stay importable in the browser. The labels are
 * user-facing copy, hence Spanish.
 */

/** Cost driver of a partida, as shown next to its price. */
export const SOURCE_KIND_LABELS: Record<PriceSourceKind, string> = {
  labour: 'Mano de obra',
  material: 'Material',
  mixed: 'Mano de obra y material',
  'admin-fee': 'Tasa administrativa',
}

/**
 * 'Borrador propio · contraste de bandas de mercado · 2026-09' → 'Borrador propio'.
 * The short tag shown on the row, so nobody reads these prices as a licensed base.
 */
export const shortPriceSource = (priceSource?: string | null) => {
  const [first] = (priceSource ?? '').split('·')
  return first.trim() || null
}

/** '2026-09-01' → '09/2026', the review date shown next to the price basis. */
export const formatReviewDate = (reviewedAt?: string | null) => {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(reviewedAt ?? '')
  return match ? `${match[2]}/${match[1]}` : null
}

/** A default price may go this long without a hand review before the UI flags it. */
export const PRICE_REVIEW_MAX_AGE_DAYS = 365

/**
 * True when the last hand review is older than a year. Unknown dates are *not*
 * flagged: imported partidas carry no basis at all and should not be nagged about.
 */
export const isPriceStale = (reviewedAt?: string | null, now: Date = new Date()) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reviewedAt ?? '')
  if (!match) return false
  const reviewed = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return now.getTime() - reviewed > PRICE_REVIEW_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}
