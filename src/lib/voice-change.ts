import { CatalogService, EstimateRow, VoiceProposal, VoiceProposalLine } from '@/types';
import { PRICE_TO_CONFIRM } from '@/lib/pending-notes';
import { catalogKey } from '@/lib/catalog-key';

/** Un cambio dictado no debería convertirse en un presupuesto entero. */
export const VOICE_MAX_LINES = 20;

/**
 * Una línea del presupuesto tal como se le enseña a la IA: su descripción y cuántas
 * unidades hay. La cantidad es imprescindible para «déjalo en cinco»: sin ella la IA no
 * puede calcular la cantidad final ni reconocer que el cambio va sobre una línea que ya
 * existe.
 */
export interface VoiceOutlineLine {
  description: string;
  quantity: number;
}

/**
 * Una sección del presupuesto con sus líneas actuales. Es el contexto que se le da a la
 * IA para que el cambio dictado se pegue al servicio que ya existe (el `anchor`), sepa si
 * modifica una línea o añade otra nueva, y en qué sección cae.
 */
export interface VoiceOutlineSection {
  section: string;
  lines: VoiceOutlineLine[];
}

/** Partida del catálogo de la empresa, recortada para dársela a la IA (sin precios). */
export interface VoiceCatalogEntry {
  name: string;
  unit: string;
  section: string | null;
}

/** Topes del contexto que viaja en el prompt, para que no crezca sin límite. */
const PROMPT_MAX_SECTIONS = 40;
const PROMPT_MAX_LINES_PER_SECTION = 40;
const PROMPT_MAX_CATALOG = 200;

/** Un número seguro y positivo; si no lo es, se usa el valor por defecto. */
function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

/** La IA sólo puede proponer tres operaciones; cualquier otra cae en 'add'. */
function normalizeOp(value: unknown): VoiceProposalLine['op'] {
  return value === 'update' || value === 'remove' ? value : 'add';
}

/** `source` sólo vale 'catalog' o 'new'; cualquier otra cosa (o ausente) es null. */
function normalizeSource(value: unknown): VoiceProposalLine['source'] {
  return value === 'catalog' || value === 'new' ? value : null;
}

/**
 * La respuesta de la IA es texto de fuera: hay que tratarla como tal. Sólo
 * sobrevive lo que tiene sentido —líneas con descripción, cantidad positiva,
 * unidad no vacía, una operación conocida— y el número de líneas queda acotado.
 * Así una respuesta rota o exagerada no puede romper el editor ni inundar el
 * presupuesto.
 */
export function parseVoiceProposal(raw: unknown): VoiceProposal {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const sectionRaw = typeof obj.section === 'string' ? obj.section.trim() : '';
  const linesRaw = Array.isArray(obj.lines) ? obj.lines : [];

  const lines: VoiceProposalLine[] = [];
  for (const item of linesRaw.slice(0, VOICE_MAX_LINES)) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Record<string, unknown>;
    const description = typeof l.description === 'string' ? l.description.trim() : '';
    if (!description) continue;
    const unit = typeof l.unit === 'string' && l.unit.trim() ? l.unit.trim() : 'ud';
    const anchor = typeof l.anchor === 'string' && l.anchor.trim() ? l.anchor.trim() : null;
    lines.push({
      op: normalizeOp(l.op),
      description,
      quantity: positiveNumber(l.quantity, 1),
      unit,
      anchor,
      source: normalizeSource(l.source),
    });
  }

  return { summary, section: sectionRaw || null, lines };
}

/** Cómo se ve una línea del presupuesto en el prompt: su descripción y su cantidad. */
function lineText(line: VoiceOutlineLine): string {
  const qty = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
  return `${line.description} ×${qty}`;
}

/**
 * Cómo se le enseña a la IA el presupuesto actual: cada sección con sus líneas
 * (descripción y cantidad). Esas descripciones son las candidatas a `anchor` y sus
 * cantidades permiten calcular la cantidad final de un cambio.
 */
function outlineText(outline: VoiceOutlineSection[]): string {
  if (outline.length === 0) return '(todavía no hay secciones)';
  return outline
    .filter((s) => s.section)
    .slice(0, PROMPT_MAX_SECTIONS)
    .map((s) => {
      const lines = s.lines.filter((l) => l.description).slice(0, PROMPT_MAX_LINES_PER_SECTION);
      return lines.length > 0
        ? `- ${s.section}: ${lines.map(lineText).join(' · ')}`
        : `- ${s.section}: (sin líneas todavía)`;
    })
    .join('\n');
}

/** El catálogo de la empresa, para que reconozca el servicio dictado por su nombre. */
function catalogText(catalog: VoiceCatalogEntry[]): string {
  if (catalog.length === 0) return '(tu catálogo está vacío)';
  return catalog
    .slice(0, PROMPT_MAX_CATALOG)
    .map((c) => (c.section ? `- ${c.name} [${c.unit}] (${c.section})` : `- ${c.name} [${c.unit}]`))
    .join('\n');
}

/**
 * El texto que se le manda a OpenAI.
 *
 * Se le da el presupuesto actual —secciones y sus líneas, con la cantidad de cada una—
 * para que decida si el cambio MODIFICA una línea que ya está (y con qué cantidad final),
 * la QUITA, o AÑADE una nueva; y su catálogo para que reconozca el servicio dictado. Se le
 * prohíbe inventar precios: el precio se confirma en el editor, nunca lo pone la IA.
 */
export function voiceChangePrompt(
  transcript: string,
  outline: VoiceOutlineSection[],
  catalog: VoiceCatalogEntry[] = [],
): string {
  return `Eres un experto en reformas del hogar. Un encargado de obra ha dictado un CAMBIO sobre un presupuesto que YA existe. No hay que rehacerlo: hay que interpretar el cambio y decir, para cada cosa, si MODIFICA una línea que ya está, si la QUITA, o si AÑADE una nueva.

Tarea: interpreta lo dictado y devuelve las operaciones que correspondan.

Para cada línea elige una "op":
- "update": el cambio va sobre una línea que YA está en el presupuesto (p. ej. «pon dos más» o «déjalo en cinco»). En "quantity" pon la cantidad FINAL que debe quedar, NO la diferencia. Copia en "anchor" esa línea existente tal cual.
- "remove": el encargado quiere quitar del presupuesto una línea que ya está. Copia en "anchor" esa línea existente tal cual.
- "add": es algo que todavía NO está en el presupuesto. Pon en "source" "catalog" si coincide con una partida del catálogo del encargado, o "new" si no. Si va junto a una línea que ya existe, copia esa línea en "anchor" para que la nueva quede pegada a ella.

Reglas:
- Si el cambio se refiere a una línea que YA figura abajo, usa "update" o "remove", NUNCA la dupliques con "add".
- En "anchor" copia LITERALMENTE la descripción de la línea existente (tal cual aparece abajo); null si el cambio no se refiere a ninguna.
- Escribe descripciones claras en español, en infinitivo ("Instalar 3 enchufes en el salón"), y usa el nombre y la unidad del catálogo cuando encajen.
- Elige en "section" la sección existente donde va el cambio (la del anchor si lo hay). No la dejes en null si puedes deducir a qué sección pertenece: de lo contrario la línea acabaría al final del presupuesto.
- NO inventes precios ni totales: el precio lo confirmará el usuario.
- Si lo dictado no da para ninguna línea, devuelve "lines": [].

Secciones del presupuesto (línea × cantidad actual):
${outlineText(outline)}

Catálogo del encargado:
${catalogText(catalog)}

Devuelve ÚNICAMENTE un JSON con este formato:
{ "summary": "resumen corto del cambio", "section": "nombre de la sección o null", "lines": [ { "op": "add|update|remove", "description": "…", "quantity": 1, "unit": "ud", "anchor": "línea existente o null", "source": "catalog|new|null" } ] }

Texto dictado:
"""${transcript}"""`;
}

/**
 * La línea del editor que propone la IA. Nace sin precio y con el marcador
 * «por confirmar», igual que una nota convertida, para que nunca pueda llegar a
 * un PDF como si tuviera un precio confirmado. El id se pasa (crypto.randomUUID
 * en el navegador) para que la función siga siendo pura y comprobable en Node.
 */
export function proposalLineToRow(
  line: VoiceProposalLine,
  section: string | null,
  id: string,
  position = 0,
): EstimateRow {
  return {
    id,
    type: 'item',
    position,
    phase_name_snapshot: section,
    service_name_snapshot: `${line.description} (${PRICE_TO_CONFIRM})`,
    unit_snapshot: line.unit,
    price_snapshot: 0,
    client_note: null,
    quantity: line.quantity,
    total: 0,
  };
}

/**
 * La línea del editor cuando el servicio dictado SÍ está en el catálogo de la empresa:
 * hereda su nombre, su unidad y —esta vez sí— su precio. Así un cambio que dice «pon un
 * plato de ducha» entra al presupuesto con el precio de catálogo en lugar de «por
 * confirmar». Una descripción libre (sin partida en el catálogo) sigue yendo por
 * `proposalLineToRow`. El id se pasa para que la función siga siendo pura.
 */
export function catalogLineToRow(
  line: VoiceProposalLine,
  section: string | null,
  service: CatalogService,
  id: string,
  position = 0,
): EstimateRow {
  const quantity = line.quantity > 0 ? line.quantity : 1;
  return {
    id,
    type: 'item',
    position,
    phase_name_snapshot: section,
    service_name_snapshot: service.name,
    unit_snapshot: service.unit,
    price_snapshot: service.base_price,
    client_note: null,
    quantity,
    total: service.base_price * quantity,
  };
}

/**
 * Índice de la línea de presupuesto que habla del mismo trabajo que `text`, o -1 si
 * ninguna. Sólo mira líneas de tipo `item` y usa la misma contención que el anclaje
 * (`sameWork`): «bañera» encuentra «Bañera blanca 170 cm».
 */
export function findExistingLine(rows: EstimateRow[], text: string): number {
  if (!text) return -1;
  return rows.findIndex(
    (r) => r.type === 'item' && !!r.service_name_snapshot && sameWork(text, r.service_name_snapshot),
  );
}

/**
 * La partida del catálogo de la empresa que corresponde a lo dictado: primero por nombre
 * exacto (ignorando acentos y mayúsculas) y, si no, por contención con el mismo mínimo que
 * el anclaje. Devuelve null cuando ninguna encaja: entonces la línea se añade «por
 * confirmar». El veredicto de la IA (`source`) es sólo una pista; manda esta comparación
 * determinista, para que no pueda colar como «nueva» algo que ya está en el catálogo.
 *
 * Vive aquí, y no en `catalog-match`, porque el editor la usa en el navegador:
 * `catalog-match` arrastra el catálogo por defecto y no debe viajar al cliente. Sólo se
 * necesita `catalogKey`, que sí es seguro en cliente.
 */
export function resolveCatalogMatch(text: string, catalog: CatalogService[]): CatalogService | null {
  const key = catalogKey(text);
  if (!key) return null;

  const exact = catalog.find((s) => catalogKey(s.name) === key);
  if (exact) return exact;

  if (key.length >= MIN_MATCH_LENGTH) {
    const contained = catalog.find((s) => catalogKey(s.name).includes(key));
    if (contained) return contained;
  }

  return (
    catalog.find((s) => {
      const sk = catalogKey(s.name);
      return sk.length >= MIN_MATCH_LENGTH && key.includes(sk);
    }) ?? null
  );
}

/** Un nombre más corto que esto nunca casa por contención: «bañera» sí, «luz» no. */
const MIN_MATCH_LENGTH = 6;

/**
 * ¿Dos descripciones hablan del mismo trabajo? Igual que la contención de secciones:
 * mismos caracteres significativos, o uno contenido en el otro cuando es largo.
 */
function sameWork(a: string, b: string): boolean {
  const keyA = catalogKey(a);
  const keyB = catalogKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  if (keyA.length >= MIN_MATCH_LENGTH && keyB.includes(keyA)) return true;
  if (keyB.length >= MIN_MATCH_LENGTH && keyA.includes(keyB)) return true;
  return false;
}

/**
 * Índice del array de líneas donde se inserta un cambio dictado, para que quede
 * «pegado» al servicio al que se refiere en lugar de caer al final del presupuesto:
 *
 * 1. Si trae `anchor` (una línea existente), justo debajo de ella.
 * 2. Si sólo trae `section`, al final de las líneas de esa sección.
 * 3. Sin pistas, al final del presupuesto (el comportamiento de siempre).
 *
 * Vive aquí, y no en `catalog-match`, porque este módulo también lo usa el editor en
 * el navegador: `catalog-match` arrastra el catálogo por defecto y no debe viajar al
 * cliente. Sólo se necesita `catalogKey`, que sí es seguro en cliente.
 */
export function voiceInsertionIndex(
  rows: EstimateRow[],
  section: string | null,
  anchor: string | null,
): number {
  if (anchor) {
    const at = rows.findIndex(
      (r) => r.type === 'item' && !!r.service_name_snapshot && sameWork(anchor, r.service_name_snapshot),
    );
    if (at >= 0) return at + 1;
  }

  if (section) {
    const start = rows.findIndex(
      (r) => r.type === 'phase' && !!r.phase_name_snapshot && sameWork(section, r.phase_name_snapshot),
    );
    if (start >= 0) {
      // La sección llega hasta la siguiente cabecera: se inserta tras su última línea.
      let end = start + 1;
      for (let i = start + 1; i < rows.length; i++) {
        if (rows[i].type === 'phase') break;
        end = i + 1;
      }
      return end;
    }
  }

  return rows.length;
}

/**
 * Aplica al presupuesto las líneas que devolvió la IA y devuelve las filas resultantes.
 * Es pura (el id lo genera `mkId`, `crypto.randomUUID` en el navegador) para poder
 * probarla en Node sin base de datos ni DOM.
 *
 * - `add`   : crea una línea. Si el dictado casa con el catálogo, hereda su nombre, su
 *             unidad y su precio; si no, nace «por confirmar» a precio 0. Se coloca con
 *             `voiceInsertionIndex`, pegada al servicio al que se refiere: primero por el
 *             `anchor` de la IA y, si ésta no lo trae, por la propia descripción de la
 *             línea, para que «añade dos enchufes» caiga bajo el «Enchufes» que ya existe
 *             en lugar de al final del presupuesto.
 * - `update`: fija la cantidad FINAL de la línea que refiere (por `anchor`, o por su
 *             descripción). Si esa línea no existe, no se pierde el cambio: se añade.
 * - `remove`: quita del presupuesto la línea que refiere.
 *
 * Las operaciones se aplican en orden sobre el array en curso, así que varias líneas
 * seguidas (añadir algo y luego ajustarlo) se resuelven de forma coherente.
 */
export function applyVoiceOps(
  rows: EstimateRow[],
  lines: VoiceProposalLine[],
  section: string | null,
  catalog: CatalogService[],
  mkId: () => string,
): EstimateRow[] {
  const next = [...rows];

  for (const line of lines) {
    const target = line.anchor || line.description;

    if (line.op === 'remove') {
      const at = findExistingLine(next, target);
      if (at >= 0) next.splice(at, 1);
      continue;
    }

    if (line.op === 'update') {
      const at = findExistingLine(next, target);
      if (at >= 0) {
        const row = next[at];
        const quantity = line.quantity > 0 ? line.quantity : row.quantity;
        next[at] = { ...row, quantity, total: quantity * (row.price_snapshot ?? 0) };
        continue;
      }
      // La línea que dice modificar no está: se añade, para no perder el cambio.
    }

    // Colocar pegado al servicio al que se refiere. La IA suele traer `anchor`, pero cuando
    // no lo manda la descripción sirve de anclaje de reserva: si nombra una línea que ya
    // existe, el cambio se cuelga de ella; si no casa con nada, se cae a la sección.
    const at = voiceInsertionIndex(next, section, line.anchor || line.description);
    const match = resolveCatalogMatch(line.description, catalog);
    const newRow = match
      ? catalogLineToRow(line, section, match, mkId(), at)
      : proposalLineToRow(line, section, mkId(), at);
    next.splice(at, 0, newRow);
  }

  return next;
}
