import { describe, expect, it } from 'vitest'
import {
  FALLBACK_CODE_PREFIX,
  codePrefixForPhase,
  nextServiceCode,
  nextServiceCodes,
  phaseCodePrefix
} from '@/lib/catalog-codes'
import { DEFAULT_CATALOG } from '@/lib/default-catalog'

/**
 * Las reglas de los códigos son las que hacen que una partida importada pueda citarse
 * («la DEM-007») y que dos importaciones no se pisen la numeración.
 */
describe('prefijo de una sección', () => {
  it('reproduce los prefijos del catálogo por defecto', () => {
    expect(codePrefixForPhase('Demoliciones')).toBe('DEM')
    expect(codePrefixForPhase('Albañilería')).toBe('ALB')
    expect(codePrefixForPhase('Fontanería, Saneamiento y Calefacción')).toBe('FON')
    expect(codePrefixForPhase('Pladur, Techos y Aislamientos')).toBe('PLA')
    expect(codePrefixForPhase('Trámites y legalizaciones')).toBe('TRA')
  })

  it('se salta las palabras que no identifican nada', () => {
    expect(codePrefixForPhase('Trabajos varios de albañilería')).toBe('ALB')
    expect(codePrefixForPhase('Fase 3: Electricidad')).toBe('ELE')
  })

  it('no se queda sin prefijo aunque el nombre no ayude', () => {
    expect(codePrefixForPhase('  ')).toBe(FALLBACK_CODE_PREFIX)
  })

  it('respeta la serie que la sección ya usa, aunque la hayan renombrado', () => {
    expect(phaseCodePrefix('Derribos', ['DEM-001', 'DEM-002'])).toBe('DEM')
    expect(phaseCodePrefix('Derribos', [])).toBe('DER')
  })
})

describe('siguiente código libre', () => {
  it('continúa la numeración de la serie', () => {
    expect(nextServiceCode('DEM', ['DEM-001', 'DEM-002'])).toBe('DEM-003')
  })

  it('no se deja engañar por códigos de otras series ni por huecos', () => {
    expect(nextServiceCode('DEM', ['ALB-009', 'DEM-004', null, '', 'sin-codigo'])).toBe('DEM-005')
  })

  it('empieza en 001 y crece de uno en uno', () => {
    expect(nextServiceCode('MAN', [])).toBe('MAN-001')
    expect(nextServiceCodes('MAN', ['MAN-001'], 2)).toEqual(['MAN-002', 'MAN-003'])
  })

  it('pasa de tres dígitos sin romper el formato', () => {
    expect(nextServiceCode('DEM', ['DEM-999'])).toBe('DEM-1000')
  })
})

describe('catálogo por defecto', () => {
  it('cada sección conserva la serie de códigos que ya usa', () => {
    for (const phase of DEFAULT_CATALOG) {
      const codes = phase.services.map((service) => service.code)
      const prefix = phaseCodePrefix(phase.name, codes)
      // La serie manda: «Trámites» usa TRM, no la TRA que saldría de su nombre.
      expect(codes.every((code) => code.startsWith(`${prefix}-`)), phase.name).toBe(true)
      expect(codes).not.toContain(nextServiceCode(prefix, codes))
    }
  })
})
