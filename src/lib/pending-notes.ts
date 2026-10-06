import { EstimateRow, PendingNote } from '@/types';

/** Suffix a line carries while nobody has confirmed its price. */
export const PRICE_TO_CONFIRM = 'por confirmar';

/**
 * Builds the editor line a captured note becomes. The note's text is the
 * description and, when there is no price yet, the description carries the
 * "por confirmar" marker so an unpriced line can never slip into a PDF as if it
 * had been confirmed.
 *
 * The id is passed in (crypto.randomUUID() in the browser) to keep this a pure
 * function: the tests run in Node with no DOM.
 */
export function pendingToRow(note: PendingNote, id: string): EstimateRow {
  const hasPrice = typeof note.price === 'number' && Number.isFinite(note.price);
  const price = hasPrice ? (note.price as number) : 0;
  const quantity =
    typeof note.quantity === 'number' && Number.isFinite(note.quantity) && note.quantity > 0
      ? note.quantity
      : 1;
  const name = hasPrice ? note.text : `${note.text} (${PRICE_TO_CONFIRM})`;

  return {
    id,
    type: 'item',
    position: 0,
    phase_name_snapshot: null,
    service_name_snapshot: name,
    unit_snapshot: 'un',
    price_snapshot: price,
    client_note: null,
    quantity,
    total: price * quantity,
  };
}

/** Notes still waiting, oldest first (they arrive ordered by the server). */
export function openNotes(notes: PendingNote[]): PendingNote[] {
  return notes.filter((n) => n.status === 'open');
}
