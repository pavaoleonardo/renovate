/**
 * El catálogo por defecto escribe sus partidas en minúsculas con la primera letra en
 * mayúscula —«Falso techo continuo de placa de cartón yeso (Pladur) 13 mm», «…placa
 * verde WR»— y los documentos que la empresa sube suelen venir enteros en MAYÚSCULAS.
 * Leídos tal cual, la lista mezcla los dos estilos y el presupuesto que recibe el
 * cliente parece escrito por dos personas distintas.
 *
 * `matchCatalogCase` escribe un nombre subido al estilo del catálogo por defecto, y
 * **sólo** cuando el nombre viene entero en mayúsculas: lo que una persona escribió con
 * minúsculas, aunque tenga un descuido, se respeta tal cual.
 */

/**
 * Siglas del oficio que el catálogo por defecto escribe en mayúsculas. Se comparan como
 * palabra completa, así que «(WR)» también entra. Añadir una sigla nueva es una línea.
 */
const ACRONYMS = [
  'acm', 'acs', 'eps', 'eva', 'hpl', 'led', 'mdf', 'osb', 'pe', 'pex', 'ppr', 'ps',
  'pur', 'pvc', 'pyl', 'uv', 'wc', 'wr', 'xps'
]

/**
 * Marcas que el catálogo por defecto escribe con su mayúscula («Pladur», «Climaver»,
 * «Cortizo»). Una sola palabra cada una: un nombre de modelo («THE GAP ROUND») pierde
 * sus mayúsculas internas, que es el precio de no tener un diccionario de productos.
 */
const BRANDS = [
  'Balay', 'Bosch', 'Climaver', 'Cortizo', 'Daikin', 'Grohe', 'Junkers', 'Jung',
  'Legrand', 'Pladur', 'Porcelanosa', 'Roca', 'Schneider', 'Siemens', 'Simon', 'Somfy',
  'Teka', 'Vaillant'
]

/** Letra sola que abre un código de modelo («A-70», «K-1»): se queda en mayúscula. */
const SINGLE_LETTER_CODE = /\b([a-z])([-/]?\d)/g

/**
 * La hoja de cálculo arrastra caracteres de control cuando parte el texto de una celda
 * («…CON TA\u0008PA», «…DE \n ELECTRICIDAD»): son invisibles, pero dejan el nombre sin
 * lo que había en medio. Fuera antes de guardar; un salto de línea sí separaba palabras,
 * así que se convierte en un espacio y el resto de huecos se colapsan en uno.
 */
export function cleanImportedText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\t\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Escribe el nombre tal como lo escribiría el catálogo por defecto. Devuelve el texto
 * limpio sin más cuando ya trae minúsculas (lo escribió una persona), y sólo recorta las
 * mayúsculas de un nombre enteramente en mayúsculas.
 */
export function matchCatalogCase(name: string): string {
  const text = cleanImportedText(name)
  if (text === '' || text !== text.toLocaleUpperCase('es')) return text

  let recased = text.toLocaleLowerCase('es')
  for (const acronym of ACRONYMS) recased = recased.replace(new RegExp(`\\b${acronym}\\b`, 'g'), acronym.toUpperCase())
  for (const brand of BRANDS) recased = recased.replace(new RegExp(`\\b${brand.toLowerCase()}\\b`, 'g'), brand)
  recased = recased.replace(SINGLE_LETTER_CODE, (_match, letter: string, rest: string) => letter.toUpperCase() + rest)

  return recased.charAt(0).toLocaleUpperCase('es') + recased.slice(1)
}
