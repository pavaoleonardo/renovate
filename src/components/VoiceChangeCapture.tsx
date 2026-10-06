"use client";

import { useState } from 'react';
import { Sparkles, Plus, Trash2, Save, CornerDownRight } from 'lucide-react';
import { VoiceProposalLine } from '@/types';
import type { VoiceOutlineSection, VoiceCatalogEntry } from '@/lib/voice-change';
import { catalogKey } from '@/lib/catalog-key';
import { appendTranscript } from '@/lib/speech';
import VoiceButton from './VoiceButton';

/** Cómo se llama cada operación en la revisión del cambio. */
const OP_LABELS: Record<VoiceProposalLine['op'], string> = {
  add: 'Añadir',
  update: 'Cambiar cantidad',
  remove: 'Quitar',
};

/**
 * El único cuadro de voz del editor: «Dictar un cambio».
 *
 * De un solo dictado la IA decide, por cada cosa, si MODIFICA una línea que ya está en el
 * presupuesto, la QUITA, o AÑADE una nueva. Aquí el usuario lo revisa —puede cambiar la
 * operación, la descripción o la cantidad— y decide: aplicar todo al presupuesto, o
 * guardarlo como cambio pendiente («Cambios de esta obra»). Nada entra sin pasar por esta
 * pantalla. El dictado ocurre en el navegador; sólo el texto llega a la IA.
 */
export default function VoiceChangeCapture({
  outline,
  catalog,
  onAddNote,
  onApply,
}: {
  outline: VoiceOutlineSection[];
  catalog: VoiceCatalogEntry[];
  onAddNote: (text: string, hint?: { section?: string | null; quantity?: number | null }) => void | Promise<void>;
  onApply: (lines: VoiceProposalLine[], section: string | null) => void;
}) {
  const sections = outline.map((s) => s.section);
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [lines, setLines] = useState<VoiceProposalLine[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setText('');
    setSummary(null);
    setSection(null);
    setLines(null);
    setError(null);
  };

  const analyze = async () => {
    const transcript = text.trim();
    if (!transcript || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/voice-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, outline, catalog }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No se pudo analizar el cambio.');
        return;
      }
      setSummary(json.proposal?.summary || transcript);
      setSection(json.proposal?.section ?? null);
      setLines(json.proposal?.lines ?? []);
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveAsNote = async () => {
    const value = (summary || text).trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onAddNote(value, { section });
      reset();
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const clean = (lines || []).filter((l) => l.description.trim());
    if (clean.length === 0) return;
    onApply(clean, section);
    reset();
  };

  const updateLine = (index: number, patch: Partial<VoiceProposalLine>) => {
    setLines((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  /** Cantidad actual de la línea que refiere, para poder mostrar «3 → 5». */
  const currentQuantity = (line: VoiceProposalLine): number | null => {
    const key = catalogKey(line.anchor || line.description);
    if (!key) return null;
    for (const s of outline) {
      for (const l of s.lines) {
        if (catalogKey(l.description) === key) return l.quantity;
      }
    }
    return null;
  };

  const hasProposal = lines !== null;
  const cleanCount = (lines || []).filter((l) => l.description.trim()).length;

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-blue-600" />
        <h2 className="text-sm font-black text-zinc-800 uppercase tracking-wider">Dictar un cambio</h2>
      </div>
      <p className="text-xs text-zinc-500 font-medium mb-3">
        Cuéntalo con tus palabras: cambiar una cantidad, añadir algo o quitar una línea. Se transcribe en tu
        dispositivo y la IA propone las operaciones; tú las revisas antes de aplicar nada.
      </p>

      <div className="flex items-start gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Ej.: pon tres enchufes más en el salón, cambia las puertas a cinco y quita la bañera…"
          className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y"
        />
        <VoiceButton onTranscript={(chunk) => setText((prev) => appendTranscript(prev, chunk))} className="h-[42px]" />
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          onClick={analyze}
          disabled={analyzing || !text.trim()}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold text-sm transition disabled:opacity-50 active:scale-95"
        >
          <Sparkles size={15} /> {analyzing ? 'Analizando…' : 'Analizar con IA'}
        </button>
        <button
          type="button"
          onClick={saveAsNote}
          disabled={busy || !(summary || text).trim()}
          className="flex items-center gap-1.5 bg-white border border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:border-zinc-300 px-3 py-2 rounded-lg font-bold text-sm transition disabled:opacity-50 active:scale-95"
        >
          <Save size={15} /> Guardar como cambio
        </button>
        {hasProposal && (
          <button
            type="button"
            onClick={reset}
            className="ml-auto text-xs font-bold text-zinc-400 hover:text-zinc-600 self-center"
          >
            Descartar
          </button>
        )}
      </div>

      {error && <p className="text-xs font-bold text-red-500 mt-2">{error}</p>}

      {hasProposal && (
        <div className="mt-3 bg-white border border-zinc-100 rounded-lg p-3">
          {summary && <p className="text-sm font-bold text-zinc-800 mb-2">{summary}</p>}

          <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Sección</label>
          <select
            value={section ?? ''}
            onChange={(e) => setSection(e.target.value || null)}
            className="w-full mb-3 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-700 bg-white"
          >
            <option value="">Sin sección</option>
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {lines && lines.length > 0 ? (
            <>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Operaciones propuestas</label>
              <ul className="flex flex-col gap-2">
                {lines.map((line, i) => {
                  const isAdd = line.op === 'add';
                  const isUpdate = line.op === 'update';
                  const isRemove = line.op === 'remove';
                  const current = isUpdate ? currentQuantity(line) : null;
                  return (
                    <li key={i} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <select
                          value={line.op}
                          onChange={(e) => updateLine(i, { op: e.target.value as VoiceProposalLine['op'] })}
                          className="shrink-0 px-1.5 py-1.5 rounded-md border border-zinc-200 text-xs font-bold text-zinc-600 bg-zinc-50"
                        >
                          {(Object.keys(OP_LABELS) as VoiceProposalLine['op'][]).map((op) => (
                            <option key={op} value={op}>{OP_LABELS[op]}</option>
                          ))}
                        </select>

                        {isAdd ? (
                          <input
                            value={line.description}
                            onChange={(e) => updateLine(i, { description: e.target.value })}
                            placeholder="Qué hay que hacer"
                            className="flex-1 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-800"
                          />
                        ) : (
                          <input
                            value={line.anchor || line.description}
                            onChange={(e) => updateLine(i, { anchor: e.target.value, description: e.target.value })}
                            placeholder="Línea del presupuesto"
                            className="flex-1 px-2 py-1.5 rounded-md border border-amber-200 bg-amber-50/40 text-sm text-zinc-800"
                          />
                        )}

                        {!isRemove && (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                            className="w-16 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-800 text-right tabular-nums"
                          />
                        )}

                        {isAdd && (
                          <input
                            value={line.unit}
                            onChange={(e) => updateLine(i, { unit: e.target.value })}
                            className="w-14 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-800"
                          />
                        )}

                        <button type="button" onClick={() => removeLine(i)} className="p-1 text-zinc-400 hover:text-red-500 transition" title="Descartar esta operación">
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {isAdd && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500 font-medium pl-1">
                          {line.source === 'catalog'
                            ? <span className="text-emerald-600 font-bold">Precio de catálogo si coincide</span>
                            : line.source === 'new'
                              ? <span className="text-amber-600 font-bold">Línea nueva · «por confirmar»</span>
                              : <span>Se busca en el catálogo; si no está, entra «por confirmar»</span>}
                          {line.anchor && (<><CornerDownRight size={12} /> se colocará bajo «{line.anchor}»</>)}
                        </span>
                      )}

                      {isUpdate && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500 font-medium pl-1">
                          <CornerDownRight size={12} />
                          {current !== null
                            ? <>«{line.anchor || line.description}»: {current} → {line.quantity}</>
                            : <>«{line.anchor || line.description}» no está en el presupuesto: se añadirá como línea nueva</>}
                        </span>
                      )}

                      {isRemove && (
                        <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium pl-1">
                          <CornerDownRight size={12} /> se quitará del presupuesto
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={apply}
                disabled={cleanCount === 0}
                className="mt-3 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-bold text-sm transition active:scale-95 disabled:opacity-50"
              >
                <Plus size={15} /> Aplicar al presupuesto ({cleanCount})
              </button>
              <p className="text-[10px] text-zinc-400 font-medium mt-2">
                Lo que coincide con tu catálogo entra con su precio; el resto entra sin precio y marcado «por confirmar».
                Revisa siempre antes de enviar el presupuesto.
              </p>
            </>
          ) : (
            <p className="text-xs text-zinc-500 font-medium italic">
              La IA no ha visto líneas de presupuesto claras. Guárdalo como cambio y decídelo al editarlo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
