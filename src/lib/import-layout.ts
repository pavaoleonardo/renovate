import { parsePriceInput } from '@/lib/price-input'

/**
 * Cómo leer un documento subido: dónde están el precio, las partidas y las secciones.
 *
 * Vive fuera de los módulos de servidor a propósito, igual que `catalog-key`,
 * `catalog-match` y `catalog-import`: es una decisión pura (mirar la rejilla de celdas
 * y decidir qué columna es cuál) y tiene que poder comprobarse sin base de datos, sin
 * sesión y sin clave de OpenAI. Los módulos de servidor se quedan con lo que sí
 * necesita red o datos.
 *
 * El precio se reconoce por la cabecera («Precio», «PVP», «Importe»…) **y** por la
 * pinta de sus números, que es lo que separa un precio de una medición: una columna de
 * cantidades son enteros pequeños (3, 7, 1) y una de precios son importes (18,82;
 * 45,90; 780,50). Cuando las dos cosas discrepan, mandan los números y la vista previa
 * lo explica.
 */

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
type PriceSource = 'header' | 'numbers' | 'user' | 'ai'

/**
 * What the user asked for in the preview: change the price column or import
 * every line without a price (a budget that only carries measurements).
 */
export interface LayoutOverride {
  priceCol?: number | null
  /**
   * Column with the quantity, when it had to be given by hand or by the AI. The
   * catalogue ignores it; it is what lets a budget line be read as `qty × price`.
   */
  quantityCol?: number | null
  /**
   * Set when `priceCol` came from the AI, so the preview can say «elegida por la IA»
   * instead of attributing the choice to the user.
   */
  byAi?: boolean
  ignorePrices?: boolean
}

/** Where the price and the sections really live in the sheet. */
export interface DetectedLayout {
  nameCol: number
  unitCol: number
  priceCol: number
  /**
   * Column with the quantity of the line (`12,00 m2`), when the sheet has one. It is
   * how `qty × price` can be checked against the line total; the catalogue does not
   * store it yet.
   */
  quantityCol: number | null
  /** Column with the partida's own code, when the sheet has one. */
  codeCol: number | null
  priceHeader: string
  priceDetectedByHeader: boolean
  priceSource: PriceSource
  /** True when the price column is not the one the headers suggested, and why. */
  priceNote: string | null
  ignorePrices: boolean
  headerRowIndex: number | null
  /**
   * First row of the table itself: everything above it (letterhead, address, date)
   * is never scored as a price. `0` when the sheet has no recognisable data block.
   */
  firstDataRow: number
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

export const HEADER_PATTERNS = {
  name: /descrip|concepto|partida|servicio|trabajo|detalle/i,
  unit: /^\s*u\.?d\b|^\s*unidad|^\s*medida|^\s*m2|^\s*m3|^\s*ml/i,
  price: /precio|pvp|importe|coste|tarifa|€|euro/i,
  quantity: /cantidad|^\s*cant\b|medici/i,
  /** Column with the partida's own code («Código», «Ref.», «Referencia»). */
  code: /^\s*c[óo]dig|^\s*ref(erencia)?\b/i,
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

export const cellText = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim())

export const columnLetter = (index: number) => String.fromCharCode(65 + Math.max(index, 0))

/**
 * Maps the unit text of the sheet to the units the app works with. Anything we
 * do not recognise is kept exactly as written in the Excel.
 */
export function normalizeUnit(raw: string): string {
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
 * Works out which column holds the price BEFORE reading a single row.
 *
 * The previous version read the price from a hardcoded column (7th, falling back
 * to the 3rd), so a sheet whose price lives elsewhere was imported silently
 * wrong. Now the column comes from the header row ("Precio", "PVP", "Importe"
 * …), a header that says "Cantidad"/"Medición" is never used as a price, and
 * when there is no usable header we take the column that is numeric the most
 * often instead of guessing row by row.
 */
export function detectLayout(rows: unknown[][], override: LayoutOverride = {}): DetectedLayout {
  const width = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)

  /**
   * What a column holds: how many of its cells are numbers, and how price-shaped
   * those numbers are.
   *
   * Telling a price from a measurement is the whole trick: a «Cantidad» column is
   * 3 · 7 · 1 · 12 (whole numbers, almost all ≤ 5) while a price column is 18,82 ·
   * 45,90 · 780,50. Counting how many values are above 5 separates the two far
   * better than the header alone, and it is what lets the importer tell the user
   * «this column looks like measurements» instead of reading a 1,00 € inodoro.
   */
  const columnStats = (col: number, fromRow = 0) => {
    let filled = 0
    let numeric = 0
    let overFive = 0
    for (let i = fromRow; i < rows.length; i++) {
      // The header row is not data: its words («Precio», «Cantidad») would dilute how
      // dense the column is, which is exactly the signal that tells price from quantity.
      if (i === headerRowIndex) continue
      const cell = rows[i][col]
      if (cell === '' || cell === null || cell === undefined) continue
      filled++
      const value = parsePriceInput(cell)
      if (value === null) continue
      numeric++
      if (Math.abs(value) > 5) overFive++
    }
    const density = filled === 0 ? 0 : numeric / filled
    const priceShare = numeric === 0 ? 0 : overFive / numeric
    return { filled, numeric, density, priceShare }
  }

  /**
   * How much a column looks like the price column: it has to be numeric almost
   * everywhere (a price is on every line) and its numbers have to look like money
   * rather than like measurements.
   */
  const priceScore = (col: number) => {
    const stats = columnStats(col, firstDataRow)
    if (stats.filled === 0 || stats.density === 0) return 0
    return stats.density * (0.55 + 0.45 * stats.priceShare)
  }

  const looksLikeQuantities = (col: number) => {
    const stats = columnStats(col, firstDataRow)
    return stats.filled > 2 && stats.density >= 0.8 && stats.priceShare <= 0.2
  }

  let headerRowIndex: number | null = null
  let nameCol = -1
  let unitCol = -1
  let sectionCol = -1
  let codeCol = -1
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
    // A header row is made of words. A partida such as «Partida 12 · m2 · 18,82» hits
    // «partida» and «m2» too, so without this guard the first data row of a sheet
    // without headers was taken as the header and its own numbers decided the columns.
    if ((rows[i] || []).filter((cell) => parsePriceInput(cell) !== null).length >= 2) continue

    headerRowIndex = i
    cells.forEach((cell, col) => {
      if (!cell) return
      if (nameCol === -1 && HEADER_PATTERNS.name.test(cell)) nameCol = col
      if (unitCol === -1 && HEADER_PATTERNS.unit.test(cell)) unitCol = col
      if (sectionCol === -1 && HEADER_PATTERNS.section.test(cell)) sectionCol = col
      if (codeCol === -1 && HEADER_PATTERNS.code.test(cell)) codeCol = col
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

  // A column headed «Precio» is a strong hint, but the numbers decide: a sheet may
  // have both «Precio» and «Precio final» and only one filled, or a column headed
  // «Precio» that really carries the measurements of the job.
  const excluded = (col: number) => col === nameCol || col === unitCol || col === sectionCol || col === codeCol

  // ── Where the table really starts ────────────────────────────────────────────
  // A budget usually opens with a letterhead: client, address, phone, date. Those
  // cells parse as numbers too (a phone and an address end in digits), and three of
  // them in one column used to tie with the real price column and win the tie just by
  // being first: every price came out empty and the import filled the catalogue with
  // invented rates. Only a column that is numeric all the way down marks the table,
  // so three numbers above it can never compete with 112 real ones.
  const denseColumns: number[] = []
  for (let col = 0; col < width; col++) if (columnStats(col).numeric >= 5) denseColumns.push(col)

  const firstNumericRow = (col: number) => {
    for (let i = 0; i < rows.length; i++) {
      if (i === headerRowIndex) continue
      if (parsePriceInput((rows[i] || [])[col]) !== null) return i
    }
    return rows.length
  }

  const firstDataRow = denseColumns.length === 0 ? 0 : Math.min(...denseColumns.map(firstNumericRow))
  const dataRowCount = Math.max(rows.length - firstDataRow, 1)
  // Short sheets (the fixtures, a five-line budget) need half their rows; a real
  // budget needs five numbers and 15 % of the table. Without a floor, a column with
  // three numbers in the letterhead is as «priced» as the column with every rate.
  const minNumbers = dataRowCount < 10 ? Math.max(1, Math.ceil(dataRowCount / 2)) : 5

  const isPriceShaped = (col: number) => {
    const stats = columnStats(col, firstDataRow)
    return stats.numeric >= minNumbers && stats.numeric / dataRowCount >= 0.15
  }

  /**
   * Finds the three columns every priced budget has — quantity, unit price and
   * `quantity × unit price` — by arithmetic instead of by position or by a header we
   * may not have. This is what settles «H or I?» when both are full of numbers: the
   * total is the one that equals the product, so the price is its factor. It also
   * hands us the quantity column for free.
   */
  const totalsTriple = (): { totalCol: number; priceCol: number; quantityCol: number } | null => {
    const candidates: number[] = []
    for (let col = 0; col < width; col++) {
      if (excluded(col) || isQuantityHeader(col)) continue
      if (columnStats(col, firstDataRow).density < 0.6) continue
      candidates.push(col)
    }
    // Price-shaped columns go first so a wide sheet never pushes the total out of the
    // window; ten columns are more than any real budget has.
    const ranked = candidates
      .sort((a, b) => Number(isPriceShaped(b)) - Number(isPriceShaped(a)) || a - b)
      .slice(0, 10)
    const scanEnd = Math.min(rows.length, firstDataRow + 400)
    const values = new Map<number, (number | null)[]>()
    for (const col of ranked) {
      const column: (number | null)[] = []
      for (let i = firstDataRow; i < scanEnd; i++) column.push(parsePriceInput((rows[i] || [])[col]))
      values.set(col, column)
    }
    const median = (col: number) => {
      const numbers = (values.get(col) || [])
        .filter((value): value is number => value !== null)
        .map((value) => Math.abs(value))
      if (numbers.length === 0) return 0
      numbers.sort((a, b) => a - b)
      return numbers[Math.floor(numbers.length / 2)]
    }

    for (let a = 0; a < ranked.length; a++) {
      for (let b = a + 1; b < ranked.length; b++) {
        const colA = ranked[a]
        const colB = ranked[b]
        for (const product of ranked) {
          if (product === colA || product === colB) continue
          const left = values.get(colA) || []
          const right = values.get(colB) || []
          const total = values.get(product) || []
          let tested = 0
          let hits = 0
          for (let i = 0; i < total.length; i++) {
            const va = left[i]
            const vb = right[i]
            const vp = total[i]
            if (va === null || vb === null || vp === null || va === 0 || vb === 0) continue
            tested++
            const tolerance = Math.max(0.02, Math.abs(va * vb) * 0.01)
            if (Math.abs(va * vb - vp) <= tolerance) hits++
          }
          // Four lines are the minimum that makes a coincidence unlikely; from then on
          // the identity has to hold for seven out of ten lines.
          if (tested >= 4 && hits / tested >= 0.7) {
            const quantity = median(colA) <= median(colB) ? colA : colB
            return { totalCol: product, priceCol: quantity === colA ? colB : colA, quantityCol: quantity }
          }
        }
      }
    }
    return null
  }

  const triple = totalsTriple()
  const totalsCol = triple ? triple.totalCol : -1

  let numericCol = -1
  let numericScore = 0
  for (let col = 0; col < width; col++) {
    if (excluded(col)) continue
    // A column headed «Cantidad»/«Medición» is never the price, not even when it
    // is the only one with numbers: those numbers are the measurements.
    if (isQuantityHeader(col)) continue
    // The line total is not a unit price either: importing it would store 226,50 €
    // as the price of one square metre.
    if (col === totalsCol) continue
    // Of the detected triple, the price is the factor; the other one is the quantity.
    if (triple && col === triple.quantityCol) continue
    // A handful of numbers above the table (letterhead) or in a nearly empty column
    // is not a price column, however dense it looks in those few cells.
    if (col !== triple?.priceCol && !isPriceShaped(col)) continue
    const score = priceScore(col)
    if (score > numericScore) {
      numericCol = col
      numericScore = score
    }
  }

  // Nothing price-shaped at all: keep the historical «most numeric» column so a very
  // sparse sheet still opens (with the warning) instead of refusing the file.
  if (numericCol === -1) {
    for (let col = 0; col < width; col++) {
      if (excluded(col) || isQuantityHeader(col) || col === totalsCol) continue
      const score = priceScore(col)
      if (score > numericScore) {
        numericCol = col
        numericScore = score
      }
    }
  }

  let headerCol = -1
  let headerScore = 0
  for (const col of Array.from(priceCandidates)) {
    // «Importe total» matches the price header and is not one: the total of the line.
    if (col === totalsCol) continue
    const score = priceScore(col)
    if (score > headerScore) {
      headerCol = col
      headerScore = score
    }
  }

  let priceCol = -1
  let priceDetectedByHeader = false
  let priceNote: string | null = null

  const label = (col: number) =>
    `${columnLetter(col)}${headerCells[col] ? ` («${headerCells[col]}»)` : ''}`

  if (headerCol !== -1 && headerScore > 0 && headerScore >= numericScore * 0.5) {
    priceCol = headerCol
    priceDetectedByHeader = true

    // Another column also says «Precio» (or «Precio final») but holds small whole
    // numbers: those are the measurements of the job. Say which one was read and why,
    // instead of leaving the user wondering where their prices went.
    const looksLikeMeasurements = Array.from(priceCandidates).find(
      (col) => col !== priceCol && looksLikeQuantities(col)
    )

    if (looksLikeMeasurements !== undefined) {
      priceNote =
        `La columna ${label(looksLikeMeasurements)} parece de mediciones (números enteros y pequeños), así que los ` +
        `precios se leen de la columna ${label(priceCol)}. Si no es así, elige tú la columna del precio abajo.`
    } else if (looksLikeQuantities(headerCol) && numericCol !== -1 && numericScore > headerScore) {
      // …or the chosen column itself is a column of measurements and there is a proper
      // price column next to it: then the numbers win.
      priceCol = numericCol
      priceDetectedByHeader = false
      priceNote =
        `La columna ${label(headerCol)} parece de mediciones (números enteros y pequeños), así que los precios ` +
        `se leen de la columna ${label(numericCol)}. Si no es así, elige tú la columna del precio abajo.`
    }
  } else if (numericCol !== -1 && numericScore > 0) {
    priceCol = numericCol
    if (headerCol !== -1) {
      priceNote =
        `La columna ${label(headerCol)} no trae números creíbles, así que los precios se leen de la columna ` +
        `${label(numericCol)}. Si prefieres la otra, elígela abajo.`
    }
  } else if (priceCandidates.size > 0) {
    // The document has a column named «Precio» but it is empty in every row: it is a
    // budget still to be priced. Keep that column (the import will warn and store the
    // partidas without a price) instead of refusing the document.
    priceCol = Array.from(priceCandidates)[0]
    priceDetectedByHeader = true
  }

  let priceSource: PriceSource = priceDetectedByHeader ? 'header' : 'numbers'

  // What the user chose in the preview wins over anything we guessed — including when
  // nothing was detected at all, which is exactly when they had to choose by hand.
  if (typeof override.priceCol === 'number' && override.priceCol >= 0 && override.priceCol < Math.max(width, 1)) {
    priceCol = override.priceCol
    priceSource = override.byAi === true ? 'ai' : 'user'
    priceDetectedByHeader = false
    priceNote = null
  }

  if (priceCol === -1) {
    throw new Error('No se encontró ninguna columna con precios en el documento: elige la columna del precio a mano o añade una columna «Precio» y vuelve a intentarlo.')
  }

  // Never silent. With no header row the user cannot tell where the prices came from,
  // so say it: which column, which one is the quantity, which one the line total, and
  // which lookalike column was left out (the letterhead numbers that used to win).
  if (priceSource === 'numbers' && headerRowIndex === null && priceNote === null) {
    const parts = [
      `No hay fila de cabeceras: los precios se leen de la columna ${label(priceCol)}, la que trae importes en todo el presupuesto.`
    ]
    if (triple) {
      parts.push(
        `La cantidad sale de la ${label(triple.quantityCol)} y el importe de cada línea de la ${label(triple.totalCol)} ` +
          `(cantidad × precio cuadra en la mayoría de las filas).`
      )
    }
    // Columns with a handful of numbers are the letterhead (phone, address, budget
    // number). Naming them is what turns «why is everything 0 €?» into a readable rule;
    // the one with most numbers goes first because it is the one that stole the price.
    const decoys: { col: number; numeric: number }[] = []
    for (let col = 0; col < width; col++) {
      if (col === priceCol || col === totalsCol || col === triple?.quantityCol) continue
      const stats = columnStats(col)
      if (stats.numeric > 0 && stats.numeric < minNumbers) decoys.push({ col, numeric: stats.numeric })
    }
    decoys.sort((a, b) => b.numeric - a.numeric || a.col - b.col)
    if (decoys.length > 0) {
      const named = decoys.slice(0, 2).map(({ col, numeric }, index) => {
        const label = `${index === 0 ? 'La' : 'la'} columna ${columnLetter(col)}`
        return `${label} solo tiene ${numeric} ${numeric === 1 ? 'número' : 'números'}`
      })
      parts.push(`${named.join(' y ')}: parece la cabecera del documento, no una tarifa.`)
    }
    priceNote = parts.join(' ')
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

  // The code column can never be any of the columns we already read.
  if (codeCol === nameCol || codeCol === unitCol || codeCol === priceCol || codeCol === sectionCol) {
    codeCol = -1
  }

  // ── Quantity ────────────────────────────────────────────────────────────────
  // A header that says «Cantidad» is authoritative; otherwise the arithmetic of the
  // triple already told us which factor is the quantity. A quantity column can never
  // be one of the columns we read as something else.
  const headerQuantity = Array.from(quantityCols)[0]
  let quantityCol =
    headerQuantity !== undefined ? headerQuantity : triple ? triple.quantityCol : -1
  if (typeof override.quantityCol === 'number' && override.quantityCol >= 0 && override.quantityCol < Math.max(width, 1)) {
    quantityCol = override.quantityCol
  }
  if (
    quantityCol === nameCol ||
    quantityCol === unitCol ||
    quantityCol === priceCol ||
    quantityCol === sectionCol ||
    quantityCol === codeCol ||
    quantityCol < 0
  ) {
    quantityCol = -1
  }

  // Every column is described for the chooser of the preview, so the user can see
  // what is inside each one («Precio»: 12,35 · 45,90 · 780,50) before confirming.
  const columns: DetectedColumn[] = []
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
    quantityCol: quantityCol === -1 ? null : quantityCol,
    codeCol: codeCol === -1 ? null : codeCol,
    priceHeader: headerCells[priceCol] || '',
    priceDetectedByHeader,
    priceSource,
    priceNote,
    ignorePrices: override.ignorePrices === true,
    headerRowIndex,
    firstDataRow,
    sectionCol: sectionCol === -1 ? null : sectionCol,
    sectionHeader: sectionCol === -1 ? '' : (headerCells[sectionCol] || ''),
    nameHeader: headerCells[nameCol] || '',
    unitHeader: headerCells[unitCol] || '',
    columns
  }
}
