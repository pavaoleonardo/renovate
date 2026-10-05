import { describe, expect, it } from 'vitest'
import * as xlsx from 'xlsx'
import { detectLayout } from '@/lib/import-layout'
import { readDocumentSheets, textToRows } from '@/lib/document-rows'

/**
 * From an uploaded file to a grid rows. The workbooks below are built in memory, so the
 * repo carries no binary fixture: what is being checked is that a real .xlsx comes out
 * as rows the importer can read.
 */

const normalBudget = [
  ['Código', 'Descripción', 'Ud', 'Cantidad', 'Precio'],
  ['DEM-001', 'Demolición de tabique', 'm2', '12', '18,82'],
  ['DEM-002', 'Picado de alicatado', 'm2', '25', '12,40'],
  ['RET-001', 'Retirada de escombros', 'ud', '1', '180,00']
]

/** A real workbook, written and read back like the browser would hand it over. */
function excelFile(rows: unknown[][], fileName = 'presupuesto.xlsx'): File {
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), 'Presupuesto')
  const bytes = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([bytes], fileName)
}

const fileOf = (content: string, fileName: string) =>
  new File([new TextEncoder().encode(content)], fileName)

describe('textToRows', () => {
  it('corta por tabuladores, por dos espacios y por barra vertical', () => {
    expect(textToRows('Descripción\tUd\tPrecio')).toEqual([['Descripción', 'Ud', 'Precio']])
    expect(textToRows('Demolición de tabique  m2  18,82')).toEqual([['Demolición de tabique', 'm2', '18,82']])
    expect(textToRows('Demolición de tabique | m2 | 18,82')).toEqual([['Demolición de tabique', 'm2', '18,82']])
  })

  it('una línea de un solo dato sigue siendo una fila de una celda', () => {
    expect(textToRows('DEMOLICIONES Y TRABAJOS PREVIOS')).toEqual([['DEMOLICIONES Y TRABAJOS PREVIOS']])
  })

  it('tira las líneas vacías y los separadores de página del PDF', () => {
    const text = ['-- 1 of 3 --', '', 'Descripción\tPrecio', '   ', 'Demolición\t18,82', '-- 2 of 3 --'].join('\n')
    expect(textToRows(text)).toEqual([
      ['Descripción', 'Precio'],
      ['Demolición', '18,82']
    ])
  })

  it('un texto sin líneas devuelve una rejilla vacía', () => {
    expect(textToRows('')).toEqual([])
    expect(textToRows('\n  \n')).toEqual([])
  })
})

describe('readDocumentSheets', () => {
  it('un Excel de verdad entra como rejilla y el importador encuentra el precio', async () => {
    const document = await readDocumentSheets(excelFile(normalBudget))

    expect(document.kind).toBe('Excel')
    expect(document.sheets).toHaveLength(1)
    expect(document.sheets[0].name).toBe('Presupuesto')

    // La cadena completa: archivo → rejilla → columnas. Es lo que hace el importador.
    const layout = detectLayout(document.sheets[0].rows)
    expect(layout.priceCol).toBe(4)
    expect(layout.nameCol).toBe(1)
    expect(layout.unitCol).toBe(2)
    expect(layout.codeCol).toBe(0)
  })

  it('un CSV y un TXT se leen como presupuesto, no se rechazan', async () => {
    const csv = await readDocumentSheets(
      fileOf('Descripción;Ud;Precio\nDemolición de tabique;m2;18,82\n', 'presupuesto.csv')
    )
    expect(csv.kind).toBe('CSV')
    expect(JSON.stringify(csv.sheets)).toContain('Demolición de tabique')

    const txt = await readDocumentSheets(fileOf('Descripción  Ud  Precio\nDemolición de tabique  m2  18,82\n', 'p.txt'))
    expect(txt.kind).toBe('CSV')
    expect(JSON.stringify(txt.sheets)).toContain('Demolición de tabique')
  })

  it('un archivo vacío se rechaza con un mensaje para la persona', async () => {
    await expect(readDocumentSheets(new File([], 'vacio.xlsx'))).rejects.toThrow(/está vacío/)
  })

  it('un Word antiguo, una foto y un formato desconocido se rechazan explicando qué subir', async () => {
    await expect(readDocumentSheets(fileOf('texto', 'presupuesto.doc'))).rejects.toThrow(/Word antiguos/)
    await expect(readDocumentSheets(fileOf('texto', 'presupuesto.rtf'))).rejects.toThrow(/Word antiguos/)
    await expect(
      readDocumentSheets(new File([new Uint8Array([1, 2, 3])], 'foto.jpg'))
    ).rejects.toThrow(/fotos y los escaneos/)
    await expect(readDocumentSheets(new File([new Uint8Array([1, 2, 3])], 'copia.zip'))).rejects.toThrow(
      /no se puede leer/
    )
  })
})
