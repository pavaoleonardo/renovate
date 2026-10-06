"use client";

import { PendingNote } from '@/types';
import { Check, Trash2 } from 'lucide-react';

/**
 * "Cambios de esta obra": the changes captured while the work is going on.
 * Internal only — nothing here is printed on the client PDF until the user
 * converts a note into a line of the budget.
 *
 * Notes get in through the single voice box above («Guardar como cambio»); this panel
 * just lists them and lets the user convert or dismiss each one.
 */
export default function PendingNotesPanel({
  notes,
  onConvert,
  onDismiss,
}: {
  notes: PendingNote[];
  onConvert: (note: PendingNote) => void | Promise<void>;
  onDismiss: (note: PendingNote) => void | Promise<void>;
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-black text-amber-900 uppercase tracking-wider">Cambios de esta obra</h2>
        {notes.length > 0 && (
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {notes.length} sin resolver
          </span>
        )}
      </div>
      <p className="text-xs text-amber-800/80 font-medium mb-3">
        Cambios apuntados durante la obra. No aparecen en el PDF hasta que los conviertas en una línea. Dicta uno nuevo en el cuadro de arriba y elige «Guardar como cambio».
      </p>

      {notes.length === 0 ? (
        <p className="text-xs text-amber-700/70 font-medium italic">Nada pendiente por ahora.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-3 bg-white rounded-lg border border-amber-100 px-3 py-2">
              <span className="flex-1 text-sm text-zinc-700 font-medium">
                {note.text}
                {note.section && <span className="text-xs text-amber-600 font-bold"> · {note.section}</span>}
              </span>
              <button
                type="button"
                onClick={() => onConvert(note)}
                title="Convertir en una línea del presupuesto"
                className="shrink-0 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-md transition"
              >
                <Check size={14} /> Convertir
              </button>
              <button
                type="button"
                onClick={() => onDismiss(note)}
                title="Descartar"
                className="shrink-0 p-1 text-zinc-400 hover:text-red-500 transition"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
