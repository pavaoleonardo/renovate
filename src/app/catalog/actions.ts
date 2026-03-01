'use server'

import * as xlsx from 'xlsx'
import { CatalogService, CatalogPhase } from '@/types'

// For MVP mock updates:
import { addPhaseAndServices } from '@/app/actions'

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

    // Clear old catalog data before importing new
    try {
      await clearCatalog()
    } catch (err) {
      console.error('Error limpiando catálogo anterior:', err)
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
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = createClient()
  
  // Delete services first (foreign key), then phases
  await supabase.from('catalog_services').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('catalog_phases').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  
  return { success: true }
}
