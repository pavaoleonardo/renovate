import { describe, expect, it } from 'vitest'
import { cleanImportedText, matchCatalogCase } from '@/lib/catalog-case'

/**
 * Los nombres que sube la empresa llegan en mayúsculas y con los restos que deja la hoja
 * de cálculo al partir una celda. Aquí se fija lo que se guarda: el estilo del catálogo
 * por defecto, y nada más que a los nombres que vienen enteros en mayúsculas.
 *
 * Todos los ejemplos son nombres reales de un catálogo subido desde un Excel.
 */
describe('matchCatalogCase', () => {
  it('deja como está lo que una persona escribió con minúsculas', () => {
    expect(matchCatalogCase('Trasdosado directo de Pladur')).toBe('Trasdosado directo de Pladur')
    expect(matchCatalogCase('Demolición de tabique')).toBe('Demolición de tabique')
    // Mezclado a mano (una sigla suelta en un nombre en minúsculas) tampoco se toca.
    expect(matchCatalogCase('Falso techo con placa verde WR')).toBe('Falso techo con placa verde WR')
  })

  it('pasa un nombre entero en mayúsculas al estilo del catálogo por defecto', () => {
    expect(matchCatalogCase('ESPEJO CUADRADO')).toBe('Espejo cuadrado')
    expect(matchCatalogCase('CUADRO GENERAL DE DISTRIBUCIÓN')).toBe('Cuadro general de distribución')
    expect(matchCatalogCase('ENFOSCADO MAESTRADO')).toBe('Enfoscado maestrado')
  })

  it('respeta las siglas del oficio que el catálogo escribe en mayúsculas', () => {
    expect(matchCatalogCase('TIRAS PLETINAS PVC 50 MM')).toBe('Tiras pletinas PVC 50 mm')
    expect(matchCatalogCase('FALSO TECHO CON PLACA VERDE WR')).toBe('Falso techo con placa verde WR')
    expect(matchCatalogCase('AISLAMIENTO CON PLACA XPS')).toBe('Aislamiento con placa XPS')
  })

  it('respeta las marcas que el catálogo por defecto escribe con mayúscula', () => {
    expect(matchCatalogCase('TRASDOSADO DIRECTO DE PLADUR')).toBe('Trasdosado directo de Pladur')
    expect(matchCatalogCase('PERFILERIA PVC CORTIZO A-70')).toBe('Perfileria PVC Cortizo A-70')
    expect(matchCatalogCase('CALDERA VAILLANT DE CONDENSACION')).toBe('Caldera Vaillant de condensacion')
  })

  it('no destroza medidas ni códigos', () => {
    expect(matchCatalogCase('MEDIDAS 570X1370 MM')).toBe('Medidas 570x1370 mm')
    expect(matchCatalogCase('VALVULA CLICK-CLACK CROMADA')).toBe('Valvula click-clack cromada')
    expect(matchCatalogCase('DESMONTAJE DE RADIADOR SIN RECUPERACION')).toBe('Desmontaje de radiador sin recuperacion')
  })

  it('quita los caracteres de control que deja la hoja de cálculo', () => {
    expect(matchCatalogCase('INODORO COMPACTO ROCA THE GAP ROUND CON TA\u0008PA'))
      .toBe('Inodoro compacto Roca the gap round con tapa')
    expect(matchCatalogCase('NO ESTA INCLUIDO BOLETIN DE INSTALACION DE \n ELECTRICIDAD'))
      .toBe('No esta incluido boletin de instalacion de electricidad')
  })

  it('no se inventa nada con una celda vacía ni con un nombre sólo de números', () => {
    expect(matchCatalogCase('')).toBe('')
    expect(matchCatalogCase('   ')).toBe('')
    expect(matchCatalogCase('1234')).toBe('1234')
  })

  it('es idempotente: pasar dos veces deja el mismo nombre', () => {
    const once = matchCatalogCase('TIRAS PLETINAS PVC 50 MM')
    expect(matchCatalogCase(once)).toBe(once)
  })
})

describe('cleanImportedText', () => {
  it('junta los huecos y recorta lo que envuelve al texto', () => {
    expect(cleanImportedText('  ESPEJO   CUADRADO  ')).toBe('ESPEJO CUADRADO')
    expect(cleanImportedText('DEMOLICION\tDE\nPAVIMIENTO')).toBe('DEMOLICION DE PAVIMIENTO')
  })

  it('borra el carácter de control sin dejar hueco en su lugar', () => {
    expect(cleanImportedText('TAPA\u0008')).toBe('TAPA')
    expect(cleanImportedText('CON TA\u0008PA')).toBe('CON TAPA')
  })
})
