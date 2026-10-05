import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATALOG,
  DEFAULT_CATALOG_PRICE_SOURCE,
  DEFAULT_CATALOG_REVISION
} from '@/lib/default-catalog'

/**
 * Invariants of the catalogue every company is seeded with. The point of these is
 * cheap: the seeded catalogue is the reference for every market band the importer
 * recommends, so a typo in it (a price outside its own band, a duplicated code) leaks
 * straight into a customer's budget.
 *
 * The hand-written table in docs/catalogo-precios.md is checked separately by
 * `npm run catalog:check`, which works even where that local-only doc is missing.
 */

const services = DEFAULT_CATALOG.flatMap((phase) => phase.services)

describe('catálogo por defecto', () => {
  it('es el que se envía: 10 secciones y 60 partidas', () => {
    expect(DEFAULT_CATALOG).toHaveLength(10)
    expect(services).toHaveLength(60)
  })

  it('empieza por la partida de demolición con la que se probó el importador', () => {
    expect(services[0].code).toBe('DEM-001')
    expect(services[0].unit).toBe('m2')
  })

  it('no repite códigos ni secciones', () => {
    expect(new Set(services.map((service) => service.code)).size).toBe(services.length)
    expect(new Set(DEFAULT_CATALOG.map((phase) => phase.name)).size).toBe(DEFAULT_CATALOG.length)
  })

  it('deja cada precio base dentro de su propia banda de mercado', () => {
    for (const service of services) {
      expect(service.price_min, service.code).toBeLessThanOrEqual(service.base_price)
      expect(service.price_max, service.code).toBeGreaterThanOrEqual(service.base_price)
    }
  })

  it('nunca presenta los precios como si vinieran de una base con licencia', () => {
    expect(DEFAULT_CATALOG_PRICE_SOURCE).toMatch(/Borrador propio/)
    expect(DEFAULT_CATALOG_PRICE_SOURCE).not.toMatch(/BEDEC|IVE|BCCA|CYPE/i)
  })

  it('la fecha de revisión es un ISO válido y la cita la base de precios', () => {
    expect(DEFAULT_CATALOG_REVISION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(DEFAULT_CATALOG_PRICE_SOURCE).toContain(DEFAULT_CATALOG_REVISION.slice(0, 7))
  })
})
