/**
 * Reading prices a person typed by hand.
 *
 * Kept dependency-free and outside any server module: /catalog is a client
 * component, so this file must stay importable in the browser. The importer
 * (src/app/catalog/actions.ts) uses the same function, so a price typed in the
 * catalogue and a price read from a sheet are understood the same way.
 */

/** "1.200", "12.345.678" — dot-grouped thousands with no decimal part. */
const DOT_GROUPED_THOUSANDS = /^[1-9]\d{0,2}(\.\d{3})+$/

/**
 * Turns what somebody wrote in a price field into a number, or null when there is
 * no number to read.
 *
 * null matters: callers keep the previous price instead of saving a 0, so typing
 * a stray letter cannot wipe a rate.
 *
 * Accepts numbers and the text people actually type: "18,82", "1.234,56 €",
 * "1,234.56". When both separators appear, the right-most one is the decimal one
 * (Spanish "1.234,56" and English "1,234.56" both work). A lone dot grouping
 * three digits at a time is read as a thousands separator, the convention this
 * app writes in — but never when the integer part is a single 0, so "0.500"
 * stays 0,5 instead of turning into 500.
 */
export function parsePriceInput(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw === null || raw === undefined) return null

  let text = String(raw).trim()
  if (!text) return null

  text = text.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(text)) return null

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // The right-most separator is the decimal one (1.234,56 vs 1,234.56)
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (lastComma > -1) {
    text = text.replace(',', '.')
  } else if (DOT_GROUPED_THOUSANDS.test(text)) {
    text = text.replace(/\./g, '')
  }

  const value = Number(text)
  return Number.isFinite(value) ? value : null
}
