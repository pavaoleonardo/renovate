import { describe, expect, it } from 'vitest'
import { CATALOG_TEMPLATE_HEADER, catalogTemplateRows, defaultCatalogPhases } from '@/lib/catalog-template'
import { detectLayout } from '@/lib/import-layout'
import type { CatalogService } from '@/types'

const service = (over: Partial<CatalogService>): CatalogService => ({
  id: 'svc',
  phase_id: 'phase',
  name: 'Partida',
  unit: 'm2',
  base_price: 10,
  ...over
})

const company = [
  {
    name: 'Demoliciones',
    services: [
      service({ name: 'Demolición de tabique', code: 'DEM-001', description: 'Ladrillo o rasillón' }),
      service({ name: 'Levantado de rodapié', code: 'DEM-007', unit: 'ud', base_price: 110 })
    ]
  },
  {
    name: 'Pintura',
    services: [service({ name: 'Pintura plástica en paredes', code: 'PIN-001', base_price: 7.5, price_min: 6, price_max: 9 })]
  }
]

describe('Excel del catálogo', () => {
  it('empieza por la cabecera que el importador reconoce', () => {
    expect(catalogTemplateRows(company)[0]).toEqual(CATALOG_TEMPLATE_HEADER)
    expect(detectLayout(catalogTemplateRows(company)).sectionCol).toBe(0)
    expect(detectLayout(catalogTemplateRows(company)).codeCol).toBe(1)
    expect(detectLayout(catalogTemplateRows(company)).nameCol).toBe(2)
    expect(detectLayout(catalogTemplateRows(company)).unitCol).toBe(4)
    expect(detectLayout(catalogTemplateRows(company)).priceCol).toBe(5)
  })

  it('lleva las partidas de la empresa, las importadas incluidas, con su código', () => {
    const rows = catalogTemplateRows(company)
    expect(rows).toHaveLength(4)
    expect(rows[2]).toEqual(['Demoliciones', 'DEM-007', 'Levantado de rodapié', '', 'ud', 110, '', ''])
    expect(rows[3]).toEqual(['Pintura', 'PIN-001', 'Pintura plástica en paredes', '', 'm2', 7.5, 6, 9])
  })

  it('no escribe una partida sin nombre: no se podría volver a importar', () => {
    const rows = catalogTemplateRows([{ name: 'Pintura', services: [service({ name: '  ' })] }])
    expect(rows).toHaveLength(1)
  })

  it('una empresa sin catálogo descarga el catálogo por defecto completo', () => {
    const rows = catalogTemplateRows(defaultCatalogPhases())
    expect(rows).toHaveLength(61)
    expect(rows[1].slice(0, 2)).toEqual([defaultCatalogPhases()[0].name, 'DEM-001'])
    // Las tres primeras columnas de la segunda fila son sección, código y partida.
    expect(String(rows[1][1])).toMatch(/^[A-Z]{3}-\d{3}$/)
  })
})
