/**
 * Clave con la que se decide si dos secciones o dos partidas son «la misma».
 *
 * Los acentos, las mayúsculas, los signos y los espacios de más no cuentan: ningún
 * Excel escribe «Demoliciones y Trabajos Previos» igual que el catálogo por
 * defecto, y el sentido de una fusión es no crear una segunda copia de algo que ya
 * existe.
 *
 * Vive en su propio módulo (sin importar el catálogo por defecto) para poder
 * usarse también en componentes de cliente sin arrastrar al navegador los datos
 * del catálogo.
 */
export function catalogKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
