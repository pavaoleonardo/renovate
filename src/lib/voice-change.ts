import { EstimateRow, VoiceProposal, VoiceProposalLine } from '@/types';
import { PRICE_TO_CONFIRM } from '@/lib/pending-notes';
import { catalogKey } from '@/lib/catalog-key';

/** Un cambio dictado no debería convertirse en un presupuesto entero. */
export const VOICE_MAX_LINES = 20;

/**
 * Una sección del presupuesto con las descripciones de sus líneas actuales. Es el
 * contexto que se le da a la IA para que el cambio dictado se pegue al servicio que ya
 * existe (el `anchor`) en lugar de caer al final del presupuesto.
 */
export interface VoiceOutlineSection {
  section: string;
  lines: string[];
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

/**
 * La respuesta de la IA es texto de fuera: hay que tratarla como tal. Sólo
 * sobrevive lo que tiene sentido —líneas con descripción, cantidad positiva,
 * unidad no vacía— y el número de líneas queda acotado. Así una respuesta rota
 * o exagerada no puede romper el editor ni inundar el presupuesto.
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
    lines.push({ description, quantity: positiveNumber(l.quantity, 1), unit, anchor });
  }

  return { summary, section: sectionRaw || null, lines };
}

/**
 * Cómo se le enseña a la IA el presupuesto actual: cada sección con las descripciones
 * de sus líneas, que son las candidatas a `anchor`.
 */
function outlineText(outline: VoiceOutlineSection[]): string {
  if (outline.length === 0) return '(todavía no hay secciones)';
  return outline
    .filter((s) => s.section)
    .slice(0, PROMPT_MAX_SECTIONS)
    .map((s) => {
      const lines = s.lines.filter(Boolean).slice(0, PROMPT_MAX_LINES_PER_SECTION);
      return lines.length > 0
        ? `- ${s.section}: ${lines.join(' · ')}`
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
 * Se le da el presupuesto actual (secciones y sus líneas) para que sitúe el cambio
 * junto al servicio al que se refiere —devolviendo esa línea como `anchor`—, y su
 * catálogo para que reconozca el servicio dictado. Se le prohíbe inventar precios: el
 * precio se confirma en el editor, nunca lo pone la IA.
 */
export function voiceChangePrompt(
  transcript: string,
  outline: VoiceOutlineSection[],
  catalog: VoiceCatalogEntry[] = [],
): string {
  return `Eres un experto en reformas del hogar. Un encargado de obra ha dictado un CAMBIO sobre un presupuesto que YA existe. No hay que rehacer el presupuesto: sólo hay que añadir o ajustar lo que ha cambiado, pegado al servicio al que se refiere.

Tarea: interpreta lo dictado y propón las líneas que correspondan, situándolas donde van.

Reglas:
- Escribe descripciones claras en español, en infinitivo ("Instalar 3 enchufes en el salón").
- Reconoce el servicio en el catálogo del encargado y usa su nombre y su unidad cuando encaje.
- Si el cambio se refiere a un trabajo que YA figura como una línea del presupuesto, devuélvelo en "anchor": una copia EXACTA de esa línea (tal cual aparece abajo). Si no se refiere a ninguna, anchor = null.
- Elige en "section" la sección existente donde va el cambio (la del anchor si lo hay); si ninguna encaja, section = null.
- NO inventes precios ni totales: el precio lo confirmará el usuario.
- Si lo dictado no da para ninguna línea, devuelve "lines": [].

Secciones del presupuesto (con sus líneas actuales):
${outlineText(outline)}

Catálogo del encargado:
${catalogText(catalog)}

Devuelve ÚNICAMENTE un JSON con este formato:
{ "summary": "resumen corto del cambio", "section": "nombre de la sección o null", "lines": [ { "description": "…", "quantity": 1, "unit": "ud", "anchor": "línea existente o null" } ] }

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
