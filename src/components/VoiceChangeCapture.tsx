"use client";

import { useState } from 'react';
import { Sparkles, Plus, Trash2, Save, CornerDownRight } from 'lucide-react';
import { VoiceProposalLine } from '@/types';
import type { VoiceOutlineSection, VoiceCatalogEntry } from '@/lib/voice-change';
import { appendTranscript } from '@/lib/speech';
import VoiceButton from './VoiceButton';

/**
 * «Dictar un cambio»: el flujo voz → texto → propuesta.
 *
 * El dictado ocurre en el navegador (el audio no sale del dispositivo). El texto se
 * le manda a la IA junto al presupuesto actual (secciones y sus líneas) y al
 * catálogo de la empresa, para que el cambio se pegue al servicio al que se refiere
 * en lugar de caer al final. Aquí el usuario lo revisa y decide: guardarlo como
 * cambio pendiente («Cambios de esta obra») o añadir las líneas al presupuesto.
 * Nada entra en el presupuesto sin pasar por esta pantalla.
 */
export default function VoiceChangeCapture({
  outline,
  catalog,
  onAddNote,
  onAddLines,
}: {
  outline: VoiceOutlineSection[];
  catalog: VoiceCatalogEntry[];
  onAddNote: (text: string, hint?: { section?: string | null; quantity?: number | null }) => void | Promise<void>;
  onAddLines: (lines: VoiceProposalLine[], section: string | null) => void;
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

  const addLines = () => {
    const clean = (lines || []).filter((l) => l.description.trim());
    if (clean.length === 0) return;
    onAddLines(clean, section);
    reset();
  };

  const updateLine = (index: number, patch: Partial<VoiceProposalLine>) => {
    setLines((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  const hasProposal = lines !== null;

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-blue-600" />
        <h2 className="text-sm font-black text-zinc-800 uppercase tracking-wider">Dictar un cambio</h2>
      </div>
      <p className="text-xs text-zinc-500 font-medium mb-3">
        Cuéntalo con tus palabras. Se transcribe en tu dispositivo y la IA propone las líneas; tú decides qué entra en el presupuesto.
      </p>

      <div className="flex items-start gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Ej.: hay que poner tres enchufes más en el salón y tapar un agujero en el pasillo…"
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
              <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Líneas propuestas</label>
              <ul className="flex flex-col gap-2">
                {lines.map((line, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        className="flex-1 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-800"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        className="w-16 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-800 text-right tabular-nums"
                      />
                      <input
                        value={line.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        className="w-14 px-2 py-1.5 rounded-md border border-zinc-200 text-sm text-zinc-800"
                      />
                      <button type="button" onClick={() => removeLine(i)} className="p-1 text-zinc-400 hover:text-red-500 transition">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {line.anchor && (
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500 font-medium pl-1">
                        <CornerDownRight size={12} /> se colocará bajo «{line.anchor}»
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addLines}
                className="mt-3 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg font-bold text-sm transition active:scale-95"
              >
                <Plus size={15} /> Añadir {lines.filter((l) => l.description.trim()).length} línea(s) al presupuesto
              </button>
              <p className="text-[10px] text-zinc-400 font-medium mt-2">
                Entran sin precio y marcadas «por confirmar»: ponles importe en la tabla antes de enviar el presupuesto.
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
