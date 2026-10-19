import { describe, expect, it } from 'vitest'
import { companyInitials, usableLogoUrl } from '@/lib/company-brand'

describe('companyInitials', () => {
  it('toma la inicial de las dos primeras palabras', () => {
    expect(companyInitials('Reformas Líder S.L.')).toBe('RL')
    expect(companyInitials('Constance Reformas')).toBe('CR')
  })

  it('ignora la forma jurídica y las palabras vacías', () => {
    expect(companyInitials('Áridos y Hormigones S.A.')).toBe('ÁH')
    expect(companyInitials('Construcciones del Sur, S.L.U.')).toBe('CS')
  })

  it('con una sola palabra usa sus dos primeras letras', () => {
    expect(companyInitials('Constance')).toBe('CO')
    expect(companyInitials('  Ónix  ')).toBe('ÓN')
  })

  it('no inventa iniciales cuando no hay nombre utilizable', () => {
    expect(companyInitials('')).toBe('')
    expect(companyInitials('   ')).toBe('')
    expect(companyInitials(null)).toBe('')
    expect(companyInitials(undefined)).toBe('')
    // "S.L." sin nombre delante: no queda ni una inicial que enseñar.
    expect(companyInitials('S.L.')).toBe('')
  })
})

describe('usableLogoUrl', () => {
  it('acepta una URL http(s), que es lo que guarda el bucket', () => {
    const stored = 'https://psdhtpswqdeirumxjuai.supabase.co/storage/v1/object/public/logos/abc/logo.png'
    expect(usableLogoUrl(stored)).toBe(stored)
    expect(usableLogoUrl('  http://example.com/logo.png  ')).toBe('http://example.com/logo.png')
  })

  it('descarta lo que el navegador no debe cargar', () => {
    expect(usableLogoUrl(null)).toBeNull()
    expect(usableLogoUrl('')).toBeNull()
    expect(usableLogoUrl('   ')).toBeNull()
    expect(usableLogoUrl('javascript:alert(1)')).toBeNull()
    expect(usableLogoUrl('/logo.png')).toBeNull()
    expect(usableLogoUrl('data:image/png;base64,AAAA')).toBeNull()
  })
})
