/**
 * Paging for the catalogue read.
 *
 * `catalog_services` is read in bounded windows: a company that imports a big document
 * ends up with thousands of partidas, and asking Postgres for all of them in one query is
 * the read that has to stay sane before bulk imports land (SPEC.md §5).
 *
 * Supabase's `.range(from, to)` is INCLUSIVE at both ends, which is the one place this
 * arithmetic is easy to get wrong, so it lives here — pure and tested — instead of inline
 * in the server action.
 */

/** Rows asked for per request. 162 seeded partidas fit in one page today. */
export const CATALOG_PAGE_SIZE = 500

/**
 * Ceiling for a single request. PostgREST caps a response at 1000 rows (`max_rows`), so
 * asking for more would come back short and read as "this was the last page".
 */
export const CATALOG_MAX_PAGE_ROWS = 1000

/** Hard stop for the accumulation loop: 200 × 500 = 100 000 partidas. */
export const CATALOG_MAX_PAGES = 200

export interface CatalogPageWindow {
  /** 0-based index of the first row, i.e. what a caller passes back in as `offset`. */
  offset: number
  /** Rows this window asks for. */
  limit: number
  /** First index for Supabase `.range(from, to)` (inclusive). */
  from: number
  /** Last index for Supabase `.range(from, to)` (inclusive). */
  to: number
}

/**
 * Where one page starts and ends. Garbage in (negative, fractional, NaN, oversized) is
 * clamped rather than thrown: a bad offset must never take /catalog down.
 */
export function catalogPageWindow(offset: number, limit: number = CATALOG_PAGE_SIZE): CatalogPageWindow {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(CATALOG_MAX_PAGE_ROWS, Math.max(1, Math.floor(limit)))
    : CATALOG_PAGE_SIZE
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0

  return { offset: safeOffset, limit: safeLimit, from: safeOffset, to: safeOffset + safeLimit - 1 }
}

/**
 * Whether a full page came back, i.e. whether there may be another one. A short (or empty)
 * page is the end of the catalogue; asking again would only cost a round trip.
 */
export function catalogPageHasMore(rowsReceived: number, limit: number): boolean {
  return rowsReceived >= limit
}

/**
 * Read the whole catalogue through `fetchPage`, one bounded window at a time, and
 * concatenate the rows in page order — the order `fetchPage` must make deterministic
 * (SQL `ORDER BY`), or rows can repeat or vanish between windows.
 *
 * Stops at the first short page, or at `CATALOG_MAX_PAGES` so a misbehaving query can
 * never spin forever. The offset advances by what actually arrived, not by what was
 * asked for, so a fetcher that returns extra rows cannot cause a re-read.
 */
export async function collectCatalogPages<T>(
  fetchPage: (window: CatalogPageWindow) => Promise<T[]>,
  limit: number = CATALOG_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0

  for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
    const window = catalogPageWindow(offset, limit)
    const chunk = await fetchPage(window)
    rows.push(...chunk)

    if (!catalogPageHasMore(chunk.length, window.limit)) break
    offset += chunk.length
  }

  return rows
}
