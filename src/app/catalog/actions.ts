'use server'

import * as xlsx from 'xlsx'
import { CatalogService, CatalogPhase, ExcelPreview } from '@/types'
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

/** One service read from the sheet, before it touches the database. */
interface ParsedService {
  name: string
  unit: string
  base_price: number
  hasPrice: boolean
}

interface ParsedPhase {
  name: string
  services: ParsedService[]
}

/** Where the price and the sections really live in the sheet. */
interface DetectedLayout {
  nameCol: number
  unitCol: number
  priceCol: number
  priceHeader: string
  priceDetectedByHeader: boolean
  headerRowIndex: number | null
  /**
   * Column that groups partidas into sections ("Fase", "Capítulo", "Sección"…).
   * `null` means the sheet has no such column and sections are guessed from the
   * title rows instead.
   */
  sectionCol: number | null
  sectionHeader: string
  nameHeader: string
  unitHeader: string
}

interface ParsedSheet {
  phases: ParsedPhase[]
  layout: DetectedLayout
  missingPrices: number
  suspiciousPrices: number
  suspiciousExamples: string[]
  emptySectionNames: string[]
  warnings: string[]
}

/**
 * Turns a cell into a number. Accepts numbers and the text people actually
 * type in an Excel price column ("1.234,56 €", "18,82", "1,234.56").
 */
function parseNumberCell(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw === null || raw === undefined) return null

  let text = String(raw).trim()
  if (!text) return null

  text = text.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(text)) return null

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // The right-most separator is the decimal one (1.234,56 vs 1,234.56)
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (lastComma > -1) {
    text = text.replace(',', '.')
  }

  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

const HEADER_PATTERNS = {
  name: /descrip|concepto|partida|servicio|trabajo|detalle/i,
  unit: /^\s*u\.?d\b|^\s*unidad|^\s*medida|^\s*m2|^\s*m3|^\s*ml/i,
  price: /precio|pvp|importe|coste|tarifa|€|euro/i,
  quantity: /cantidad|^\s*cant\b|medici/i,
  // Column that groups the partidas into sections. Any of these captions is
  // enough; the word used by one particular file is not required.
  section: /fase|cap[íi]tulo|secci[óo]n|grupo|bloque|apartado/i
}

/**
 * Words people write at the START of a title row. They are only a hint: the real
 * rule is structural (a row with a description, no unit and no price is a
 * section), so a sheet that titles its blocks "DEMOLICIONES" or "1. Trabajos
 * previos" works too. "Fase" is just one more word in this list.
 *
 * "Partida" is deliberately absent: "PARTIDA ALZADA DE VARIOS" is a real, priced
 * line item and promoting it to a section would swallow its own price.
 */
const SECTION_TITLE_PATTERNS =
  /^\s*((fase|cap[íi]tulo|secci[óo]n|apartado|bloque|grupo|tajo|zona|actuaci[óo]n|conjunto)s?|unidades? de obra)\b/i

const cellText = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim())

const columnLetter = (index: number) => String.fromCharCode(65 + Math.max(index, 0))

/**
 * Maps the unit text of the sheet to the units the app works with. Anything we
 * do not recognise is kept exactly as written in the Excel.
 */
function normalizeUnit(raw: string): string {
  const text = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!text) return 'ud'
  if (/^(m2|m²|mts2|metro(s)?cuadrad)/.test(text)) return 'm2'
  if (/^(m3|m³|mts3)/.test(text)) return 'm3'
  if (/^(ml|mts?l|metro(s)?lineal)/.test(text)) return 'ml'
  if (/^kg/.test(text)) return 'kg'
  if (/^(h|hr|hs|hora(s)?)$/.test(text)) return 'h'
  if (/^(vg|varios|global|p\.?a\.?|pa)$/.test(text)) return 'vg'
  if (/^(ud|u\.?d\.?|un|unidad(es)?)$/.test(text)) return 'ud'
  return raw.trim()
}

/**
 * Reads the first sheet of the uploaded file as rectangular rows.
 *
 * `defval` is not a detail: without it `sheet_to_json` returns ragged rows (in a
 * real price list 1795 of 1903 rows were shorter than the header), so a missing
 * cell shifts the reading to a different column and a quantity column can be
 * read as the price without any error.
 */
async function readFirstSheet(formData: FormData): Promise<unknown[][]> {
  const file = formData.get('file') as File
  if (!file) throw new Error('No se encontró el archivo')

  const arrayBuffer = await file.arrayBuffer()

  let workbook
  try {
    workbook = xlsx.read(new Uint8Array(arrayBuffer), { type: 'array' })
  } catch (err) {
    console.error('Error xlsx.read:', err)
    throw new Error('El archivo no tiene un formato Excel válido o está corrupto.')
  }

  if (!workbook || !workbook.SheetNames || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error('El archivo Excel está vacío o no tiene hojas válidas')
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!worksheet) {
    throw new Error('No se pudo leer la primera hoja del Excel')
  }

  let rows: unknown[][] = []
  try {
    const parsed = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false })
    rows = Array.isArray(parsed) ? (parsed as unknown[][]) : []
  } catch (err) {
    console.error('Error sheet_to_json:', err)
    throw new Error('Error al decodificar la estructura del Excel.')
  }

  if (rows.length === 0) {
    throw new Error('La hoja de Excel parece no tener datos (filas vacías).')
  }

  return rows
}

/**
 * Works out which column holds the price BEFORE reading a single row.
 *
 * The previous version read the price from a hardcoded column (7th, falling back
 * to the 3rd), so a sheet whose price lives elsewhere was imported silently
 * wrong. Now the column comes from the header row ("Precio", "PVP", "Importe"
 * …), a header that says "Cantidad"/"Medición" is never used as a price, and
 * when there is no usable header we take the column that is numeric the most
 * often instead of guessing row by row.
 */
function detectLayout(rows: unknown[][]): DetectedLayout {
  const width = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)

  const numericDensity = (col: number) => {
    let filled = 0
    let numeric = 0
    for (const row of rows) {
      const cell = row[col]
      if (cell === '' || cell === null || cell === undefined) continue
      filled++
      if (parseNumberCell(cell) !== null) numeric++
    }
    return filled === 0 ? -1 : numeric / filled
  }

  let headerRowIndex: number | null = null
  let nameCol = -1
  let unitCol = -1
  let sectionCol = -1
  const priceCandidates = new Set<number>()
  const quantityCols = new Set<number>()

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] || []).map(cellText)
    const headerHits = cells.filter(cell => cell && (
      HEADER_PATTERNS.name.test(cell) ||
      HEADER_PATTERNS.unit.test(cell) ||
      HEADER_PATTERNS.price.test(cell) ||
      HEADER_PATTERNS.section.test(cell) ||
      HEADER_PATTERNS.quantity.test(cell)
    ))
    if (headerHits.length < 2) continue

    headerRowIndex = i
    cells.forEach((cell, col) => {
      if (!cell) return
      if (nameCol === -1 && HEADER_PATTERNS.name.test(cell)) nameCol = col
      if (unitCol === -1 && HEADER_PATTERNS.unit.test(cell)) unitCol = col
      if (sectionCol === -1 && HEADER_PATTERNS.section.test(cell)) sectionCol = col
      if (HEADER_PATTERNS.quantity.test(cell)) quantityCols.add(col)
      if (HEADER_PATTERNS.price.test(cell) && !HEADER_PATTERNS.quantity.test(cell)) priceCandidates.add(col)
    })
    break
  }

  // Does that column really group rows? A caption "Fase" with no value under it
  // is just a stray label, and it can never be the column we already read as the
  // description (e.g. "Descripción de la fase").
  const sectionValues = new Set<string>()
  if (sectionCol !== -1) {
    for (let i = (headerRowIndex ?? -1) + 1; i < rows.length; i++) {
      const value = cellText((rows[i] || [])[sectionCol])
      if (value) sectionValues.add(value.toLowerCase())
    }
  }

  // A sheet may have both "Precio" and "Precio final" and only one filled: keep
  // the candidate that actually holds numbers.
  let priceCol = -1
  let bestDensity = 0
  for (const col of Array.from(priceCandidates)) {
    const density = numericDensity(col)
    if (density > bestDensity) {
      priceCol = col
      bestDensity = density
    }
  }
  let priceDetectedByHeader = priceCol !== -1

  if (priceCol === -1 || numericDensity(priceCol) <= 0) {
    priceDetectedByHeader = false
    let fallbackCol = -1
    let fallbackDensity = 0
    for (let col = 2; col < Math.max(width, 3); col++) {
      if (col === nameCol || col === unitCol || col === sectionCol) continue
      const density = numericDensity(col)
      if (density > fallbackDensity) {
        fallbackCol = col
        fallbackDensity = density
      }
    }
    priceCol = fallbackCol
  }

  if (priceCol === -1) {
    throw new Error('No se encontró ninguna columna con precios en el Excel: añade una columna «Precio» a la hoja y vuelve a intentarlo.')
  }

  // Files without headers keep the historical layout: A = unit, B = description
  // (never landing on the column we are already reading as unit or price).
  if (nameCol === -1) {
    const preferred = priceCol === 1 ? 2 : 1
    nameCol =
      [preferred, 2, 1, 0, 3].find(col => col !== unitCol && col !== priceCol && col !== sectionCol) ?? preferred
  }
  if (unitCol === -1) {
    const preferred = priceCol === 0 ? 1 : 0
    unitCol = [preferred, 0, 1, 2].find(col => col !== nameCol && col !== priceCol && col !== sectionCol) ?? preferred
  }

  // Only now are all four columns final, so this is where the section column can
  // be validated: it needs values and its own cell in the header.
  if (sectionValues.size === 0 || sectionCol === nameCol || sectionCol === unitCol || sectionCol === priceCol) {
    sectionCol = -1
  }

  const headerCells = headerRowIndex === null ? [] : (rows[headerRowIndex] || []).map(cellText)

  return {
    nameCol,
    unitCol,
    priceCol,
    priceHeader: headerCells[priceCol] || '',
    priceDetectedByHeader,
    headerRowIndex,
    sectionCol: sectionCol === -1 ? null : sectionCol,
    sectionHeader: sectionCol === -1 ? '' : (headerCells[sectionCol] || ''),
    nameHeader: headerCells[nameCol] || '',
    unitHeader: headerCells[unitCol] || ''
  }
}

/**
 * Reads the whole sheet into phases → services without touching the database.
 * Shared by the preview shown on /catalog and by the real import, so what the
 * user approves is exactly what gets stored.
 */
function parseCatalogSheet(rows: unknown[][]): ParsedSheet {
  const layout = detectLayout(rows)
  const warnings: string[] = []
  const suspiciousExamples: string[] = []
  const emptySectionNames: string[] = []
  const mergedSectionNames: string[] = []
  const phases: ParsedPhase[] = []
  const sectionIndexByName = new Map<string, number>()
  let missingPrices = 0
  let suspiciousPrices = 0
  let currentPhase = -1
  let currentGroup = ''
  let lastOpenedSection = -1

  /**
   * Sections are unique by name: a title that shows up again (or a group column
   * that returns to a previous value) adds its partidas to the same section
   * instead of creating a duplicated one.
   */
  const openSection = (name: string) => {
    const key = name.toLowerCase()
    const existing = sectionIndexByName.get(key)
    if (existing === undefined) {
      sectionIndexByName.set(key, phases.length)
      phases.push({ name, services: [] })
    } else if (
      existing !== lastOpenedSection &&
      phases[existing].services.length > 0 &&
      !mergedSectionNames.includes(name)
    ) {
      mergedSectionNames.push(name)
    }
    currentPhase = sectionIndexByName.get(key) ?? phases.length - 1
    lastOpenedSection = currentPhase
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const unitCell = cellText(row[layout.unitCol])
    const nameCell = cellText(row[layout.nameCol])
    const price = parseNumberCell(row[layout.priceCol])

    if (!nameCell && !unitCell) continue
    if (nameCell.toLowerCase().includes('total') || unitCell.toLowerCase().includes('total')) continue

    // Never import the header row itself as if it were a partida (and the same
    // for a repeated header if the sheet has several blocks).
    const looksLikeHeader =
      i === layout.headerRowIndex ||
      (HEADER_PATTERNS.name.test(nameCell) &&
        HEADER_PATTERNS.unit.test(unitCell) &&
        HEADER_PATTERNS.price.test(cellText(row[layout.priceCol])))
    if (looksLikeHeader) continue

    if (layout.sectionCol !== null) {
      // The sheet has a column that says which section each partida belongs to:
      // that column is authoritative and the titles inside the rows are not used.
      const group = cellText(row[layout.sectionCol])
      if (group && group.toLowerCase() !== currentGroup) {
        currentGroup = group.toLowerCase()
        openSection(group)
      }
      // Merged cells only carry the value on the first row, so an empty cell here
      // means "same section as the row above".
    } else {
      // No section column: a title is a row with a description, no number in the
      // price column and either no unit at all or a heading word («Fase 1»,
      // «Capítulo 2», «Bloque A»…). Any title works, the word is only a hint.
      const headingText = SECTION_TITLE_PATTERNS.test(nameCell)
        ? nameCell
        : (SECTION_TITLE_PATTERNS.test(unitCell) ? unitCell : '')
      const isSectionHeader = price === null && ((nameCell !== '' && unitCell === '') || headingText !== '')

      if (isSectionHeader) {
        openSection(headingText || nameCell)
        continue
      }
    }

    if (!nameCell) continue

    const hasPrice = price !== null && price !== 0
    if (!hasPrice) missingPrices++

    // Prices of 1,00–5,00 € on whole units are the classic symptom of reading a
    // measurements column ("7 ventanas", "1 inodoro") as if it were the price.
    if (price !== null && price > 0 && price <= 5 && Number.isInteger(price)) {
      suspiciousPrices++
      if (suspiciousExamples.length < 3) suspiciousExamples.push(`«${nameCell}» = ${price.toFixed(2)} €`)
    }

    if (currentPhase === -1) {
      phases.push({ name: 'Importado de Excel', services: [] })
      currentPhase = 0
    }

    phases[currentPhase].services.push({
      name: nameCell,
      unit: normalizeUnit(unitCell),
      base_price: price ?? 0,
      hasPrice
    })
  }

  const usedPhases = phases.filter(phase => {
    if (phase.services.length === 0) {
      emptySectionNames.push(phase.name)
      return false
    }
    return true
  })

  if (usedPhases.length === 0) {
    throw new Error('No se encontró ninguna partida en el Excel: revisa que las descripciones estén en la columna correcta.')
  }

  const priceColumnLabel = `${columnLetter(layout.priceCol)}${layout.priceDetectedByHeader && layout.priceHeader ? `, «${layout.priceHeader}»` : ''}`

  if (missingPrices > 0) {
    warnings.push(
      `${missingPrices} partida${missingPrices === 1 ? '' : 's'} sin precio en la columna ${priceColumnLabel}: ` +
      'se importarán con 0,00 € y tendrás que ponerles el precio a mano.'
    )
  }

  if (suspiciousPrices >= 3) {
    warnings.push(
      `${suspiciousPrices} partidas con un precio de 5,00 € o menos (p. ej. ${suspiciousExamples.join(', ')}). ` +
      'Si tu Excel tiene una columna de mediciones y otra de precios, comprueba que han entrado los precios y no las cantidades ' +
      `(columna leída: ${columnLetter(layout.priceCol)}).`
    )
  }

  if (mergedSectionNames.length > 0) {
    warnings.push(
      `${mergedSectionNames.length} secci${mergedSectionNames.length === 1 ? 'ón' : 'ones'} aparecía${mergedSectionNames.length === 1 ? '' : 'n'} ` +
      `en varios bloques del Excel (p. ej. «${mergedSectionNames[0].slice(0, 40)}»): se ha${mergedSectionNames.length === 1 ? '' : 'n'} ` +
      'unido en una sola para no duplicarlas.'
    )
  }

  if (emptySectionNames.length > 0) {
    warnings.push(
      `${emptySectionNames.length} línea${emptySectionNames.length === 1 ? '' : 's'} con texto pero sin partidas ` +
      `(p. ej. «${emptySectionNames[0].slice(0, 40)}»): puede ser una descripción partida en dos filas. Se ignorarán.`
    )
  }

  return {
    phases: usedPhases,
    layout,
    missingPrices,
    suspiciousPrices,
    suspiciousExamples,
    emptySectionNames,
    warnings
  }
}

export async function processExcelUpload(formData: FormData) {
  console.log('--- Iniciando procesamiento de Excel ---')
  try {
    const rows = await readFirstSheet(formData)
    const parsed = parseCatalogSheet(rows)

    const newPhases: Omit<CatalogPhase, 'id'>[] = parsed.phases.map(phase => ({ name: phase.name }))
    const phaseServicesMap: Record<number, Omit<CatalogService, 'id' | 'phase_id'>[]> = {}

    parsed.phases.forEach((phase, index) => {
      phaseServicesMap[index] = phase.services.map(service => ({
        name: service.name,
        unit: service.unit,
        base_price: service.base_price
      }))
    })

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

    return { success: true, message: `Se importaron ${newPhases.length} secciones y ${totalServices} partidas correctamente.` }
  } catch (error: Error | unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Ocurrió un error desconocido al procesar el archivo.' }
  }
}

/**
 * Analyses the uploaded file WITHOUT saving anything, so /catalog can show which
 * column was read as the price and what each line will become. This is what
 * catches a mislabelled sheet (quantities in a column headed "Precio") before it
 * replaces the catalog.
 */
export async function previewExcelUpload(formData: FormData) {
  try {
    const rows = await readFirstSheet(formData)
    const parsed = parseCatalogSheet(rows)

    const services = parsed.phases.reduce((total, phase) => total + phase.services.length, 0)

    const preview: ExcelPreview = {
      phases: parsed.phases.map(phase => ({
        name: phase.name,
        services: phase.services.map(service => ({
          name: service.name,
          unit: service.unit,
          base_price: service.base_price,
          hasPrice: service.hasPrice
        }))
      })),
      priceColumn: {
        letter: columnLetter(parsed.layout.priceCol),
        header: parsed.layout.priceHeader,
        detectedByHeader: parsed.layout.priceDetectedByHeader
      },
      sectionColumn:
        parsed.layout.sectionCol === null
          ? null
          : {
              letter: columnLetter(parsed.layout.sectionCol),
              header: parsed.layout.sectionHeader
            },
      nameColumn: { letter: columnLetter(parsed.layout.nameCol), header: parsed.layout.nameHeader },
      unitColumn: { letter: columnLetter(parsed.layout.unitCol), header: parsed.layout.unitHeader },
      headerRow: parsed.layout.headerRowIndex === null ? null : parsed.layout.headerRowIndex + 1,
      totals: {
        phases: parsed.phases.length,
        services,
        missingPrices: parsed.missingPrices,
        suspiciousPrices: parsed.suspiciousPrices
      },
      warnings: parsed.warnings
    }

    return { success: true, preview }
  } catch (error: Error | unknown) {
    if (error instanceof Error) {
      return { success: false, error: catalogErrorMessage(error.message) }
    }
    return { success: false, error: 'Ocurrió un error desconocido al analizar el archivo.' }
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
    .insert({ name: name.trim() || 'Nueva sección', company_id: companyId, order_index: count ?? 0 })
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
