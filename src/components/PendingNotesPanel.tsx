"use client";

import { useState } from 'react';
import { PendingNote } from '@/types';
import { Check, Plus, Trash2 } from 'lucide-react';
import { appendTranscript } from '@/lib/speech';
import VoiceButton from './VoiceButton';

/**
 * "Cambios de esta obra": the changes captured while the work is going on.
 * Internal only — nothing here is printed on the client PDF until the user
 * converts a note into a line of the budget.
 */
export default function PendingNotesPanel({
  notes,
  onAdd,
  onConvert,
  onDismiss,
}: {
  notes: PendingNote[];
  onAdd: (text: string) => void | Promise<void>;
  onConvert: (note: PendingNote) => void | Promise<void>;
  onDismiss: (note: PendingNote) => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await onAdd(clean);
      setText('');
    } finally {
      setBusy(false);
    }
  };

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
        Anota aquí lo que pide el cliente durante la obra. No aparece en el PDF hasta que lo conviertas en una línea.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ej.: añadir 3 enchufes en el salón…"
          className="flex-1 px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <VoiceButton
          onTranscript={(chunk) => setText((prev) => appendTranscript(prev, chunk))}
          title="Dictar la nota"
          className="border-amber-200 hover:border-amber-300"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          className="shrink-0 flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition disabled:opacity-50 active:scale-95"
        >
          <Plus size={16} /> Añadir nota
        </button>
      </div>

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
