import * as xlsx from 'xlsx'
import { inflateRawSync } from 'node:zlib'
import { DOCUMENT_FORMATS_TEXT } from '@/lib/document-formats'

/**
 * Reads an uploaded document as rows, whatever the format is.
 *
 * A contractor does not always get an .xlsx: the budget may arrive as an old
 * .xls, as a PDF exported by another program, as a CSV from their accountant, as
 * a Word document or as an ODS from LibreOffice. All of them end up as the same
 * `unknown[][]` the catalog parser already understands.
 *
 * Kept outside the 'use server' module on purpose: a 'use server' file may only
 * export async functions, and this one needs plain helpers (zip, text splitting).
 */

export type DocumentKind = 'Excel' | 'CSV' | 'PDF' | 'Word' | 'HTML'

export interface DocumentSheet {
  name: string
  rows: unknown[][]
}

export interface DocumentSheets {
  fileName: string
  kind: DocumentKind
  /** Every sheet of the file that has content, in the order they appear. */
  sheets: DocumentSheet[]
}

const TEXT_EXTENSIONS = ['csv', 'tsv', 'txt', 'tab']
const SPREADSHEET_EXTENSIONS = ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'fods', 'html', 'htm', 'xml', 'dif', 'slk', 'prn']

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)\s*$/i.exec(fileName.trim())
  return match ? match[1].toLowerCase() : ''
}

const textDecoder = new TextDecoder('utf-8')

/** Splits one line of a text document (PDF, TXT) into the columns it visually has. */
function splitLineIntoCells(line: string): string[] {
  const normalised = line.replace(/\u00a0/g, ' ').replace(/\s+$/, '')
  const cells = normalised
    .split(/\t+|\s{2,}|\s+\|\s+/)
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '')
  return cells.length > 0 ? cells : [normalised.trim()]
}

/**
 * A PDF has no columns, only text placed at coordinates: the extractor keeps the
 * tabs and the runs of spaces that separated the columns on the page, and those
 * are the column boundaries we use.
 *
 * The separators the extractor inserts between pages («-- 1 of 3 --») are dropped:
 * they are not a line of the budget and would otherwise become a section.
 */
const PAGE_MARKER = /^\s*-{2,}\s*\d+\s+(?:of|de)\s+\d+\s*-{2,}\s*$/i

export function textToRows(text: string): unknown[][] {
  const rows: unknown[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    if (PAGE_MARKER.test(rawLine)) continue
    rows.push(splitLineIntoCells(rawLine))
  }
  return rows
}

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')

/**
 * Minimal ZIP reader (enough for a .docx): walks the central directory and
 * inflates the requested entry, so opening one file inside the package does not
 * need another dependency.
 */
function zipEntry(bytes: Uint8Array, wanted: string): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let endOfCentralDirectory = -1
  const firstPossible = Math.max(0, bytes.length - 22 - 0xffff)
  for (let i = bytes.length - 22; i >= firstPossible; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOfCentralDirectory = i
      break
    }
  }
  if (endOfCentralDirectory < 0) return null

  const entryCount = view.getUint16(endOfCentralDirectory + 10, true)
  let offset = view.getUint32(endOfCentralDirectory + 16, true)

  for (let entry = 0; entry < entryCount; entry++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return null

    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))

    if (name === wanted) {
      if (localOffset + 30 > bytes.length) return null
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const data = bytes.subarray(dataStart, dataStart + compressedSize)
      return method === 0 ? data : new Uint8Array(inflateRawSync(data))
    }

    offset += 46 + nameLength + extraLength + commentLength
  }

  return null
}

/** Cell texts of one `<w:tr>`: Word splits the text of a cell into several `<w:t>`. */
function docxTableRow(rowXml: string): string[] {
  const cells = rowXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || []
  return cells.map((cell) => decodedTextOf(cell))
}

function decodedTextOf(xmlFragment: string): string {
  const pieces = xmlFragment.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []
  return decodeXmlEntities(pieces.map((piece) => piece.replace(/<[^>]+>/g, '')).join('')).trim()
}

function docxRows(bytes: Uint8Array): unknown[][] {
  const xml = zipEntry(bytes, 'word/document.xml')
  if (!xml) throw new Error('No se pudo leer el contenido del documento Word.')

  const document = textDecoder.decode(xml)
  const tableRows = document.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)
  if (tableRows && tableRows.length > 0) {
    return tableRows.map((row) => docxTableRow(row))
  }

  // A quote written as plain paragraphs: one line per paragraph and the columns
  // are whatever separated them on the page.
  const paragraphs = document.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []
  return paragraphs
    .map((paragraph) => decodedTextOf(paragraph))
    .filter((line) => line !== '')
    .map((line) => splitLineIntoCells(line))
}

interface PdfParseModule {
  PDFParse: new (options: { data: Uint8Array }) => {
    getText: () => Promise<{ text?: string }>
    destroy?: () => Promise<void>
  }
}

async function pdfRows(bytes: Uint8Array): Promise<unknown[][]> {
  // Loaded lazily: pdf-parse is only needed when a PDF is actually uploaded.
  const pdfParse = (await import('pdf-parse')) as unknown as PdfParseModule
  const parser = new pdfParse.PDFParse({ data: bytes })

  try {
    const result = await parser.getText()
    const text = typeof result.text === 'string' ? result.text : ''
    return textToRows(text)
  } finally {
    await parser.destroy?.()
  }
}

function workbookSheets(workbook: xlsx.WorkBook): DocumentSheet[] {
  return workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name]
    const rows = worksheet
      ? (xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', blankrows: false }) as unknown[][])
      : []
    return { name, rows }
  }).filter((sheet) => sheet.rows.length > 0)
}

function parseWorkbook(source: Uint8Array | string): DocumentSheet[] {
  // `raw: true` for text files (CSV/TSV): SheetJS would otherwise read "12,35" as
  // 1235 (it takes the comma for a thousands separator), while parseNumberCell
  // understands the Spanish format of the same cell.
  const workbook =
    typeof source === 'string'
      ? xlsx.read(source, { type: 'string', raw: true })
      : xlsx.read(source, { type: 'array' })
  if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) return []
  return workbookSheets(workbook)
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'bmp', 'tif', 'tiff']

/**
 * Reads the uploaded file. Throws a message written for the user (never a stack
 * trace) when the format cannot be read.
 */
export async function readDocumentSheets(file: File): Promise<DocumentSheets> {
  const fileName = file.name || 'documento'
  const extension = extensionOf(fileName)
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (bytes.length === 0) {
    throw new Error('El archivo está vacío.')
  }

  if (extension === 'pdf') {
    const rows = await pdfRows(bytes)
    if (rows.length === 0) {
      throw new Error('No se pudo leer texto del PDF (puede ser un escaneo o una foto). Prueba con el archivo original en Excel, CSV o Word.')
    }
    return { fileName, kind: 'PDF', sheets: [{ name: fileName, rows }] }
  }

  if (extension === 'docx') {
    return { fileName, kind: 'Word', sheets: [{ name: fileName, rows: docxRows(bytes) }] }
  }

  if (extension === 'doc' || extension === 'rtf') {
    throw new Error('Los documentos de Word antiguos (.doc) y los RTF no se pueden leer. Ábrelo en Word y guárdalo como .docx, PDF o Excel (también vale copiar y pegar en Excel) y vuelve a subirlo.')
  }

  if (IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error('Las fotos y los escaneos no se pueden leer todavía: súbeme el presupuesto en Excel, CSV, PDF con texto o Word (.docx).')
  }

  if (TEXT_EXTENSIONS.includes(extension)) {
    const text = textDecoder.decode(bytes)
    // A CSV/TSV has real separators; a plain .txt may just be space-aligned.
    const looksDelimited = /[;,\t]/.test(text.split(/\r?\n/).slice(0, 5).join(''))
    let sheets: DocumentSheet[] = looksDelimited ? parseWorkbook(text) : []
    if (sheets.length === 0) sheets = [{ name: fileName, rows: textToRows(text) }]
    return { fileName, kind: 'CSV', sheets }
  }

  if (!SPREADSHEET_EXTENSIONS.includes(extension)) {
    throw new Error(
      `El formato «${extension || file.type || 'desconocido'}» no se puede leer. Se admiten ${DOCUMENT_FORMATS_TEXT}.`
    )
  }

  let sheets: DocumentSheet[] = []
  try {
    sheets = parseWorkbook(bytes)
  } catch (err) {
    console.error('Error xlsx.read:', err)
    throw new Error('El archivo no se pudo abrir o está dañado. Prueba a guardarlo de nuevo como Excel (.xlsx) o CSV.')
  }

  if (sheets.length === 0) {
    throw new Error('El documento no tiene ninguna hoja con datos.')
  }

  const kind: DocumentKind = extension === 'html' || extension === 'htm' || extension === 'xml' ? 'HTML' : 'Excel'
  return { fileName, kind, sheets }
}
