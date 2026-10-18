import { describe, expect, it } from 'vitest'
import {
  CATALOG_MAX_PAGES,
  CATALOG_MAX_PAGE_ROWS,
  CATALOG_PAGE_SIZE,
  catalogPageHasMore,
  catalogPageWindow,
  collectCatalogPages,
  type CatalogPageWindow
} from '@/lib/catalog-pages'

/**
 * The catalogue is read in windows because `.range(from, to)` is INCLUSIVE at both ends:
 * an off-by-one here either repeats a partida between pages or skips one, and a big
 * imported catalogue is exactly where nobody would notice until a price went missing.
 *
 * No database, no session: the fetcher is injected.
 */
describe('catalogPageWindow', () => {
  it('pide la primera página desde la fila 0 y hasta la 499', () => {
    expect(catalogPageWindow(0)).toEqual({ offset: 0, limit: CATALOG_PAGE_SIZE, from: 0, to: 499 })
  })

  it('la segunda página empieza en la 500, no en la 501', () => {
    expect(catalogPageWindow(CATALOG_PAGE_SIZE)).toEqual({
      offset: 500,
      limit: CATALOG_PAGE_SIZE,
      from: 500,
      to: 999
    })
  })

  it('respeta un tamaño de página propio', () => {
    expect(catalogPageWindow(100, 50)).toEqual({ offset: 100, limit: 50, from: 100, to: 149 })
  })

  it('una página de una sola fila pide from = to', () => {
    expect(catalogPageWindow(7, 1)).toEqual({ offset: 7, limit: 1, from: 7, to: 7 })
  })

  it('sanea un offset negativo, fraccionario o imposible', () => {
    expect(catalogPageWindow(-10, 50).offset).toBe(0)
    expect(catalogPageWindow(12.9, 50).offset).toBe(12)
    expect(catalogPageWindow(Number.NaN, 50).offset).toBe(0)
    expect(catalogPageWindow(Number.POSITIVE_INFINITY, 50).offset).toBe(0)
  })

  it('nunca pide menos de una fila ni más de lo que PostgREST devuelve', () => {
    expect(catalogPageWindow(0, 0).limit).toBe(1)
    expect(catalogPageWindow(0, -5).limit).toBe(1)
    expect(catalogPageWindow(0, CATALOG_MAX_PAGE_ROWS + 1).limit).toBe(CATALOG_MAX_PAGE_ROWS)
    expect(catalogPageWindow(0, Number.NaN).limit).toBe(CATALOG_PAGE_SIZE)
  })
})

describe('catalogPageHasMore', () => {
  it('una página llena puede tener otra detrás', () => {
    expect(catalogPageHasMore(500, 500)).toBe(true)
    expect(catalogPageHasMore(1200, 1000)).toBe(true)
  })

  it('una página corta o vacía es el final del catálogo', () => {
    expect(catalogPageHasMore(499, 500)).toBe(false)
    expect(catalogPageHasMore(162, 500)).toBe(false)
    expect(catalogPageHasMore(0, 500)).toBe(false)
  })
})

describe('collectCatalogPages', () => {
  /** Fetcher over `total` fake rows, recording every window it was asked for. */
  function fetcher(total: number) {
    const rows = Array.from({ length: total }, (_, index) => `p${index}`)
    const windows: CatalogPageWindow[] = []

    return {
      windows,
      fetchPage: async (window: CatalogPageWindow) => {
        windows.push(window)
        return rows.slice(window.from, window.to + 1)
      }
    }
  }

  it('junta páginas llenas con la última corta, en orden', async () => {
    const { fetchPage, windows } = fetcher(1201)
    const rows = await collectCatalogPages(fetchPage)

    expect(rows).toHaveLength(1201)
    expect(rows[0]).toBe('p0')
    expect(rows[1199]).toBe('p1199')
    expect(rows[1200]).toBe('p1200')
    expect(windows.map((w) => w.offset)).toEqual([0, 500, 1000])
  })

  it('un catálogo más pequeño que una página se lee en una sola petición', async () => {
    const { fetchPage, windows } = fetcher(162)
    const rows = await collectCatalogPages(fetchPage)

    expect(rows).toHaveLength(162)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toEqual({ offset: 0, limit: 500, from: 0, to: 499 })
  })

  it('un múltiplo exacto del tamaño de página pide una última página vacía', async () => {
    const { fetchPage, windows } = fetcher(1000)
    const rows = await collectCatalogPages(fetchPage)

    expect(rows).toHaveLength(1000)
    expect(windows.map((w) => w.offset)).toEqual([0, 500, 1000])
    expect(rows[999]).toBe('p999')
  })

  it('no repite filas aunque el servidor devuelva más de lo pedido', async () => {
    let calls = 0
    const rows = await collectCatalogPages(async () => {
      calls += 1
      // Each call ignores the limit and hands back one extra row.
      return [`a${calls}`, `b${calls}`]
    }, 1)

    expect(calls).toBe(CATALOG_MAX_PAGES)
    expect(new Set(rows).size).toBe(rows.length)
  })

  it('se detiene en CATALOG_MAX_PAGES si el servidor nunca devuelve una página corta', async () => {
    let calls = 0
    const rows = await collectCatalogPages(async () => {
      calls += 1
      return ['x', 'y']
    }, 2)

    expect(calls).toBe(CATALOG_MAX_PAGES)
    expect(rows).toHaveLength(CATALOG_MAX_PAGES * 2)
  })
})
