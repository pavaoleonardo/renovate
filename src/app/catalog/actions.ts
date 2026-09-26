'use server'

import * as xlsx from 'xlsx'
import { CatalogService, CatalogPhase } from '@/types'
import { addPhaseAndServices } from '@/app/actions'
import { catalogErrorMessage } from '@/lib/catalog-errors'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/** Resolves the company of the authenticated user (null when not found). */
async function getCompanyId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  return (userRecord?.company_id as string) ?? null
}

export async function processExcelUpload(formData: FormData) {
  console.log('--- Iniciando procesamiento de Excel ---')
  try {
    const file = formData.get('file') as File
    if (!file) throw new Error('No se encontró el archivo')

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    let workbook;
    try {
      workbook = xlsx.read(uint8Array, { type: 'array' })
    } catch (err) {
      console.error('Error xlsx.read:', err)
      throw new Error('El archivo no tiene un formato Excel válido o está corrupto.')
    }

    if (!workbook || !workbook.SheetNames || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
      throw new Error('El archivo Excel está vacío o no tiene hojas válidas')
    }

    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    
    if (!worksheet) {
      throw new Error('No se pudo leer la primera hoja del Excel')
    }

    let rows: unknown[] = []
    try {
      const parsed = xlsx.utils.sheet_to_json(worksheet, { header: 1 })
      rows = Array.isArray(parsed) ? (parsed as unknown[]) : []
    } catch (err) {
      console.error('Error sheet_to_json:', err)
      throw new Error('Error al decodificar la estructura del Excel.')
    }

    if (rows.length === 0) {
      throw new Error('La hoja de Excel parece no tener datos (filas vacías).')
    }

    const newPhases: Omit<CatalogPhase, 'id'>[] = []
    const phaseServicesMap: Record<number, Omit<CatalogService, 'id' | 'phase_id'>[]> = {}
    
    let currentPhaseIndex = -1

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue

      const rowArr = Array.isArray(row) ? row : Object.values(row || {})
      if (!Array.isArray(rowArr) || rowArr.length === 0) continue

      const strRow = rowArr.map(cell => {
        try {
          return cell != null ? String(cell).trim() : ''
        } catch {
          return ''
        }
      })

      // Detect section header rows:
      // A section header typically has:
      //   - Col A empty (no unit like Ud., M2.)
      //   - Col B has text (the section name)
      //   - Col G empty or non-numeric (no price)
      // This works with any naming: "Fase 1:", "Demoliciones", "Electricidad", etc.
      const colA = strRow[0] || ''
      const colB = strRow[1] || ''
      const colG = strRow[6] || ''
      
      const hasUnit = colA.length > 0
      const hasName = colB.length > 0
      const hasPrice = colG.length > 0 && !isNaN(parseFloat(String(colG).replace(',', '.')))
      
      // Also explicitly detect "Fase" keyword as section for backwards compat
      const hasFaseKeyword = colB.toLowerCase().includes('fase') || colA.toLowerCase().includes('fase')
      
      const isSectionHeader = hasFaseKeyword || (!hasUnit && hasName && !hasPrice && !colB.toLowerCase().includes('total'))

      if (isSectionHeader) {
        const phaseName = colB || colA || `Sección ${currentPhaseIndex + 2}`
        
        currentPhaseIndex++
        newPhases.push({ name: phaseName })
        phaseServicesMap[currentPhaseIndex] = []
      } else {
        if (currentPhaseIndex >= 0) {
          // Real Excel structure:
          //   Col A (0) = Unit (Ud., M2., ML.)
          //   Col B (1) = Service name (PROTECCION DE ZONAS COMUNES)
          //   Col G (6) = Price/quantity number
          const name = strRow[1]  // Column B = name
          if (!name || typeof name !== 'string' || name.toLowerCase().includes('total')) continue 

          const rawUnit = strRow[0]  // Column A = unit
          const unit = typeof rawUnit === 'string' && rawUnit.trim() !== '' ? rawUnit.trim() : 'un'
          
          // Try column G (6) for the price, fall back to column C (2)
          let base_price = 0
          const priceCell = strRow[6] || strRow[2] || ''
          if (priceCell !== '') {
            const priceStr = String(priceCell).replace(/[^0-9.,-]+/g, '').replace(',', '.')
            const parsedPrice = parseFloat(priceStr)
            if (!isNaN(parsedPrice)) {
              base_price = parsedPrice
            }
          }

          if (Array.isArray(phaseServicesMap[currentPhaseIndex])) {
            phaseServicesMap[currentPhaseIndex].push({
              name,
              unit,
              base_price
            })
          }
        }
      }
    }

    if (newPhases.length === 0) {
      throw new Error('No se encontraron fases en el archivo. Asegúrate de que incluir la palabra "Fase" (ej: "Fase 1: Demolición").')
    }

    // Replace by default (wipes the company's catalog first); 'merge' appends
    const mode = (formData.get('mode') as string) === 'merge' ? 'merge' : 'replace'

    if (mode === 'replace') {
      try {
        await clearCatalog()
      } catch (err) {
        console.error('Error limpiando catálogo anterior:', err)
      }
    }

    try {
      await addPhaseAndServices(newPhases, phaseServicesMap)
    } catch (err) {
      console.error('Error addPhaseAndServices:', err)
      const msg = err instanceof Error ? err.message : 'Desconocido'
      throw new Error(`Error guardando en base de datos: ${msg}`)
    }

    // Count total services
    let totalServices = 0
    for (const key of Object.keys(phaseServicesMap)) {
      totalServices += phaseServicesMap[Number(key)]?.length || 0
    }

    return { success: true, message: `Se importaron ${newPhases.length} fases y ${totalServices} servicios correctamente.` }
  } catch (error: Error | unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Ocurrió un error desconocido al procesar el archivo.' }
  }
}

export async function clearCatalog() {
  const supabase = createClient()
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'No se encontró la empresa del usuario.' }

  // Scope explicitly by company: never rely on RLS alone for a bulk delete.
  const { data: phases } = await supabase.from('catalog_phases').select('id').eq('company_id', companyId)
  const phaseIds = (phases || []).map((p: { id: string }) => p.id)

  if (phaseIds.length > 0) {
    await supabase.from('catalog_services').delete().in('phase_id', phaseIds)
  }
  await supabase.from('catalog_phases').delete().eq('company_id', companyId)

  revalidatePath('/catalog')
  return { success: true }
}

/** Inline edit of one of the company's catalog services. */
export async function updateCatalogService(
  id: string,
  updates: { name?: string; unit?: string; base_price?: number; description?: string | null }
) {
  const supabase = createClient()

  const clean: Record<string, unknown> = {}
  if (updates.name !== undefined) clean.name = updates.name.trim()
  if (updates.unit !== undefined) clean.unit = updates.unit.trim() || 'ud'
  if (updates.base_price !== undefined) clean.base_price = updates.base_price
  if (updates.description !== undefined) clean.description = updates.description

  if (Object.keys(clean).length === 0) return { success: true }

  const { error } = await supabase.from('catalog_services').update(clean).eq('id', id)
  if (error) return { success: false, error: catalogErrorMessage(error.message) }

  revalidatePath('/catalog')
  revalidatePath('/estimates')
  return { success: true }
}

export async function deleteCatalogService(id: string) {
  const supabase = createClient()

  const { error } = await supabase.from('catalog_services').delete().eq('id', id)
  if (error) return { success: false, error: catalogErrorMessage(error.message) }

  revalidatePath('/catalog')
  revalidatePath('/estimates')
  return { success: true }
}

export async function addCatalogService(phaseId: string, service: { name: string; unit: string; base_price: number }) {
  const supabase = createClient()

  const { error } = await supabase.from('catalog_services').insert({
    phase_id: phaseId,
    name: service.name.trim() || 'Nuevo servicio',
    unit: service.unit.trim() || 'ud',
    base_price: service.base_price,
    origin: 'manual',
  })

  if (error) return { success: false, error: catalogErrorMessage(error.message) }

  revalidatePath('/catalog')
  revalidatePath('/estimates')
  return { success: true }
}

export async function createCatalogPhase(name: string) {
  const supabase = createClient()
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'No se encontró la empresa del usuario.' }

  const { count } = await supabase
    .from('catalog_phases')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const { data, error } = await supabase
    .from('catalog_phases')
    .insert({ name: name.trim() || 'Nueva fase', company_id: companyId, order_index: count ?? 0 })
    .select('id, name')
    .single()

  if (error || !data) return { success: false, error: catalogErrorMessage(error?.message) }

  revalidatePath('/catalog')
  return { success: true, phase: data as { id: string; name: string } }
}

/** Phases of the company (including empty ones), for the phase selectors. */
export async function listCatalogPhases(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('catalog_phases')
    .select('id, name, order_index')
    .order('order_index', { ascending: true })

  return (data || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
}
