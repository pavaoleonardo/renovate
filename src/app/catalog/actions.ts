'use server'

import { DocumentSheet, DocumentSheets, readDocumentSheets } from '@/lib/document-rows'
import {
  DetectedLayout,
  HEADER_PATTERNS,
  LayoutOverride,
  cellText,
  columnLetter,
  detectLayout,
  normalizeUnit
} from '@/lib/import-layout'
import { CatalogPhase, ExcelPreview, ExcelPreviewMatch } from '@/types'
import { addPhaseAndServices, type ImportSummary } from '@/app/actions'
import { catalogErrorMessage } from '@/lib/catalog-errors'
import { MANUAL_PRICE_SOURCE, todayIsoDate } from '@/lib/price-basis'
import {
  ExistingService,
  ImportMatchQuestion,
  ImportedServiceInput,
  ambiguousMatches,
  importLineKey,
  itemMatchPrompt,
  matchIncomingService,
  parseItemMatches,
  type ServiceMatch
} from '@/lib/catalog-import'
import { bandSuggestedPrice, findMarketMatch, matchPhaseName, nameSimilarity } from '@/lib/catalog-match'
import { AI_RATE_LIMIT_MESSAGE, IMPORT_AI_ENDPOINT, aiRateLimitReached, askOpenAiJson, recordAiCall } from '@/lib/ai'
import { parsePriceInput } from '@/lib/price-input'
import { normalizeMarketBand } from '@/lib/market-band'
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
  /** Code column of the sheet («DEM-001»), when the document has one. */
  code: string | null
}

interface ParsedPhase {
  name: string
  services: ParsedService[]
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
      hasPrice,
      code: layout.codeCol === null ? null : cellText(row[layout.codeCol]) || null
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

  // Which column was read, when it is not the one the headers suggested. This is the
  // line that explains «my prices are not visible» in a sheet whose «Precio» column is
  // empty and whose real prices live somewhere else.
  if (layout.priceNote) warnings.push(layout.priceNote)

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

/**
 * The company's own catalogue, in the shape the matcher wants. Scoped to the company
 * on purpose: the pool an imported line matches against is its own catalogue, never
 * another tenant's.
 */
async function loadExistingServices(): Promise<{ targets: ExistingService[]; phaseNames: string[] }> {
  const supabase = createClient()
  const { data: phases } = await supabase
    .from('catalog_phases')
    .select('id, name')
    .order('order_index', { ascending: true })

  const phaseNames: string[] = []
  const phaseNameById = new Map<string, string>()
  for (const phase of (phases ?? []) as { id: string; name: string }[]) {
    phaseNameById.set(String(phase.id), String(phase.name))
    phaseNames.push(String(phase.name))
  }

  const phaseIds = Array.from(phaseNameById.keys())
  if (phaseIds.length === 0) return { targets: [], phaseNames }

  const { data } = await supabase
    .from('catalog_services')
    .select('id, code, name, unit, base_price, phase_id')
    .in('phase_id', phaseIds)

  const targets: ExistingService[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit ?? 'ud'),
    base_price: Number(row.base_price ?? 0),
    phase_id: String(row.phase_id),
    phase_name: phaseNameById.get(String(row.phase_id)) ?? null,
    code: (row.code as string) ?? null
  }))

  return { targets, phaseNames }
}

/** What the importer proposes for every line, plus the counts the review panel shows. */
interface MatchPlan {
  matches: ExcelPreviewMatch[]
  totals: {
    existingMatches: number
    similarMatches: number
    newServices: number
    estimatedPrices: number
  }
}

/**
 * What to do with every line of the document: merge it into a partida that already
 * exists, ask the user about it, or create it. Built from the same parse that feeds
 * the preview, so the counts the user approves are the counts that get applied.
 *
 * A line repeats itself in the document only once here (the commit is what merges the
 * repeats), because the review panel asks one question per line.
 */
function buildMatchPlan(parsed: ParsedDocument, existing: ExistingService[], phaseNames: string[] = []): MatchPlan {
  const matches: ExcelPreviewMatch[] = []
  const seen = new Set<string>()
  const totals = { existingMatches: 0, similarMatches: 0, newServices: 0, estimatedPrices: 0 }

  for (const phase of parsed.phases) {
    // La sección con la que esta línea se va a fusionar (si ya existe) es la que manda
    // al medir el parecido de sus partidas; la clave de la línea sigue siendo la del
    // documento, que es la que el usuario vio en el panel.
    const sectionName = matchPhaseName(phase.name, phaseNames) ?? phase.name
    for (const service of phase.services) {
      const key = importLineKey(phase.name, service.name)
      if (seen.has(key)) continue
      seen.add(key)

      const match: ServiceMatch = matchIncomingService(
        { name: service.name, code: service.code },
        existing,
        sectionName
      )
      const market = findMarketMatch({ name: service.name, code: service.code, unit: service.unit })

      if (match.status === 'similar') totals.similarMatches++
      else if (match.status === 'new') totals.newServices++
      else totals.existingMatches++

      // A price the company already has is never replaced by an estimate: only a line
      // that is created and arrives without a price gets one.
      if (!service.hasPrice && match.status === 'new' && market) totals.estimatedPrices++

      matches.push({
        key,
        name: service.name,
        unit: service.unit,
        status: match.status,
        score: Math.round(match.score * 100) / 100,
        target: match.target
          ? {
              id: match.target.id,
              name: match.target.name,
              unit: match.target.unit,
              base_price: match.target.base_price,
              phase_name: match.target.phase_name ?? null
            }
          : null,
        band: market
          ? {
              min: market.band.price_min,
              max: market.band.price_max,
              suggested: bandSuggestedPrice(market.band.price_min, market.band.price_max),
              matchedName: market.name
            }
          : null
      })
    }
  }

  return { matches, totals }
}

/**
 * The per-line answers of the review panel («merge» or «new», keyed by line). A
 * malformed payload means «no answers»: the importer then falls back to its own
 * rules, which never lose data, instead of failing the whole upload.
 */
function decisionsFrom(formData: FormData): Record<string, 'merge' | 'new'> {
  const raw = formData.get('decisions')
  if (typeof raw !== 'string' || !raw.trim()) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const decisions: Record<string, 'merge' | 'new'> = {}
    Object.keys(parsed).forEach((key) => {
      const value = parsed[key]
      if (value === 'merge' || value === 'new') decisions[key] = value
    })
    return decisions
  } catch {
    return {}
  }
}

export async function processExcelUpload(formData: FormData) {
  console.log('--- Iniciando procesamiento del documento ---')
  try {
    const document = await readDocument(formData)
    const parsed = parseDocument(document.sheets, layoutOverrideFrom(formData))

    const newPhases: Omit<CatalogPhase, 'id'>[] = parsed.phases.map(phase => ({ name: phase.name }))
    const phaseServicesMap: Record<number, ImportedServiceInput[]> = {}

    parsed.phases.forEach((phase, index) => {
      phaseServicesMap[index] = phase.services.map((service) => ({
        name: service.name,
        unit: service.unit,
        base_price: service.base_price,
        code: service.code,
        // Importing a line without a price must never overwrite a price the company
        // already has for that partida: the merge reads this flag before touching it.
        has_price: service.hasPrice
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

    // Añadir es el modo por defecto: subir un documento nunca debe borrar el catálogo
    // que la empresa se ha construido. Reemplazarlo entero es una decisión explícita.
    const mode = formData.get('mode') === 'replace' ? 'replace' : 'merge'
    // La ayuda de la IA es opcional y se paga: sólo se usa si el usuario la pide.
    const useAI = formData.get('useAI') === '1'
    // «Rellenar los precios que falten con la estimación de la banda de mercado»:
    // activado salvo que el usuario lo desmarque — y nunca cuando ha pedido importar sin
    // precios, que significa exactamente «no me pongas precios, ya los pongo yo».
    const fillMissingPrices = formData.get('fillMissing') !== '0' && !parsed.layout.ignorePrices
    // Respuestas del panel de revisión (fusionar / crear) para las líneas dudosas.
    const decisions = decisionsFrom(formData)

    if (mode === 'replace') {
      try {
        await clearCatalog()
      } catch (err) {
        console.error('Error limpiando catálogo anterior:', err)
      }
    }

    let summary: ImportSummary
    try {
      summary = await addPhaseAndServices(newPhases, phaseServicesMap, { useAI, decisions, fillMissingPrices })
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
    if (summary.servicesMergedSimilar > 0) {
      parts.push(`${summary.servicesMergedSimilar} fusionadas por parecerse a una que ya tenías`)
    }
    if (summary.servicesUpdated > 0) parts.push(`${summary.servicesUpdated} con el precio corregido por el documento`)
    if (summary.servicesSkipped > 0) parts.push(`${summary.servicesSkipped} que ya existían, con el mismo precio`)
    if (summary.servicesWithBand > 0) parts.push(`${summary.servicesWithBand} con banda de mercado`)
    if (summary.servicesEstimated > 0) {
      parts.push(`${summary.servicesEstimated} con precio estimado de la banda de mercado`)
    }
    if (summary.aiAttempted) {
      if (summary.aiUnavailable) parts.push('la IA no estaba disponible, así que se importó sin ella')
      else if (summary.aiAssisted > 0) parts.push(`${summary.aiAssisted} secciones fusionadas por IA`)
      else parts.push('la IA revisó las secciones nuevas y no encontró ninguna que fusionar')
    }

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

    // What each line becomes has to be decided against the company's own catalogue,
    // so the preview loads it too: that is what turns «N partidas» into «this one you
    // already have, this one looks like that, this one is new».
    const { targets, phaseNames } = await loadExistingServices()
    const plan = buildMatchPlan(parsed, targets, phaseNames)

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
          key: importLineKey(phase.name, service.name),
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
      matches: plan.matches,
      existingServices: targets.length,
      totals: {
        phases: parsed.phases.length,
        services,
        missingPrices: parsed.missingPrices,
        suspiciousPrices: parsed.suspiciousPrices,
        existingMatches: plan.totals.existingMatches,
        similarMatches: plan.totals.similarMatches,
        newServices: plan.totals.newServices,
        estimatedPrices: plan.totals.estimatedPrices
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

/** Propuesta de la IA para una línea dudosa, para marcarla en el panel de revisión. */
export interface ImportMatchSuggestion {
  key: string
  targetId: string
  targetName: string
}

/** Techo de dudosas que se le mandan a la IA en una llamada: la lista larga la empeora. */
const MAX_AI_QUESTIONS = 25

/**
 * Los candidatos que se le ofrecen a la IA para una línea: los más parecidos del
 * catálogo de la empresa, y nada más. La IA elige entre ellos o dice que ninguno
 * encaja, así que nunca puede inventarse una partida.
 */
function candidateServices(
  name: string,
  existing: ExistingService[],
  limit = 5
): ImportMatchQuestion['candidates'] {
  return existing
    .map((service) => ({ service, score: nameSimilarity(name, service.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ service }) => ({
      id: service.id,
      name: service.name,
      unit: service.unit,
      base_price: service.base_price
    }))
}

/**
 * Pregunta a la IA por las partidas que se parecen a algo del catálogo sin serlo del
 * todo, en UNA sola llamada y sólo cuando el usuario la pide.
 *
 * No escribe nada: devuelve propuestas que el usuario ve marcadas en el panel de
 * revisión y puede cambiar antes de confirmar. La IA nunca puede inventarse una
 * partida: su respuesta se valida contra los candidatos que se le ofrecieron.
 */
export async function suggestItemMatches(formData: FormData) {
  try {
    const document = await readDocument(formData)
    const parsed = parseDocument(document.sheets, layoutOverrideFrom(formData))
    const { targets, phaseNames } = await loadExistingServices()

    if (targets.length === 0) {
      return {
        success: true,
        suggestions: [] as ImportMatchSuggestion[],
        aiUsed: false,
        note: 'Tu catálogo está vacío: no hay nada con lo que comparar todavía.'
      }
    }

    const plan = buildMatchPlan(parsed, targets, phaseNames)
    const byKey = new Map(plan.matches.map((match) => [match.key, match]))
    const ambiguousKeys = ambiguousMatches(plan.matches).slice(0, MAX_AI_QUESTIONS)

    if (ambiguousKeys.length === 0) {
      return {
        success: true,
        suggestions: [] as ImportMatchSuggestion[],
        aiUsed: false,
        note: 'No hay ninguna partida dudosa: no hace falta la IA.'
      }
    }

    const questions: ImportMatchQuestion[] = []
    for (const key of ambiguousKeys) {
      const entry = byKey.get(key)
      if (!entry) continue
      questions.push({
        key,
        name: entry.name,
        unit: entry.unit,
        candidates: candidateServices(entry.name, targets)
      })
    }

    const supabase = createClient()
    const companyId = await getCompanyId()
    if (!companyId) return { success: false, error: 'No se encontró la empresa del usuario.' }

    if (await aiRateLimitReached(supabase, companyId, IMPORT_AI_ENDPOINT)) {
      return { success: false, error: AI_RATE_LIMIT_MESSAGE }
    }
    await recordAiCall(supabase, companyId, IMPORT_AI_ENDPOINT)

    // Temperatura baja: esto es una decisión de clasificación, no redacción.
    const answer = await askOpenAiJson<Record<string, unknown>>(itemMatchPrompt(questions), 0.1)
    const chosen = parseItemMatches(answer, questions)

    const suggestions: ImportMatchSuggestion[] = []
    chosen.forEach((targetId, key) => {
      const target = targets.find((service) => service.id === targetId)
      if (target) suggestions.push({ key, targetId: target.id, targetName: target.name })
    })

    return {
      success: true,
      suggestions,
      aiUsed: true,
      note:
        suggestions.length > 0
          ? `La IA propone fusionar ${suggestions.length} de las ${questions.length} dudosas. Revisa la propuesta: se puede cambiar antes de confirmar.`
          : `La IA ha revisado ${questions.length} partidas dudosas y no ve ninguna que sea la misma: se crearán nuevas.`
    }
  } catch (error: Error | unknown) {
    if (error instanceof Error) {
      return { success: false, error: catalogErrorMessage(error.message) }
    }
    return { success: false, error: 'Ocurrió un error desconocido al consultar la IA.' }
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

/**
 * Inline edit of one of the company's catalog services.
 *
 * `price_min` / `price_max` are the market band, and they are editable on purpose. The
 * default catalog ships a band for every partida it seeds and the importer inherits one
 * when the base catalog describes the same work, but a partida it does not describe (an
 * imported «Perfilería PVC Cortizo A-70», say) had no way to get a reference at all — and
 * a section without a single band shows no «Mercado» column. Editing a band never
 * re-stamps the price basis: the band is a reference, only `base_price` changes what the
 * row claims about its own price.
 */
export async function updateCatalogService(
  id: string,
  updates: {
    name?: string
    unit?: string
    base_price?: number
    description?: string | null
    price_min?: number | null
    price_max?: number | null
  }
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
  if (updates.price_min !== undefined || updates.price_max !== undefined) {
    // Both ends arrive together from the row editor; `null` on both is "quitar la banda".
    const band = normalizeMarketBand(updates.price_min ?? null, updates.price_max ?? null)
    if (!band.ok) return { success: false, error: band.error }
    clean.price_min = band.band.price_min
    clean.price_max = band.band.price_max
  }

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

/**
 * Deletes a section together with its partidas.
 *
 * A section is not just a heading: the importer creates one for every title it reads and the
 * «Sección» selectors offer it, so a section left with no partidas (its lines were deleted one
 * by one, or the document's title rows were wrong) would otherwise stay forever in the
 * dropdown and in the import preview with no way to get rid of it. The partidas go with it —
 * a partida whose section is gone would show up nowhere.
 */
export async function deleteCatalogPhase(phaseId: string) {
  const supabase = createClient()
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'No se encontró la empresa del usuario.' }

  // Company first: without this check the delete would work on any id a client sent.
  const { data: phase } = await supabase
    .from('catalog_phases')
    .select('id')
    .eq('id', phaseId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!phase) return { success: false, error: 'Esa sección ya no existe.' }

  // `catalog_services` carries no company_id of its own: it is scoped through its phase,
  // which is the row just verified.
  const { error: servicesError } = await supabase
    .from('catalog_services')
    .delete()
    .eq('phase_id', phaseId)
  if (servicesError) return { success: false, error: catalogErrorMessage(servicesError.message) }

  const { error } = await supabase
    .from('catalog_phases')
    .delete()
    .eq('id', phaseId)
    .eq('company_id', companyId)
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
