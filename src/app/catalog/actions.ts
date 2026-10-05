'use server'

import { DocumentSheet, DocumentSheets, readDocumentSheets } from '@/lib/document-rows'
import { CatalogService, CatalogPhase, ExcelPreview } from '@/types'
import { addPhaseAndServices, type ImportSummary } from '@/app/actions'
import { catalogErrorMessage } from '@/lib/catalog-errors'
import { MANUAL_PRICE_SOURCE, todayIsoDate } from '@/lib/price-basis'
import { parsePriceInput } from '@/lib/price-input'
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

/** One column of the document, described for the chooser in the preview. */
interface DetectedColumn {
  index: number
  letter: string
  header: string
  /** First few values of the column, so the user sees what is inside it. */
  samples: string[]
  numbers: number
}

/** How the price column was decided. */
type PriceSource = 'header' | 'numbers' | 'user'

/**
 * What the user asked for in the preview: change the price column or import
 * every line without a price (a budget that only carries measurements).
 */
export interface LayoutOverride {
  priceCol?: number | null
  ignorePrices?: boolean
}

/** Where the price and the sections really live in the sheet. */
interface DetectedLayout {
  nameCol: number
  unitCol: number
  priceCol: number
  priceHeader: string
  priceDetectedByHeader: boolean
  priceSource: PriceSource
  ignorePrices: boolean
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
  columns: DetectedColumn[]
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

/** Result of reading a whole document: the sheets it took partidas from, joined. */
interface ParsedDocument {
  phases: ParsedPhase[]
  layout: DetectedLayout
  usedSheets: { name: string; phases: number; services: number }[]
  missingPrices: number
  suspiciousPrices: number
  warnings: string[]
}

const HEADER_PATTERNS = {
  name: /descrip|concepto|partida|servicio|trabajo|detalle/i,
  unit: /^\s*u\.?d\b|^\s*unidad|^\s*medida|^\s*m2|^\s*m3|^\s*ml/i,
  price: /precio|pvp|importe|coste|tarifa|€|euro/i,
  quantity: /cantidad|^\s*cant\b|medici/i,
  /**
   * Column with the total of the line. It is only used to recognise an export
   * whose real prices are missing: if «Precio final» is empty in every row while
   * the column titled «Precio» carries small numbers, those numbers are the
   * measurements, not the rates.
   */
  finalPrice: /precio\s*(final|total)|importe|total/i,
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

/**
 * A title row made only of numbers and currency symbols («152,25», «€ 3.400») is a
 * total that lost its label (or a stray measurement), never a section: it is
 * skipped instead of becoming an empty section.
 */
const NUMBER_ONLY_TITLE = /^[\s\d€$.,*+\-–—]+$/

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
 * Reads every sheet of the uploaded document that holds partidas.
 *
 * Multi-sheet workbooks are the norm in the files this app receives (a «Fases»
 * sheet with the sections and a «Servicios» sheet with the prices, for instance),
 * so the first sheet is no longer assumed to be the good one: each one is parsed
 * and the sheets without partidas are ignored.
 */
async function readDocument(formData: FormData): Promise<DocumentSheets> {
  const file = formData.get('file') as File | null
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('No se encontró el archivo')
  }
  return readDocumentSheets(file)
}

/** Reads the override the user picked in the preview (price column, no prices). */
function layoutOverrideFrom(formData: FormData): LayoutOverride {
  const rawPriceCol = formData.get('priceCol')
  const override: LayoutOverride = {}

  if (rawPriceCol !== null && String(rawPriceCol).trim() !== '') {
    const parsed = Number(rawPriceCol)
    if (Number.isInteger(parsed) && parsed >= 0) override.priceCol = parsed
  }

  const rawNoPrices = formData.get('noPrices')
  if (rawNoPrices !== null && String(rawNoPrices) === '1') override.ignorePrices = true

  return override
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
function detectLayout(rows: unknown[][], override: LayoutOverride = {}): DetectedLayout {
  const width = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)

  const numericDensity = (col: number) => {
    let filled = 0
    let numeric = 0
    for (const row of rows) {
      const cell = row[col]
      if (cell === '' || cell === null || cell === undefined) continue
      filled++
      if (parsePriceInput(cell) !== null) numeric++
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
  const headerCells: string[] = headerRowIndex === null ? [] : (rows[headerRowIndex] || []).map(cellText)
  const isQuantityHeader = (col: number) => HEADER_PATTERNS.quantity.test(headerCells[col] || '')

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
      // A column headed «Cantidad»/«Medición» is never the price, not even when it
      // is the only one with numbers: those numbers are the measurements.
      if (isQuantityHeader(col)) continue
      const density = numericDensity(col)
      if (density > fallbackDensity) {
        fallbackCol = col
        fallbackDensity = density
      }
    }

    if (fallbackCol === -1 && priceCandidates.size > 0) {
      // The document has a column named «Precio» but it is empty in every row: it
      // is a budget still to be priced. Keep that column (the import will warn and
      // store the partidas without a price) instead of refusing the document.
      priceCol = Array.from(priceCandidates)[0]
      priceDetectedByHeader = true
    } else {
      priceCol = fallbackCol
    }
  }

  let priceSource: PriceSource = priceDetectedByHeader ? 'header' : 'numbers'

  // What the user chose in the preview wins over anything we guessed.
  if (typeof override.priceCol === 'number' && override.priceCol >= 0 && override.priceCol < Math.max(width, 1)) {
    priceCol = override.priceCol
    priceSource = 'user'
    priceDetectedByHeader = false
  }

  if (priceCol === -1) {
    throw new Error('No se encontró ninguna columna con precios en el documento: elige la columna del precio a mano o añade una columna «Precio» y vuelve a intentarlo.')
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
    const unitCandidates = [preferred, 0, 1, 2].filter(
      col => col !== nameCol && col !== priceCol && col !== sectionCol && !isQuantityHeader(col)
    )
    // No unit column at all is better than a column of measurements: without a unit
    // the partidas fall back to «ud», with quantities read as units they do not.
    unitCol = unitCandidates[0] ?? -1
  }

  // Only now are all four columns final, so this is where the section column can
  // be validated: it needs values and its own cell in the header.
  if (sectionValues.size === 0 || sectionCol === nameCol || sectionCol === unitCol || sectionCol === priceCol) {
    sectionCol = -1
  }

  // Every column is described for the chooser of the preview, so the user can see
  // what is inside each one («Precio»: 12,35 · 45,90 · 780,50) before confirming.
  const columns: DetectedColumn[] = []
  const firstDataRow = (headerRowIndex ?? -1) + 1
  for (let col = 0; col < width; col++) {
    const samples: string[] = []
    let numbers = 0
    for (let i = firstDataRow; i < rows.length; i++) {
      const value = cellText((rows[i] || [])[col])
      if (parsePriceInput(value) !== null) numbers++
      if (value && samples.length < 3) samples.push(value.length > 24 ? `${value.slice(0, 23)}…` : value)
    }
    columns.push({ index: col, letter: columnLetter(col), header: headerCells[col] || '', samples, numbers })
  }

  return {
    nameCol,
    unitCol,
    priceCol,
    priceHeader: headerCells[priceCol] || '',
    priceDetectedByHeader,
    priceSource,
    ignorePrices: override.ignorePrices === true,
    headerRowIndex,
    sectionCol: sectionCol === -1 ? null : sectionCol,
    sectionHeader: sectionCol === -1 ? '' : (headerCells[sectionCol] || ''),
    nameHeader: headerCells[nameCol] || '',
    unitHeader: headerCells[unitCol] || '',
    columns
  }
}

/**
 * Reads the whole sheet into phases → services without touching the database.
 * Shared by the preview shown on /catalog and by the real import, so what the
 * user approves is exactly what gets stored.
 */
function parseCatalogSheet(rows: unknown[][], override: LayoutOverride = {}): ParsedSheet {
  const layout = detectLayout(rows, override)
  const warnings: string[] = []
  const suspiciousExamples: string[] = []
  const emptySectionNames: string[] = []
  const mergedSectionNames: string[] = []
  const phases: ParsedPhase[] = []
  const sectionIndexByName = new Map<string, number>()
  let missingPrices = 0
  let pricedServices = 0
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
    const price = parsePriceInput(row[layout.priceCol])

    if (!nameCell && !unitCell) continue
    if (nameCell.toLowerCase().includes('total') || unitCell.toLowerCase().includes('total')) continue

    // Never import the header row itself as if it were a partida (and the same for
    // a header repeated below: the second page of a PDF, a new block in the sheet).
    // Two or more cells with heading words make a header row; a cell holding a value
    // («€ 18,82») is not a heading, and «Ud.» alone is not counted because it is also
    // written next to a real title («Fase 1 … Ud»).
    const looksLikeHeader =
      i === layout.headerRowIndex ||
      (row || []).reduce((hits: number, cell) => {
        const text = cellText(cell)
        if (!text || text.length > 30 || parsePriceInput(cell) !== null) return hits
        const heading =
          HEADER_PATTERNS.name.test(text) ||
          HEADER_PATTERNS.price.test(text) ||
          HEADER_PATTERNS.quantity.test(text) ||
          HEADER_PATTERNS.section.test(text)
        return heading ? hits + 1 : hits
      }, 0) >= 2
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
        const title = (headingText || nameCell).trim()
        if (!NUMBER_ONLY_TITLE.test(title)) openSection(title)
        continue
      }
    }

    if (!nameCell) continue

    const hasPrice = !layout.ignorePrices && price !== null && price !== 0
    if (hasPrice) pricedServices++
    else missingPrices++

    // Prices of 1,00–5,00 € on whole units are the classic symptom of reading a
    // measurements column ("7 ventanas", "1 inodoro") as if it were the price.
    if (hasPrice && price !== null && price > 0 && price <= 5 && Number.isInteger(price)) {
      suspiciousPrices++
      if (suspiciousExamples.length < 3) suspiciousExamples.push(`«${nameCell}» = ${price.toFixed(2)} €`)
    }

    if (currentPhase === -1) {
      phases.push({ name: 'Sin sección', services: [] })
      currentPhase = 0
    }

    phases[currentPhase].services.push({
      name: nameCell,
      unit: normalizeUnit(unitCell),
      base_price: hasPrice && price !== null ? price : 0,
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
    throw new Error('No se encontró ninguna partida en el documento: revisa que las descripciones estén en la columna correcta.')
  }

  const priceColumnLabel = `${columnLetter(layout.priceCol)}${layout.priceDetectedByHeader && layout.priceHeader ? `, «${layout.priceHeader}»` : ''}`
  const priceColumn = layout.columns.find((column) => column.index === layout.priceCol)

  /** Column with a heading but not a single value below it. */
  const isColumnEmpty = (col: number) => {
    for (let i = layout.headerRowIndex === null ? 0 : layout.headerRowIndex + 1; i < rows.length; i++) {
      if (cellText((rows[i] || [])[col]) !== '') return false
    }
    return true
  }

  const emptyQuantityColumn = layout.columns.find(
    (column) => column.header !== '' && HEADER_PATTERNS.quantity.test(column.header) && isColumnEmpty(column.index)
  )
  const emptyFinalPriceColumn = layout.columns.find(
    (column) =>
      column.index !== layout.priceCol &&
      column.header !== '' &&
      HEADER_PATTERNS.finalPrice.test(column.header) &&
      isColumnEmpty(column.index)
  )

  if (layout.ignorePrices) {
    warnings.push(
      `Has pedido importar sin precios: las ${pricedServices + missingPrices} partidas se guardarán con 0,00 € para que pongas tus tarifas en el catálogo.`
    )
  } else if (pricedServices === 0) {
    warnings.push(
      layout.priceSource === 'user'
        ? `La columna ${columnLetter(layout.priceCol)} que has elegido no tiene números: las ${missingPrices} partidas se guardarán sin precio. Elige otra columna o marca «importar sin precio».`
        : `El documento no trae precios (la columna ${priceColumnLabel} está vacía o a 0 en todas las líneas): las ${missingPrices} partidas se importarán sin precio, para que pongas tus tarifas en el catálogo.`
    )
  } else if (missingPrices > 0) {
    warnings.push(
      `${missingPrices} partida${missingPrices === 1 ? '' : 's'} sin precio en la columna ${priceColumnLabel}: ` +
      'se importarán con 0,00 € y tendrás que ponerles el precio a mano.'
    )
  }

  // Budgets exported from a program that measures and rates in two steps arrive
  // like this: «Cantidad» and «Precio final» empty on every line while the column
  // titled «Precio» holds small numbers (the measurements). Nothing is changed
  // behind the user's back: the preview warns and offers the switch.
  const suspiciousRatio = suspiciousPrices / Math.max(pricedServices, 1)
  if (emptyQuantityColumn && emptyFinalPriceColumn && pricedServices > 0 && suspiciousRatio >= 0.4) {
    // Only figures: the chosen column may hold words ("Ud.", "M2.") and quoting
    // those next to "trae N números" would read like a contradiction.
    const numericSamples = (priceColumn?.samples || []).filter((sample) => parsePriceInput(sample) !== null)
    warnings.push(
      `Ojo: la columna ${priceColumnLabel} trae ${pricedServices} números${
        numericSamples.length > 0 ? ` (p. ej. ${numericSamples.join(' · ')})` : ''
      }, pero ` +
      `«${emptyQuantityColumn.header}» (col. ${emptyQuantityColumn.letter}) y «${emptyFinalPriceColumn.header}» (col. ${emptyFinalPriceColumn.letter}) ` +
      'están vacías en todas las filas. Parece un presupuesto de mediciones sin tarifas: si es el caso, marca «importar sin precio» o elige otra columna.'
    )
  }

  if (suspiciousPrices >= 3) {
    warnings.push(
      `${suspiciousPrices} partidas con un precio de 5,00 € o menos (p. ej. ${suspiciousExamples.join(', ')}). ` +
      'Si tu documento tiene una columna de mediciones y otra de precios, comprueba que han entrado los precios y no las cantidades ' +
      `(columna leída: ${columnLetter(layout.priceCol)}).`
    )
  }

  if (mergedSectionNames.length > 0) {
    warnings.push(
      `${mergedSectionNames.length} secci${mergedSectionNames.length === 1 ? 'ón' : 'ones'} aparecía${mergedSectionNames.length === 1 ? '' : 'n'} ` +
      `en varios bloques del documento (p. ej. «${mergedSectionNames[0].slice(0, 40)}»): se ha${mergedSectionNames.length === 1 ? '' : 'n'} ` +
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

/**
 * Parses every sheet of the document that holds partidas and joins the result, so
 * a workbook split in several sheets («Fases» + «Servicios») is read whole instead
 * of taking the first sheet for granted.
 */
function parseDocument(sheets: DocumentSheet[], override: LayoutOverride = {}): ParsedDocument {
  const usedSheets: ParsedDocument['usedSheets'] = []
  const mergedPhases = new Map<string, ParsedPhase>()
  const warnings: string[] = []
  const failures: { sheet: string; message: string }[] = []
  let layout: DetectedLayout | null = null
  let missingPrices = 0
  let suspiciousPrices = 0

  for (const sheet of sheets) {
    let parsed: ParsedSheet
    try {
      parsed = parseCatalogSheet(sheet.rows, override)
    } catch (err) {
      failures.push({ sheet: sheet.name, message: err instanceof Error ? err.message : 'no se pudo leer la hoja' })
      continue
    }

    const services = parsed.phases.reduce((total, phase) => total + phase.services.length, 0)
    usedSheets.push({ name: sheet.name, phases: parsed.phases.length, services })
    missingPrices += parsed.missingPrices
    suspiciousPrices += parsed.suspiciousPrices
    if (!layout) layout = parsed.layout

    for (const warning of parsed.warnings) {
      // With a single sheet a warning is about the document; with several it has to
      // say which sheet it comes from.
      warnings.push(sheets.length > 1 ? `Hoja «${sheet.name}»: ${warning}` : warning)
    }

    for (const phase of parsed.phases) {
      const key = phase.name.trim().toLowerCase()
      const existing = mergedPhases.get(key)
      if (existing) existing.services.push(...phase.services)
      else mergedPhases.set(key, { name: phase.name, services: [...phase.services] })
    }
  }

  if (!layout) {
    const noPartidas = failures.find((failure) => failure.message.includes('partida'))
    throw new Error(
      (noPartidas ?? failures[0])?.message ||
        'No se encontró ninguna partida en el documento: revisa que las descripciones estén en la columna correcta.'
    )
  }

  return {
    phases: Array.from(mergedPhases.values()),
    layout,
    usedSheets,
    missingPrices,
    suspiciousPrices,
    warnings
  }
}

export async function processExcelUpload(formData: FormData) {
  console.log('--- Iniciando procesamiento del documento ---')
  try {
    const document = await readDocument(formData)
    const parsed = parseDocument(document.sheets, layoutOverrideFrom(formData))

    const newPhases: Omit<CatalogPhase, 'id'>[] = parsed.phases.map(phase => ({ name: phase.name }))
    const phaseServicesMap: Record<number, Omit<CatalogService, 'id' | 'phase_id'>[]> = {}

    parsed.phases.forEach((phase, index) => {
      phaseServicesMap[index] = phase.services.map(service => ({
        name: service.name,
        unit: service.unit,
        base_price: service.base_price
      }))
    })

    const totalServices = parsed.phases.reduce((total, phase) => total + phase.services.length, 0)

    // Never wipe a catalog to store nothing: a document in which every row was read as a
    // section title (the units in the name column, the descriptions somewhere else)
    // parses into sections with zero partidas. That used to be saved as a success, which
    // left the catalog full of empty sections and lost the partidas it had. Refused here,
    // before `clearCatalog`, so nothing is deleted.
    if (newPhases.length === 0 || totalServices === 0) {
      throw new Error(
        `No se encontró ninguna partida en el documento: se leyeron ${newPhases.length} ` +
          'secciones y 0 líneas, así que no se ha tocado tu catálogo. Comprueba que las ' +
          'descripciones están en una columna (no la de unidades) y que la fila de ' +
          'cabeceras está completa.'
      )
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

    let summary: ImportSummary
    try {
      summary = await addPhaseAndServices(newPhases, phaseServicesMap)
    } catch (err) {
      console.error('Error addPhaseAndServices:', err)
      const msg = err instanceof Error ? err.message : 'Desconocido'
      throw new Error(`Error guardando en base de datos: ${msg}`)
    }

    // Se cuenta lo que de verdad ha cambiado: importar en modo «añadir» sobre un
    // catálogo que ya tenía esas secciones no crea nada, y hay que decirlo.
    const parts = [`${summary.servicesCreated} partidas nuevas`]
    if (summary.phasesReused > 0) parts.push(`fusionadas en ${summary.phasesReused} secciones que ya tenías`)
    if (summary.phasesCreated > 0) parts.push(`${summary.phasesCreated} secciones nuevas`)
    if (summary.servicesSkipped > 0) parts.push(`${summary.servicesSkipped} que ya existían, sin duplicar`)
    if (summary.servicesWithBand > 0) parts.push(`${summary.servicesWithBand} con banda de mercado`)

    return { success: true, message: `Importación completada: ${parts.join(' · ')}.` }
  } catch (error: Error | unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Ocurrió un error desconocido al procesar el archivo.' }
  }
}

/**
 * Analyses the uploaded document WITHOUT saving anything, so /catalog can show
 * which column was read as the price and what each line will become. This is what
 * catches a mislabelled sheet (quantities in a column headed "Precio") before it
 * replaces the catalog.
 */
export async function previewExcelUpload(formData: FormData) {
  try {
    const document = await readDocument(formData)
    const parsed = parseDocument(document.sheets, layoutOverrideFrom(formData))

    const services = parsed.phases.reduce((total, phase) => total + phase.services.length, 0)

    const preview: ExcelPreview = {
      fileName: document.fileName,
      documentKind: document.kind,
      sheets: parsed.usedSheets,
      columns: parsed.layout.columns,
      ignorePrices: parsed.layout.ignorePrices,
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
        detectedByHeader: parsed.layout.priceDetectedByHeader,
        chosenByUser: parsed.layout.priceSource === 'user'
      },
      sectionColumn:
        parsed.layout.sectionCol === null
          ? null
          : {
              letter: columnLetter(parsed.layout.sectionCol),
              header: parsed.layout.sectionHeader
            },
      nameColumn: { letter: columnLetter(parsed.layout.nameCol), header: parsed.layout.nameHeader },
      unitColumn: {
        letter: parsed.layout.unitCol < 0 ? '' : columnLetter(parsed.layout.unitCol),
        header: parsed.layout.unitHeader
      },
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
  if (updates.base_price !== undefined) {
    // Any figure is allowed on purpose — inside or outside the market band — but a
    // negative or non-finite price is a typo, never a decision.
    if (!Number.isFinite(updates.base_price) || updates.base_price < 0) {
      return { success: false, error: 'El precio tiene que ser un número igual o mayor que 0.' }
    }
    clean.base_price = updates.base_price
    // A hand-typed price becomes the company's own: re-stamp the basis and the review
    // date so the row no longer reads as the seeded market-band draft (and stops
    // flagging "Revisar precio" for a figure a human just looked at).
    clean.price_source = MANUAL_PRICE_SOURCE
    clean.price_reviewed_at = todayIsoDate()
  }
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
