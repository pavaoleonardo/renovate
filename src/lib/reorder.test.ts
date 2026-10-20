import { describe, expect, it } from 'vitest'
import { moveItem } from '@/lib/reorder'

/**
 * Las flechas del editor mueven una línea sin arrastrarla: es lo único que un dedo
 * puede hacer en una obra. Aquí se fija lo que significa «subir» en la primera
 * línea y qué pasa en los extremos, para que el botón deshabilitado y la función
 * no puedan opinar distinto.
 */
describe('moveItem', () => {
  it('mueve una línea una posición arriba o abajo', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('en los extremos no hay nada que mover: devuelve la misma lista', () => {
    const rows = ['a', 'b', 'c']
    expect(moveItem(rows, 0, -1)).toBe(rows)
    expect(moveItem(rows, 2, 3)).toBe(rows)
    expect(moveItem(rows, 1, 1)).toBe(rows)
  })

  it('devuelve una lista nueva y no toca la que recibe', () => {
    const rows = ['a', 'b', 'c']
    const moved = moveItem(rows, 0, 2)
    expect(moved).toEqual(['b', 'c', 'a'])
    expect(rows).toEqual(['a', 'b', 'c'])
  })

  it('una lista de una sola línea nunca se mueve', () => {
    const rows = ['solo']
    expect(moveItem(rows, 0, 1)).toBe(rows)
    expect(moveItem(rows, 1, 0)).toBe(rows)
  })
})
