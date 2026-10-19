import { DEFAULT_CATALOG } from '@/lib/default-catalog'
import type { CatalogPhase, CatalogService } from '@/types'

/**
 * Las filas del Excel que se descarga desde /catalog.
 *
 * La cabecera es exactamente la que reconoce el importador (`Fase`, `Código`,
 * `Partida`, `Descripción`, `Unidad`, `Precio`, `Precio mín.`, `Precio máx.`): editar
 * el archivo y volver a subirlo tiene que funcionar sin tocar nada.
 *
 * Se construye aquí, fuera de la ruta, para poder comprobar sin red que el archivo
 * lleva de verdad las partidas de la empresa (las importadas incluidas) y no sólo el
 * catálogo por defecto, que era el fallo: el botón decía «descarga tus partidas» y
 * devolvía siempre las sesenta del catálogo base.
 */

export const CATALOG_TEMPLATE_HEADER = [
  'Fase',
  'Código',
  'Partida',
  'Descripción',
  'Unidad',
  'Precio',
  'Precio mín.',
  'Precio máx.'
]

/** Un número que se puede escribir en la hoja; `null` se deja en blanco. */
const optionalNumber = (value: number | string | null | undefined): number | '' => {
  if (value === null || value === undefined || value === '') return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : ''
}

/** Fila de una partida: la sección se repite en cada línea, como en la plantilla. */
export function catalogTemplateRow(phaseName: string, service: CatalogService): (string | number)[] {
  const price = optionalNumber(service.base_price)
  return [
    phaseName,
    service.code ?? '',
    service.name,
    service.description ?? '',
    service.unit,
    price === '' ? 0 : price,
    optionalNumber(service.price_min),
    optionalNumber(service.price_max)
  ]
}

/**
 * La hoja completa: cabecera y, por cada sección, sus partidas en el orden recibido.
 * Una partida sin nombre no se escribe (no se puede volver a importar).
 */
export function catalogTemplateRows(phases: (Omit<CatalogPhase, 'id'> & { services: CatalogService[] })[]): (string | number)[][] {
  const rows: (string | number)[][] = [CATALOG_TEMPLATE_HEADER]

  for (const phase of phases) {
    for (const service of phase.services) {
      if (!String(service.name ?? '').trim()) continue
      rows.push(catalogTemplateRow(phase.name, service))
    }
  }

  return rows
}

/**
 * El catálogo por defecto con la misma forma que el de una empresa, para que una
 * empresa sin catálogo (o con una lectura fallida) siga descargando algo útil.
 */
export function defaultCatalogPhases(): (Omit<CatalogPhase, 'id'> & { services: CatalogService[] })[] {
  return DEFAULT_CATALOG.map((phase, phaseIndex) => ({
    name: phase.name,
    services: phase.services.map((service, serviceIndex) => ({
      id: `${phaseIndex}-${serviceIndex}`,
      phase_id: `${phaseIndex}`,
      name: service.name,
      unit: service.unit,
      base_price: service.base_price,
      code: service.code,
      description: service.description,
      price_min: service.price_min,
      price_max: service.price_max,
      origin: 'catalogo_base'
    }))
  }))
}
