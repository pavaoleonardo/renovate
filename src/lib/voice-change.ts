import { EstimateRow, VoiceProposal, VoiceProposalLine } from '@/types';
import { PRICE_TO_CONFIRM } from '@/lib/pending-notes';

/** Un cambio dictado no debería convertirse en un presupuesto entero. */
export const VOICE_MAX_LINES = 20;

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
    lines.push({ description, quantity: positiveNumber(l.quantity, 1), unit });
  }

  return { summary, section: sectionRaw || null, lines };
}

/**
 * El texto que se le manda a OpenAI. Se le dan las secciones que ya tiene el
 * presupuesto para que reutilice una si encaja, y se le prohíbe inventar
 * precios: el precio se confirma en el editor, nunca lo pone la IA.
 */
export function voiceChangePrompt(transcript: string, sections: string[]): string {
  const sectionList = sections.length > 0 ? sections.join(', ') : '(todavía no hay secciones)';
  return `Eres un experto en reformas del hogar. Un encargado de obra ha dictado un cambio que hay que incorporar a un presupuesto.

Tarea: interpreta lo dictado y propón las líneas de presupuesto que correspondan.

Reglas:
- Escribe descripciones claras en español, en infinitivo ("Instalar 3 enchufes en el salón").
- Reutiliza una de las secciones existentes si encaja; si ninguna vale, devuelve section como null.
- NO inventes precios ni totales: el precio lo confirmará el usuario.
- Si lo dictado no da para ninguna línea, devuelve "lines": [].

Secciones del presupuesto: ${sectionList}

Devuelve ÚNICAMENTE un JSON con este formato:
{ "summary": "resumen corto del cambio", "section": "nombre de la sección o null", "lines": [ { "description": "…", "quantity": 1, "unit": "ud" } ] }

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
