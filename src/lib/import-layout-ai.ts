import type { DetectedLayout } from '@/lib/import-layout'
import { cellText, columnLetter } from '@/lib/import-layout'
import { parsePriceInput } from '@/lib/price-input'

/**
 * The AI's second opinion on where a sheet keeps its prices.
 *
 * The deterministic reader (`detectLayout`) is the one that decides; this module only
 * exists for the case where it read **no price at all** and the user would otherwise
 * get a catalogue full of 0,00 €. Two rules make it safe:
 *
 * 1. What leaves the server is a digest, never the sheet: three samples per column,
 *    with phones, e-mails, long numbers and long texts masked.
 * 2. The answer is a proposal. `validateLayoutAnswer` is deterministic and selfish: it
 *    checks the proposed column against the actual rows (how many lines it prices, how
 *    its numbers look) and rejects it otherwise. An answer that cannot be proven is
 *    worth less than no answer.
 *
 * Pure: no session, no network, no database — so it can be tested.
 */

/** A cell we are about to send to the model, with the identifying bits taken out. */
export function maskSample(value: unknown): string {
  const text = cellText(value)
  if (!text) return ''
  // An e-mail is never needed to tell a price column from a quantity column.
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return '(correo)'
  // Phones, NIFs and budget numbers: a run of digits long enough to identify someone.
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 9 && /^[+\d][\d\s().-]*$/.test(text)) return '(teléfono)'
  if (/\d{8,}/.test(text)) return '(número largo)'
  // A description is useful up to the point where it stops being a description (and
  // starts being an address, a note or a paragraph).
  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

/**
 * The sheet as the model is allowed to see it: one line per column, with how many
 * numbers it holds and up to three masked examples.
 */
export function layoutDigest(layout: DetectedLayout): string {
  const lines = [
    'Columnas de la hoja (índice · letra · cabecera si la hay · números que contiene · ejemplos):'
  ]
  for (const column of layout.columns) {
    const samples = column.samples
      .map(maskSample)
      .filter((sample) => sample !== '')
      .slice(0, 3)
    lines.push(
      `${column.index} · ${columnLetter(column.index)}` +
        `${column.header ? ` · «${maskSample(column.header)}»` : ' · sin cabecera'}` +
        ` · ${column.numbers} números` +
        ` · ${samples.length > 0 ? samples.join(' | ') : 'sin valores'}`
    )
  }
  return lines.join('\n')
}

/** The question, with the rules the answer is going to be judged by. */
export function layoutPrompt(digest: string): string {
  return [
    'Eres un lector de presupuestos de obra en Excel.',
    'La hoja NO tiene una fila de cabeceras fiable, así que hay que deducir las columnas por lo que contienen.',
    'Dime en qué columna está el PRECIO UNITARIO de cada partida y, si existe, en cuál está la CANTIDAD.',
    'Reglas:',
    '- El precio unitario es dinero por unidad (18,82 · 45,90 · 780,50), no una cantidad (1 · 3 · 12) ni el importe total de la línea.',
    '- Si hay cantidad, precio e importe, el precio es la columna que multiplicada por la cantidad da el importe de la línea.',
    '- Una columna con dos o tres números sueltos no es una columna de precios: puede ser el membrete del documento.',
    '- Si no hay ninguna columna con precios, devuelve null en priceCol.',
    'Responde SOLO con este JSON, sin texto alrededor:',
    '{"priceCol": <índice o null>, "quantityCol": <índice o null>, "totalCol": <índice o null>, "reason": "<20 palabras como máximo>"}',
    '',
    digest
  ].join('\n')
}

export interface LayoutAnswer {
  priceCol: number | null
  quantityCol: number | null
  totalCol: number | null
  reason: string
}

const columnIndex = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

/** Turns whatever the model answered into columns, or `null` if it is not an answer. */
export function parseLayoutAnswer(raw: unknown): LayoutAnswer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const priceCol = columnIndex(record.priceCol)
  if (priceCol === null && record.priceCol !== null && record.priceCol !== undefined) return null
  return {
    priceCol,
    quantityCol: columnIndex(record.quantityCol),
    totalCol: columnIndex(record.totalCol),
    reason: typeof record.reason === 'string' ? record.reason.slice(0, 200) : ''
  }
}

export interface LayoutVerdict {
  priceCol: number
  quantityCol: number | null
  totalCol: number | null
  /** Lines that actually carry a price in the accepted column. */
  pricedLines: number
  /** Lines with a description, the denominator of the coverage. */
  namedLines: number
  note: string
}

/**
 * Accepts the AI's proposal only if the sheet proves it.
 *
 * - The column exists and is not one we already read as something else.
 * - It prices at least 60 % of the lines (and five of them, at least): a letterhead
 *   column with three numbers cannot pass.
 * - Its numbers are not mostly small whole numbers: that is a «Cantidad» column.
 * - The quantity is kept only when `quantity × price = total` can be seen in the rows;
 *   otherwise it is dropped silently, because the catalogue does not need it.
 */
export function validateLayoutAnswer(
  raw: unknown,
  layout: DetectedLayout,
  rows: unknown[][]
): LayoutVerdict | null {
  const answer = parseLayoutAnswer(raw)
  if (!answer || answer.priceCol === null) return null
  if (answer.priceCol >= layout.columns.length) return null

  // The AI is allowed to *change* the price column — that is the whole point — but it
  // cannot hand back one we already read as the description, the unit or the section.
  const taken = [layout.nameCol, layout.unitCol, layout.sectionCol, layout.codeCol]
  if (taken.includes(answer.priceCol)) return null

  const start = Math.max(layout.firstDataRow, 0)
  let namedLines = 0
  let pricedLines = 0
  let smallWhole = 0
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || []
    if (cellText(row[layout.nameCol]).length < 3) continue
    namedLines++
    const value = parsePriceInput(row[answer.priceCol])
    if (value === null || value === 0) continue
    pricedLines++
    if (Number.isInteger(value) && Math.abs(value) <= 5) smallWhole++
  }

  if (pricedLines < 5) return null
  if (pricedLines / Math.max(namedLines, 1) < 0.6) return null
  if (smallWhole / pricedLines > 0.8) return null

  // Quantity + total, only if the arithmetic holds: `qty × price = total`.
  let quantityCol: number | null = null
  const quantity = answer.quantityCol
  if (quantity !== null && quantity < layout.columns.length && !taken.includes(quantity) && quantity !== answer.priceCol) {
    const totals: number[] = []
    if (answer.totalCol !== null && answer.totalCol < layout.columns.length && answer.totalCol !== quantity) {
      totals.push(answer.totalCol)
    }
    for (let col = 0; col < layout.columns.length; col++) if (!totals.includes(col)) totals.push(col)

    for (const candidate of totals) {
      if (candidate === quantity || candidate === answer.priceCol) continue
      let tested = 0
      let hits = 0
      for (let i = start; i < rows.length; i++) {
        const row = rows[i] || []
        const qty = parsePriceInput(row[quantity])
        const price = parsePriceInput(row[answer.priceCol])
        const total = parsePriceInput(row[candidate])
        if (qty === null || price === null || total === null || qty === 0 || price === 0) continue
        tested++
        const tolerance = Math.max(0.02, Math.abs(qty * price) * 0.01)
        if (Math.abs(qty * price - total) <= tolerance) hits++
      }
      if (tested >= 4 && hits / tested >= 0.7) {
        quantityCol = quantity
        break
      }
    }
  }

  const letter = columnLetter(answer.priceCol)
  const header = layout.columns[answer.priceCol]?.header || ''
  return {
    priceCol: answer.priceCol,
    quantityCol,
    totalCol: answer.totalCol,
    pricedLines,
    namedLines,
    note:
      `No se leía ningún precio, así que la IA ha mirado el documento: los precios están en la columna ${letter}` +
      `${header ? ` («${header}»)` : ''} (${pricedLines} de ${namedLines} partidas traen importe` +
      `${quantityCol === null ? '' : `, con la cantidad en la columna ${columnLetter(quantityCol)}`}). ` +
      'Comprueba la vista previa antes de confirmar; si no es así, elige otra columna abajo.'
  }
}
