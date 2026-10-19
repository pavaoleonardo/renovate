import { maskSample } from '@/lib/import-layout-ai'

/**
 * Qué líneas de un documento son partidas y cuáles no.
 *
 * Un presupuesto de obra no es una tabla limpia: entre las partidas hay avisos («No está
 * incluido el suministro de caldera»), condiciones de pago, totales de fase y —muy a
 * menudo— descripciones partidas en dos filas porque así venían en el PDF original. El
 * lector determinista no puede distinguirlos: para él todas son filas con un nombre, y
 * las mete todas. El resultado es un catálogo con veinte «partidas» a 0,00 € que no son
 * trabajos y con dos medias partidas donde había una.
 *
 * Dos capas, en este orden:
 *
 * 1. **Reglas** (`ruleReview`): un texto que dice lo que NO está incluido, o que habla de
 *    pagos y condiciones, y que no trae precio, no es una partida. Es gratis y no puede
 *    equivocarse de mucho: sólo descarta líneas **sin precio**.
 * 2. **IA** (`validateReview`): se le enseña el listado numerado y enmascarado (nunca la
 *    hoja) para que marque las que no son partidas y las que son la segunda mitad de la
 *    anterior. Su respuesta se juzga aquí y se acepta poco: no puede descartar una línea
 *    con precio salvo que su nombre la delate como nota o total, no puede unir líneas que
 *    no estén pegadas y en la misma sección, y nunca puede quedarse con más del 40 % del
 *    documento. Una respuesta que no se puede comprobar vale menos que ninguna.
 *
 * Nada de esto borra datos en silencio: la vista previa enseña lo descartado y ofrece
 * importarlo igual. Puro: sin sesión, sin base de datos, sin red — así se puede probar.
 */

/** Una línea ya leída del documento, con lo justo para juzgarla. */
export interface ReviewLine {
  section: string
  name: string
  unit: string
  /** El precio leído, o `null` si la línea no trae ninguno (o trae 0). */
  price: number | null
  code: string | null
}

/** Una partida tal y como la devuelve la revisión; el importador pasa su propio tipo. */
export interface ReviewService {
  name: string
  unit: string
  base_price: number
  hasPrice: boolean
}

/** Respuesta ya validada, con índices de línea **desde 0** (como el array de líneas). */
export interface ImportReview {
  /** Líneas que no son partidas, con el motivo que se enseña en la vista previa. */
  drop: { line: number; reason: string }[]
  /** Índice de cada línea que es la segunda mitad de su vecina. */
  join: number[]
  /** `true` cuando la IA ha puesto algo de lo suyo en esta decisión. */
  aiUsed: boolean
  /** Una frase para la vista previa; vacía cuando sólo han actuado las reglas. */
  note: string
}

/**
 * Textos que delatan un aviso o una condición, no un trabajo. Se aplican sólo a líneas
 * **sin precio**: una partida con importe es una partida aunque su nombre empiece igual.
 */
const NOTE_PATTERNS: RegExp[] = [
  /^no\s+(est[áa]n?\s+incluid|se\s+incluye|se\s+contempla|incluye|contempla|incluido)/i,
  /\bno\s+(se\s+incluye|se\s+contempla|incluye|contempla)\b/i,
  /\b(est[áa]\s+valorad|queda\s+incluid|quedan\s+incluid)/i,
  /\b(iva|igic)\s+(no\s+)?incluido/i,
  /^(nota|observaci[óo]n|aviso|condiciones?)\b/i,
  /\b(forma\s+de\s+pago|se\s+abonar[áa]|se\s+facturar[áa]|el\s+[úu]ltimo\s+pago)\b/i,
  /^(pendiente|por\s+confirmar|a\s+confirmar)\b/i
]

/** Nombres de fila de cierre: totales y sumas, que una hoja suele repetir por fase. */
const SUMMARY_PATTERNS: RegExp[] = [
  /^(total|subtotal|suma\b|base\s+imponible|iva\b|importe\s+total)/i,
  /\b(total\s+(de\s+)?(la\s+)?(fase|cap[ií]tulo|obra|presupuesto|secci[óo]n))/i
]

/** ¿El nombre de la línea es un aviso («No está incluido…»)? */
export const isNoteText = (text: string) => NOTE_PATTERNS.some((pattern) => pattern.test(text.trim()))

/** ¿El nombre de la línea es un total o una suma? */
export const isSummaryText = (text: string) => SUMMARY_PATTERNS.some((pattern) => pattern.test(text.trim()))

/** El documento como una lista plana de líneas, en el orden en que se leyó. */
export function reviewLines(
  phases: {
    name: string
    services: { name: string; unit: string; base_price: number; hasPrice: boolean; code?: string | null }[]
  }[]
): ReviewLine[] {
  const lines: ReviewLine[] = []
  for (const phase of phases) {
    for (const service of phase.services) {
      lines.push({
        section: phase.name,
        name: service.name,
        unit: service.unit,
        price: service.hasPrice ? service.base_price : null,
        code: service.code ?? null
      })
    }
  }
  return lines
}

/** Cuántas partidas hay y cuántas sin precio. Se recalcula después de revisar. */
export function reviewCounts(phases: { name: string; services: ReviewService[] }[]) {
  let services = 0
  let priced = 0
  for (const phase of phases) {
    for (const service of phase.services) {
      services++
      if (service.hasPrice) priced++
    }
  }
  return { services, priced, missing: services - priced }
}

/**
 * Lo que se descarta sin preguntar a nadie: avisos y totales sin precio. Es la red que
 * sigue funcionando cuando la IA no está disponible o se ha gastado el cupo.
 */
export function ruleReview(lines: ReviewLine[]): ImportReview {
  const drop: { line: number; reason: string }[] = []
  lines.forEach((line, index) => {
    if (line.price !== null) return
    if (isSummaryText(line.name)) drop.push({ line: index, reason: 'total' })
    else if (isNoteText(line.name)) drop.push({ line: index, reason: 'nota' })
  })
  return { drop, join: [], aiUsed: false, note: '' }
}


/** El listado que se le enseña al modelo: numerado desde 1 y enmascarado. */
export function reviewDigest(lines: ReviewLine[]): string {
  const mask = (value: string) => {
    const masked = maskSample(value)
    // Un teléfono o un NIF metido en mitad de una frase no lo pilla `maskSample`, que
    // está pensado para celdas enteras: aquí se tapa la tirada de dígitos donde esté.
    return masked.replace(/\+?\d(?:[\d\s().-]*\d){6,}/g, '(número)')
  }
  return lines
    .map((line, index) => {
      const price = line.price === null ? 'sin precio' : `${line.price.toFixed(2)} €`
      const unit = line.unit && line.unit !== '-' ? line.unit : 'sin unidad'
      const code = line.code ? ` · ${mask(line.code)}` : ''
      return `${index + 1} · ${mask(line.section)} · «${mask(line.name)}» · ${unit} · ${price}${code}`
    })
    .join('\n')
}

/** La pregunta, con las reglas con las que se va a juzgar la respuesta. */
export function reviewPrompt(digest: string): string {
  return [
    'Eres un lector de presupuestos de obra. Recibes las líneas que un importador ha leído de un Excel, numeradas.',
    'Marca dos cosas:',
    '1. "notItems": las líneas que NO son partidas de presupuesto (avisos de lo que no está incluido, condiciones de pago, totales o subtotales, cabeceras, textos sueltos).',
    '2. "continuations": las líneas que son la SEGUNDA MITAD de la descripción de la línea anterior o siguiente, porque el nombre quedó partido en dos filas del Excel («Ventana de una hoja oscilobatiente en bicolor bronce/» + «4/16/4 be con barotillo. medidas 880x1550»).',
    'Reglas:',
    '- Una partida es un trabajo con descripción propia y, casi siempre, un precio unitario mayor que 0.',
    '- Un precio 0 no descalifica una línea: puede ser una partida a la que le falta la tarifa.',
    '- No marques como "notItems" una línea con precio mayor que 0 salvo que sea claramente un total, un subtotal o una cabecera.',
    '- Si dos líneas seguidas son trabajos distintos, no son "continuations".',
    '- Usa los números del listado (empiezan en 1). No inventes números que no existan.',
    'Responde SOLO con este JSON, sin texto alrededor:',
    '{"notItems":[{"line": 12, "reason": "no incluido"}], "continuations": [15], "note": "<20 palabras como máximo>"}',
    '',
    digest
  ].join('\n')
}

interface RawReviewAnswer {
  notItems: { line: number; reason: string }[]
  continuations: number[]
  note: string
}

const toLineNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

/** Convierte lo que sea que haya contestado el modelo en algo con forma, o `null`. */
export function parseReviewAnswer(raw: unknown): RawReviewAnswer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.notItems) && !Array.isArray(record.continuations)) return null

  const notItems: { line: number; reason: string }[] = []
  if (Array.isArray(record.notItems)) {
    for (const item of record.notItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const entry = item as Record<string, unknown>
      const line = toLineNumber(entry.line)
      if (line === null) continue
      notItems.push({ line, reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 60) : '' })
    }
  }

  const continuations: number[] = []
  if (Array.isArray(record.continuations)) {
    for (const item of record.continuations) {
      const line = toLineNumber(item)
      if (line !== null) continuations.push(line)
    }
  }

  return {
    notItems,
    continuations,
    note: typeof record.note === 'string' ? record.note.slice(0, 140) : ''
  }
}

/**
 * La vecina con la que puede unirse `index`: pegada, de la misma sección y con precio en
 * sólo una de las dos (la que se queda). Con dos candidatas o ninguna, no se une.
 */
function joinNeighbour(lines: ReviewLine[], index: number): number | null {
  const line = lines[index]
  const candidates = [index - 1, index + 1].filter(
    (candidate) =>
      candidate >= 0 &&
      candidate < lines.length &&
      lines[candidate].section === line.section &&
      (lines[candidate].price !== null) !== (line.price !== null)
  )
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * Deja pasar sólo las decisiones que se pueden comprobar contra el documento: una línea
 * con precio normal no se descarta, una nota no se une, un par unido tiene que estar
 * pegado, en la misma sección y con precio sólo en una de las dos. Se aplica dos veces:
 * al validar la respuesta de la IA y al leer lo que manda el navegador al confirmar (un
 * cliente manipulado no puede borrar partidas reales).
 */
export function sanitizeReview(review: ImportReview, lines: ReviewLine[]): ImportReview {
  // Un documento no se vacía por una alucinación: como mucho se descarta el 40 % (y
  // nunca menos de cinco líneas, porque en un documento de ocho avisos son casi todas).
  const dropCap = Math.max(5, Math.floor(lines.length * 0.4))
  const joinCap = Math.min(60, Math.max(1, Math.floor(lines.length * 0.3)))

  const joined = new Set<number>()
  for (const rawLine of review.join.slice(0, joinCap)) {
    if (rawLine < 0 || rawLine >= lines.length) continue
    if (joined.has(rawLine)) continue
    const line = lines[rawLine]
    // Un aviso («No está incluido…») no es la segunda mitad de nada.
    if (isNoteText(line.name) || isSummaryText(line.name)) continue
    const neighbour = joinNeighbour(lines, rawLine)
    if (neighbour === null || joined.has(neighbour)) continue
    // El par se marca por su índice mayor para que no se acepte dos veces.
    joined.add(Math.max(rawLine, neighbour))
  }

  const dropped = new Map<number, string>()
  for (const entry of review.drop) {
    if (entry.line < 0 || entry.line >= lines.length) continue
    if (joined.has(entry.line) || dropped.has(entry.line)) continue
    if (dropped.size >= dropCap) break
    const line = lines[entry.line]
    // Una línea con precio sólo se descarta si su propio nombre la delata.
    if (line.price !== null && !isNoteText(line.name) && !isSummaryText(line.name)) continue
    const reason = isSummaryText(line.name)
      ? 'total'
      : isNoteText(line.name)
        ? 'nota'
        : entry.reason || 'no es una partida'
    dropped.set(entry.line, reason)
  }

  return {
    drop: Array.from(dropped.entries())
      .map(([line, reason]) => ({ line, reason }))
      .sort((a, b) => a.line - b.line),
    join: Array.from(joined).sort((a, b) => a - b),
    aiUsed: review.aiUsed,
    note: review.note
  }
}

/**
 * La decisión final: reglas + lo que la IA haya propuesto, ya filtrado. Nunca lanza: ante
 * una respuesta rara devuelve sólo lo que dicen las reglas, que es lo que ya se sabía sin
 * gastar la llamada.
 */
export function validateReview(raw: unknown, lines: ReviewLine[], rules: ImportReview): ImportReview {
  const answer = parseReviewAnswer(raw)
  if (!answer || lines.length === 0) return rules

  // El listado que se le enseñó al modelo empieza en 1; aquí todo va desde 0.
  const proposed: ImportReview = {
    drop: answer.notItems.map((item) => ({ line: item.line - 1, reason: item.reason })),
    join: answer.continuations.map((line) => line - 1),
    aiUsed: true,
    note: answer.note
  }
  const safe = sanitizeReview(proposed, lines)
  const joined = new Set(safe.join)
  const fromAi = new Set(safe.drop.map((entry) => entry.line))
  return {
    // Lo que descartan las reglas no pasa por el tope ni por la IA: un aviso leído con
    // seguridad es un aviso, aunque el documento sea casi todo avisos.
    drop: [...rules.drop.filter((entry) => !joined.has(entry.line)), ...safe.drop.filter((entry) => !rules.drop.some((rule) => rule.line === entry.line))]
      .sort((a, b) => a.line - b.line),
    join: safe.join,
    aiUsed: fromAi.size > 0 || safe.join.length > 0,
    note: answer.note
  }
}

export interface AppliedReview<S extends ReviewService> {
  phases: { name: string; services: S[] }[]
  /** Lo que no se importará, con su nombre y su sección, para enseñarlo. */
  dropped: { name: string; section: string; reason: string }[]
  /** Nombres completos de las partidas que se han unido con su segunda mitad. */
  joined: string[]
}

/**
 * Textos que terminan pidiendo continuación («… bronce/», «… en blanco,», «… con») y
 * textos que empiezan siendo continuación («( formato 120x60)», «Interior con melamina…»).
 * Son la única pista fiable de en qué orden van las dos mitades de una partida partida:
 * la fila que trae el precio no siempre es la primera (a veces el precio está en la cola).
 */
const HEAD_TAIL_MARK = /[/,;:]$|\b(de|del|con|en|para|y|o|sin|sobre|entre|desde|hasta)\s*$/i
const STARTS_AS_TAIL = /^[(\[]|^\d+([.,]\d+)?\s*[/x×]|^(interior|medidas|acabados?|color|modelo|con|de|del|en|para)\b/i

/** Las dos mitades en el orden en que se leen, no en el orden en que aparecen. */
function joinOrder(a: ReviewService, b: ReviewService): [ReviewService, ReviewService] {
  const aHead = HEAD_TAIL_MARK.test(a.name)
  const bHead = HEAD_TAIL_MARK.test(b.name)
  const aTail = STARTS_AS_TAIL.test(a.name)
  const bTail = STARTS_AS_TAIL.test(b.name)
  if (aHead && !bHead) return [a, b]
  if (bHead && !aHead) return [b, a]
  if (bTail && !aTail) return [a, b]
  if (aTail && !bTail) return [b, a]
  return [a, b]
}

/**
 * Aplica la revisión a lo leído. Une primero —el nombre completo se queda en la línea que
 * tiene precio, así no se pierde ni el importe ni su código— y descarta después; las
 * secciones que se quedan sin partidas desaparecen, igual que en el lector.
 */
export function applyReview<S extends ReviewService>(
  phases: { name: string; services: S[] }[],
  review: ImportReview
): AppliedReview<S> {
  const flat: { phase: number; service: number }[] = []
  phases.forEach((phase, phaseIndex) => {
    phase.services.forEach((_, serviceIndex) => flat.push({ phase: phaseIndex, service: serviceIndex }))
  })

  const removed = new Set<number>()
  const renamed = new Map<number, string>()
  const joinedNames: string[] = []

  for (const tail of review.join) {
    if (tail < 0 || tail >= flat.length || removed.has(tail)) continue
    // El compañero es la vecina de la misma sección con el precio al revés; la validación
    // ya se ha asegurado de que existe exactamente una.
    const neighbour = [tail - 1, tail + 1].find((candidate) => {
      if (candidate < 0 || candidate >= flat.length || removed.has(candidate)) return false
      if (flat[candidate].phase !== flat[tail].phase) return false
      const candidateHasPrice = phases[flat[candidate].phase].services[flat[candidate].service].hasPrice
      return candidateHasPrice !== phases[flat[tail].phase].services[flat[tail].service].hasPrice
    })
    if (neighbour === undefined) continue

    const keeper = phases[flat[neighbour].phase].services[flat[neighbour].service].hasPrice ? neighbour : tail
    const other = keeper === tail ? neighbour : tail
    const keeperService = phases[flat[keeper].phase].services[flat[keeper].service]
    const otherService = phases[flat[other].phase].services[flat[other].service]
    // En el orden en que se leen, no en el de la fila que tiene el precio: «Armario…, interior…».
    const [first, second] = joinOrder(keeperService, otherService)
    const name = `${first.name} ${second.name}`.trim().replace(/\s+/g, ' ')
    renamed.set(keeper, name)
    removed.add(other)
    joinedNames.push(name)
  }

  const dropped: { name: string; section: string; reason: string }[] = []
  for (const entry of review.drop) {
    if (entry.line < 0 || entry.line >= flat.length || removed.has(entry.line)) continue
    const phase = phases[flat[entry.line].phase]
    dropped.push({
      name: phase.services[flat[entry.line].service].name,
      section: phase.name,
      reason: entry.reason
    })
    removed.add(entry.line)
  }

  let cursor = 0
  const reviewed: { name: string; services: S[] }[] = []
  for (const phase of phases) {
    const services: S[] = []
    for (const service of phase.services) {
      const index = cursor++
      if (removed.has(index)) continue
      const completeName = renamed.get(index)
      services.push(completeName ? ({ ...service, name: completeName } as S) : service)
    }
    if (services.length > 0) reviewed.push({ name: phase.name, services })
  }

  return { phases: reviewed, dropped, joined: joinedNames }
}
