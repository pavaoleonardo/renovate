import { describe, expect, it } from 'vitest'
import { getStatusLabel } from '@/lib/estimate-status'

/**
 * The state badge a budget shows on the client's ficha. The auto-expire
 * rule is the one that can lie to the user: a 31-day-old «Pendiente» is printed on
 * the list as «Caducado», because the PDF promises 30 days of validity.
 */

const now = new Date('2026-10-10T12:00:00Z')

describe('getStatusLabel', () => {
  it('traduce cada estado a su etiqueta y su color', () => {
    expect(getStatusLabel({ status: 'approved' }, now)).toEqual({
      label: 'Aceptado',
      color: 'bg-green-100 text-green-800',
    })
    expect(getStatusLabel({ status: 'completed' }, now).label).toBe('Completado')
  })

  it('caduca un presupuesto pendiente o enviado de más de 30 días', () => {
    expect(getStatusLabel({ status: 'draft', created_at: '2026-09-01T12:00:00Z' }, now).label).toBe('Caducado')
    expect(getStatusLabel({ status: 'sent', created_at: '2026-09-01T12:00:00Z' }, now).label).toBe('Caducado')
  })

  it('no caduca uno reciente ni uno que el cliente ya aceptó', () => {
    expect(getStatusLabel({ status: 'draft', created_at: '2026-10-08T12:00:00Z' }, now).label).toBe('Pendiente')
    expect(getStatusLabel({ status: 'approved', created_at: '2026-01-01T12:00:00Z' }, now).label).toBe('Aceptado')
  })

  it('no caduca nada sin fecha: sin created_at no hay cuenta que hacer', () => {
    expect(getStatusLabel({ status: 'sent' }, now).label).toBe('Enviado')
  })

  it('devuelve una etiqueta de reserva para un estado que no conoce', () => {
    expect(getStatusLabel({ status: 'inventado' } as never, now).label).toBe('inventado')
  })
})
