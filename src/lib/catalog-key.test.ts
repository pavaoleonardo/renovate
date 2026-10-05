import { describe, expect, it } from 'vitest'
import { catalogKey } from '@/lib/catalog-key'

describe('catalogKey', () => {
  it('ignora acentos, mayúsculas y espacios de más', () => {
    expect(catalogKey('Demolición de Tabique')).toBe('demolicion de tabique')
    expect(catalogKey('DEMOLICIONES Y TRABAJOS PREVIOS')).toBe(catalogKey('Demoliciones y trabajos previos'))
  })

  it('convierte la puntuación en un solo espacio y recorta los bordes', () => {
    expect(catalogKey('  Alicatado (baño), m² ')).toBe('alicatado bano m')
    expect(catalogKey('Fontanería / saneamiento')).toBe('fontaneria saneamiento')
  })

  it('queda vacía cuando no hay nada que comparar', () => {
    // Es el caso que evita que «---» se fusione con cualquier cosa.
    expect(catalogKey('')).toBe('')
    expect(catalogKey('   ')).toBe('')
    expect(catalogKey('---')).toBe('')
  })
})
