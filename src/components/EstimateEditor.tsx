"use client";

import { Fragment, useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Estimate, EstimateRow, CatalogService, Client, EstimateStatus, CompanyProfile, PendingNote, VoiceProposalLine } from '@/types';
import { saveEstimateRows, updateEstimateStatus, updateEstimateInfo, updateEstimateTaxRate, addPendingNote, convertPendingNote, dismissPendingNote, addClient, assignEstimateClient, deleteEstimate } from '@/app/actions';
import { Plus, GripVertical, Trash2, Printer, CheckCircle2, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { computeTotals, normalizeTaxRate, taxHint, taxLabel, TAX_RATE_OPTIONS } from '@/lib/estimate-totals';
import { catalogKey } from '@/lib/catalog-key';
import EstimatePDFPreview from './EstimatePDFPreview';
import AutoGrowTextarea from './AutoGrowTextarea';
import DecimalInput from './DecimalInput';
import PendingNotesPanel from './PendingNotesPanel';
import ConstructionLoader from './ConstructionLoader';
import ConfirmDialog from './ConfirmDialog';
import LoadingOverlay from './LoadingOverlay';
import VoiceChangeCapture from './VoiceChangeCapture';
import MobileLineCard from './MobileLineCard';
import { pendingToRow } from '@/lib/pending-notes';
import { moveItem } from '@/lib/reorder';
import { applyVoiceOps } from '@/lib/voice-change';
import type { VoiceOutlineSection, VoiceCatalogEntry } from '@/lib/voice-change';

/**
 * "+ Añadir Sección..." control. Shared by the empty state (a brand-new budget,
 * where it is the only action available) and by the quick-add bar at the bottom
 * of an existing budget.
 */
function AddSectionControl({
  catalogPhases,
  onAdd,
  size = 'sm'
}: {
  catalogPhases: string[];
  onAdd: (name?: string) => void;
  size?: 'sm' | 'lg';
}) {
  const className = size === 'lg'
    ? 'w-full md:w-auto min-w-0 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 sm:px-6 py-4 rounded-xl transition shadow-sm border-2 border-blue-200 cursor-pointer appearance-none text-center active:scale-[0.99]'
    : 'w-full md:w-auto md:max-w-[220px] min-w-0 text-sm font-bold text-zinc-700 bg-white hover:bg-zinc-50 px-3 md:px-4 py-2 rounded-lg transition shadow-sm border border-zinc-200 cursor-pointer appearance-none pr-8';

  return (
    <select
      className={className}
      value=""
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          onAdd();
        } else {
          onAdd(e.target.value);
        }
        e.target.value = '';
      }}
    >
      <option value="" disabled>{size === 'lg' ? 'Elegir sección…' : '+ Sección'}</option>
      {catalogPhases.map(phaseName => (
        <option key={phaseName} value={phaseName}>{phaseName}</option>
      ))}
      <option value="__custom__">— Sección personalizada</option>
    </select>
  );
}

export default function EstimateEditor({ 
  initialEstimate, 
  initialRows, 
  catalog,
  company,
  clients = [],
  initialPendingNotes = []
}: { 
  initialEstimate: Estimate; 
  initialRows: EstimateRow[]; 
  catalog: CatalogService[];
  company: CompanyProfile | null;
  /** The company's clients, so the header can link this obra to one of them. */
  clients?: Client[];
  initialPendingNotes?: PendingNote[];
}) {
  const [estimate, setEstimate] = useState(initialEstimate);
  const [rows, setRows] = useState(initialRows || []);
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>(initialPendingNotes || []);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [clientBusy, setClientBusy] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragNode_] = useState<HTMLDivElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateDone, setTranslateDone] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(dragNode_);

  // What "saved" means for the unsaved-changes indicator: the last layout the
  // server confirmed. Any edit to `rows` that no longer matches it is unsaved.
  // Snapshot of the last saved rows, as state (not a ref): a successful save updates it,
  // which re-runs the memo below and clears the "Cambios sin guardar" hint. With a ref the
  // memo kept its cached `true` — the edit it compared against never changed.
  const [savedRowsJson, setSavedRowsJson] = useState<string>(() => JSON.stringify(initialRows || []));
  const isDirty = useMemo(() => JSON.stringify(rows) !== savedRowsJson, [rows, savedRowsJson]);

  // Warn before leaving with unsaved lines — closing the tab used to lose the
  // whole budget silently.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  // The wait is a modal, but only once it is a wait: a save that lands in 120 ms must
  // not flash a dialog over the page. Slower than that and the card says what is
  // happening, in the same place as every other blocking job in the app.
  const [showSaveModal, setShowSaveModal] = useState(false);
  useEffect(() => {
    if (!isSaving) {
      setShowSaveModal(false);
      return;
    }
    const timer = setTimeout(() => setShowSaveModal(true), 300);
    return () => clearTimeout(timer);
  }, [isSaving]);

  // Totals recalc
  const calcRowTotal = (r: EstimateRow) => (r.price_snapshot || 0) * (r.quantity || 0);
  const totalAmount = useMemo(() => rows.reduce((acc, r) => acc + calcRowTotal(r), 0), [rows]);

  // Base imponible + the VAT chosen for this budget (0 %, 10 % or 21 %)
  const totals = useMemo(
    () => computeTotals(totalAmount, estimate.tax_rate),
    [totalAmount, estimate.tax_rate]
  );

  /**
   * Catálogo agrupado por sección. La clave ignora acentos y mayúsculas: una
   * sección renombrada a mano tiene que encontrar igualmente sus partidas.
   */
  const catalogByPhase = useMemo(() => {
    const groups = new Map<string, { name: string; services: CatalogService[] }>();
    for (const s of (catalog || [])) {
      const name = s.phase_name || 'Sin categoría';
      const key = catalogKey(name);
      const entry = groups.get(key);
      if (entry) entry.services.push(s);
      else groups.set(key, { name, services: [s] });
    }
    return groups;
  }, [catalog]);

  const catalogPhaseNames = useMemo(
    () => Array.from(catalogByPhase.values()).map(p => p.name),
    [catalogByPhase]
  );

  /**
   * A budget that has just been created has no rows: the first step is always
   * to add a section. The line editor only makes sense once a section exists,
   * because every line belongs to a section.
   */
  const isBlankBudget = rows.length === 0;
  const hasSection = useMemo(() => rows.some(r => r.type === 'phase'), [rows]);

  /**
   * El presupuesto como contexto para la IA: cada sección con sus líneas (descripción y
   * cantidad). Las descripciones son las candidatas a `anchor`, para que un cambio dictado
   * se pegue al servicio al que se refiere; las cantidades permiten calcular la cantidad
   * final de un «cámbialo a…».
   */
  const voiceOutline = useMemo<VoiceOutlineSection[]>(() => {
    const out: VoiceOutlineSection[] = [];
    let current: VoiceOutlineSection | null = null;
    for (const r of rows) {
      if (r.type === 'phase') {
        current = { section: r.phase_name_snapshot || '', lines: [] };
        out.push(current);
      } else if (r.type === 'item' && current && r.service_name_snapshot) {
        current.lines.push({ description: r.service_name_snapshot, quantity: r.quantity || 1 });
      }
    }
    return out.filter(s => s.section);
  }, [rows]);

  /** El catálogo de la empresa recortado (sin precios), para que la IA reconozca el servicio. */
  const voiceCatalog = useMemo<VoiceCatalogEntry[]>(
    () => (catalog || []).map(s => ({ name: s.name, unit: s.unit, section: s.phase_name ?? null })),
    [catalog]
  );

  const addPhase = (name?: string) => {
    setRows([...rows, {
      id: crypto.randomUUID(),
      type: 'phase',
      position: rows.length,
      phase_name_snapshot: name || 'Nueva Sección',
      service_name_snapshot: null,
      unit_snapshot: null,
      price_snapshot: null,
      quantity: 0,
      total: 0
    }]);
  };

  /**
   * Adds an empty line. Without an argument it goes at the end of the budget;
   * with `afterIndex` it is inserted just below that row, which is how a line
   * ends up inside the section you clicked on.
   */
  const addServiceRow = (afterIndex?: number) => {
    const newRow: EstimateRow = {
      id: crypto.randomUUID(),
      type: 'item',
      position: 0, // recomputed on save from the array order
      phase_name_snapshot: null,
      service_name_snapshot: '',
      unit_snapshot: 'un',
      price_snapshot: 0,
      quantity: 1,
      total: 0
    };

    if (afterIndex === undefined) {
      setRows([...rows, newRow]);
      return;
    }

    const next = [...rows];
    next.splice(afterIndex + 1, 0, newRow);
    setRows(next);
  };

  const updateRow = (id: string, updates: Partial<EstimateRow>) => {
    setRows(rows.map(r => {
      if (r.id === id) {
        const nr = { ...r, ...updates };
        nr.total = (nr.quantity ?? 0) * (nr.price_snapshot ?? 0);
        return nr;
      }
      return r;
    }));
  };

  const removeRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  /**
   * The arrows a phone can press. Drag & drop stays the desktop way of moving a
   * line, but HTML5 drag cannot be started with a finger and the grip is hidden on
   * a narrow screen, so the same move needs a button there. The ends are disabled,
   * and `moveItem` refuses them too, so the button and the function cannot disagree.
   */
  const moveRowBy = (index: number, delta: number) => {
    setRows(moveItem(rows, index, index + delta));
  };

  const applyService = (id: string, serviceId: string) => {
    const s = (catalog || []).find(x => x.id === serviceId);
    if (!s) return;
    updateRow(id, {
      service_name_snapshot: s.name,
      unit_snapshot: s.unit,
      price_snapshot: s.base_price
    });
  };

  // Find the parent phase for a given row index
  const getParentPhaseName = (rowIndex: number): string | null => {
    for (let i = rowIndex - 1; i >= 0; i--) {
      if (rows[i]?.type === 'phase') {
        return rows[i].phase_name_snapshot || null;
      }
    }
    return null;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await saveEstimateRows(estimate.id, rows);
      if (!res.success) {
        // A failed upsert (a missing column, a dropped connection…) must be seen,
        // not swallowed: the user has to know the budget did not reach the server.
        setSaveError(res.error || 'No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      setSavedRowsJson(JSON.stringify(rows));
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error de conexión al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  /** Partidas in this budget: the phase rows are section headings, not work. */
  const lineItemCount = rows.filter(r => r.type !== 'phase').length;

  /**
   * Deletes this obra from its editor and walks back to where it lived. The confirm
   * named the partidas; `deleteEstimate(…, { withLines: true })` is the only path that
   * lets them go, and the database removes them with the estimate (ON DELETE CASCADE).
   */
  const handleDeleteEstimate = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteEstimate(estimate.id, { withLines: lineItemCount > 0 });
      if (!res.success) {
        setDeleteError(res.error);
        return;
      }
      setShowDelete(false);
      router.push(estimate.client_id ? `/clients/${estimate.client_id}` : '/clients');
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error de conexión al eliminar.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddPending = async (
    text: string,
    hint: { section?: string | null; quantity?: number | null; price?: number | null } = {}
  ) => {
    const res = await addPendingNote(estimate.id, text, hint);
    if (res.success && res.note) setPendingNotes(prev => [...prev, res.note as PendingNote]);
  };

  // Applies the operations the AI proposed from a dictation (unsaved, so the user reviews
  // them): add a line —with the catalog price when it matches, else «por confirmar»—,
  // change the quantity of an existing line, or remove one. Placement and the catalog
  // match live in the pure `applyVoiceOps`.
  const handleApplyVoice = (lines: VoiceProposalLine[], section: string | null) => {
    // Wrap in an arrow: passing `crypto.randomUUID` bare would lose its `this` receiver and
    // throw "Illegal invocation" the moment `applyVoiceOps` calls it (browser brand check).
    setRows(prev => applyVoiceOps(prev, lines, section, catalog || [], () => crypto.randomUUID()));
  };

  // Converting adds the line to the budget (unsaved, so the user reviews it) and
  // records on the server that the note was used.
  const handleConvertPending = async (note: PendingNote) => {
    setRows(prev => [...prev, pendingToRow(note, crypto.randomUUID())]);
    setPendingNotes(prev => prev.filter(n => n.id !== note.id));
    await convertPendingNote(note.id);
  };

  const handleDismissPending = async (note: PendingNote) => {
    setPendingNotes(prev => prev.filter(n => n.id !== note.id));
    await dismissPendingNote(note.id);
  };

  /**
   * Links this obra to a client (or moves it to another one). The budget keeps the
   * client's name as a snapshot — the PDF and the email print it with no join — and
   * `updateClient()` refreshes it if the client is renamed on its ficha.
   */
  const handleClientChange = async (clientId: string) => {
    if (!clientId) return;
    setClientBusy(true);
    setClientError(null);
    try {
      const updated = await assignEstimateClient(estimate.id, clientId);
      setEstimate(updated);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'No se pudo asignar el cliente.');
    } finally {
      setClientBusy(false);
    }
  };

  /** Creates a client without leaving the obra, and links this budget to it. */
  const handleNewClient = async (name: string, email: string) => {
    const clean = name.trim();
    if (!clean) return;
    setClientBusy(true);
    setClientError(null);
    try {
      const created = await addClient(clean, { email });
      const updated = await assignEstimateClient(estimate.id, created.id);
      setEstimate(updated);
      setShowNewClient(false);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'No se pudo crear el cliente.');
    } finally {
      setClientBusy(false);
    }
  };

  const handleTranslateForClient = async () => {
    setIsTranslating(true);
    setTranslateDone(false);
    setTranslateError(null);
    try {
      const res = await fetch('/api/translate-for-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTranslateError(json.error || 'Error al generar notas');
        return;
      }
      if (json.notes) {
        setRows(rows.map(r => json.notes[r.id] ? { ...r, client_note: json.notes[r.id] } : r));
        setTranslateDone(true);
        setTimeout(() => setTranslateDone(false), 3000);
      }
    } catch {
      setTranslateError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const s = e.target.value as EstimateStatus;
    const res = await updateEstimateStatus(estimate.id, s);
    setEstimate(res.estimate);
  };

  const handleTaxRateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rate = normalizeTaxRate(e.target.value);
    const previous = estimate;
    // Optimistic: the totals in the sticky bar recalc before the round-trip.
    setEstimate({ ...estimate, tax_rate: rate });
    setIsSavingTax(true);
    setTaxError(null);
    try {
      const res = await updateEstimateTaxRate(estimate.id, rate);
      setEstimate(res.estimate);
    } catch (err) {
      setEstimate(previous);
      setTaxError(err instanceof Error ? err.message : 'No se pudo cambiar el IVA.');
    } finally {
      setIsSavingTax(false);
    }
  };

  // Drag & Drop
  const handleDragStart = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = '0.4'; }, 0);
  };
  const handleDragOver = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setDropIndex(index);
  };
  const handleDrop = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newRows = [...rows];
    const [moved] = newRows.splice(dragIndex, 1);
    newRows.splice(index, 0, moved);
    setRows(newRows);
    setDragIndex(null);
    setDropIndex(null);
  };
  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDragIndex(null);
    setDropIndex(null);
    dragNode.current = null;
  };

  return (
    <>
      <div className="no-print-area max-w-shell mx-auto py-6 px-4 sm:py-10 sm:px-6 lg:px-8 min-h-screen pb-32 md:pb-40 flex flex-col">
        
        {/* HEADER ... rest of editor ... */}
        {/* (I'll keep the same structure but ensuring the no-print-area div closes before the modal) */}
        {/* ... */}
        <div className="order-1 bg-white p-4 sm:p-6 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* ... header content ... */}
          <div>
            {/* The client is its own ficha (one client, many obras), so its name is
                chosen here and not typed: renaming it on the ficha updates every
                obra that points at it. */}
            <div className="flex items-start justify-between gap-2 md:justify-start">
              <h1 className="min-w-0 text-2xl font-extrabold leading-tight tracking-tight text-zinc-900 sm:text-3xl">
                {estimate.client_name || 'Sin cliente'}
              </h1>
              {estimate.client_id ? (
                <Link href={`/clients/${estimate.client_id}`} className="mt-0.5 inline-flex shrink-0 items-center min-h-[44px] md:mt-0 text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">
                  Ver ficha
                </Link>
              ) : (
                <span className="shrink-0 text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  sin cliente
                </span>
              )}
            </div>
            <div className="mt-3 md:max-w-[320px]">
              {/* On a phone the picker gets the whole width: sharing a row with
                  «+ Nuevo cliente» left it 180px wide and cut «Cliente Prueba
                  Movil 13:51:09» to «Cliente Prueba Movil 13». */}
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="estimate-client" className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Cliente
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewClient(v => !v)}
                    className="inline-flex items-center min-h-[44px] md:min-h-0 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded-lg transition whitespace-nowrap"
                  >
                    + Nuevo cliente
                  </button>
                  {clientBusy && <ConstructionLoader size="sm" />}
                </div>
              </div>
              <select
                id="estimate-client"
                value={estimate.client_id || ''}
                onChange={(e) => handleClientChange(e.target.value)}
                disabled={clientBusy}
                title="Cliente al que pertenece esta obra"
                className="mt-1 w-full md:max-w-[240px] text-sm md:text-xs font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg py-1.5 pl-3 md:pl-2 pr-7 min-h-[44px] md:min-h-0 transition cursor-pointer disabled:opacity-50"
              >
                <option value="" disabled>
                  {clients.length === 0 ? 'No hay clientes todavía' : 'Elegir cliente…'}
                </option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {clientError && <p className="text-[10px] font-bold text-red-500 px-2 mt-1">{clientError}</p>}
            {showNewClient && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  handleNewClient((data.get('name') as string) || '', (data.get('email') as string) || '');
                }}
                className="flex items-center gap-2 mt-2 mx-2 p-2 bg-blue-50/60 border border-blue-100 rounded-lg flex-wrap"
              >
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Nombre del cliente..."
                  className="flex-1 min-w-[140px] px-2 py-1.5 bg-white border border-zinc-200 rounded-md text-sm font-medium focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email (opcional)"
                  className="flex-1 min-w-[140px] px-2 py-1.5 bg-white border border-zinc-200 rounded-md text-sm font-medium focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <button
                  type="submit"
                  disabled={clientBusy}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition disabled:opacity-50"
                >
                  Crear y asignar
                </button>
              </form>
            )}
            <div className="flex items-center gap-1 mt-1">
              <span className="text-zinc-400 pl-2">📍</span>
              <input
                className="text-zinc-500 font-medium bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg px-2 py-1 w-full transition"
                value={estimate.property_address}
                onChange={(e) => setEstimate({ ...estimate, property_address: e.target.value })}
                onBlur={() => updateEstimateInfo(estimate.id, { property_address: estimate.property_address })}
                placeholder="Dirección de la obra"
              />
            </div>
            
            {estimate.status === 'approved' && estimate.warranty_end_date && (
              <div className="mt-4 flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1.5 rounded-lg text-sm font-bold border border-green-200 shadow-sm w-fit">
                <CheckCircle2 size={18} />
                Garantía activa hasta: {estimate.warranty_end_date}
              </div>
            )}
          </div>
          <div className="w-full md:w-auto md:flex md:flex-col md:items-end md:gap-3">
            {/* Estado + IVA share one row on a phone, each with its label above the
                field: two right-aligned label/select pairs of different widths read
                as a staircase at 320px. */}
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-col md:items-end md:gap-3">
              <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 md:text-sm">Estado</span>
                <select
                  value={estimate.status}
                  onChange={handleStatusChange}
                  className="h-11 w-full rounded-lg border-zinc-200 bg-white px-3 text-base font-bold text-zinc-800 shadow-sm transition focus:border-blue-500 focus:ring-blue-500 md:h-auto md:w-auto md:py-2 md:pl-4 md:pr-10 md:text-sm"
                >
                  <option value="draft">Pendiente</option>
                  <option value="sent">Enviado</option>
                  <option value="approved">Aceptado</option>
                  <option value="rejected">Rechazado</option>
                  <option value="in_progress">En Curso</option>
                  <option value="completed">Completado</option>
                  <option value="expired">Caducado</option>
                </select>
              </div>

              <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 md:text-sm">IVA</span>
                <select
                  value={totals.taxRate}
                  onChange={handleTaxRateChange}
                  disabled={isSavingTax}
                  title={taxHint(totals.taxRate)}
                  className="h-11 w-full rounded-lg border-zinc-200 bg-white px-3 text-base font-bold text-zinc-800 shadow-sm transition focus:border-blue-500 focus:ring-blue-500 md:h-auto md:w-auto md:py-2 md:pl-4 md:pr-10 md:text-sm disabled:opacity-50"
                >
                  {TAX_RATE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 md:mt-0">
              {taxHint(totals.taxRate)}
              {isSavingTax && <ConstructionLoader size="sm" />}
            </p>
            {taxError && (
              <p className="mt-1 max-w-[260px] text-[10px] font-bold text-red-500 md:text-right">{taxError}</p>
            )}

            {/* Export and the way out share one row: a 44px button and a 44px trash on
                a phone, the same two right-aligned on a desk. The trash never deletes on
                its own — it opens a dialog that names the partidas going with the obra. */}
            <div className="mt-3 flex items-stretch gap-2 md:mt-0 md:items-center md:justify-end">
              <button
                onClick={() => setShowPreview(true)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-900 md:min-h-0 md:w-auto md:flex-none"
              >
                <Printer size={18} /> Exportar PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setShowDelete(true);
                }}
                title="Eliminar esta obra"
                aria-label="Eliminar esta obra"
                className="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 hover:text-red-700 active:scale-95 md:min-h-0 md:h-auto md:w-9"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* On a phone the budget itself comes first: the two helper panels (dictation
            and captured changes) sat between the header and the lines, pushing the
            first line 800px down the screen. */}
        <div className="order-3 md:order-2">
          <VoiceChangeCapture
            outline={voiceOutline}
            catalog={voiceCatalog}
            onAddNote={handleAddPending}
            onApply={handleApplyVoice}
          />
        </div>

        <div className="order-4 md:order-3">
          <PendingNotesPanel
            notes={pendingNotes}
            onConvert={handleConvertPending}
            onDismiss={handleDismissPending}
          />
        </div>

        {/* DOCUMENT ROWS */}
        <div className="order-2 md:order-4 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 overflow-hidden">
          {isBlankBudget ? (
            <div className="p-6 sm:p-10 md:p-14 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <Plus size={22} />
              </div>
              <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight">Empieza por una sección</h3>
              <p className="text-sm text-zinc-500 font-medium mt-2 max-w-md mx-auto leading-relaxed">
                Elige una sección del catálogo o crea una personalizada. En cuanto exista la sección
                aparecerán sus líneas para ir añadiendo los servicios.
              </p>

              <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3">
                <AddSectionControl catalogPhases={catalogPhaseNames} onAdd={addPhase} size="lg" />
                <button
                  type="button"
                  onClick={() => addPhase()}
                  className="text-sm font-bold text-zinc-700 bg-white hover:bg-zinc-50 px-6 py-4 rounded-xl transition shadow-sm border-2 border-zinc-200 active:scale-[0.99]"
                >
                  + Sección personalizada
                </button>
              </div>

              {catalogPhaseNames.length === 0 && (
                <p className="text-xs text-zinc-400 font-medium mt-4">
                  Tu catálogo todavía no tiene secciones.{' '}
                  <a href="/catalog" className="text-blue-600 font-bold hover:underline">
                    Carga servicios en el catálogo
                  </a>{' '}
                  para poder elegir la sección desde aquí.
                </p>
              )}
            </div>
          ) : (
            <>
          {/* On phones each line is a stacked card; from md up it is the 8-column table. */}
          <div>
          <div className="hidden md:grid grid-cols-[30px_1fr_60px_100px_80px_100px_30px] gap-3 p-3 bg-zinc-50/80 border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-widest items-center">
            <div></div>
            <div>Descripción del ítem</div>
            <div className="text-center">Unid</div>
            <div className="text-right">Precio</div>
            <div className="text-center">Cant</div>
            <div className="text-right">Total</div>
            <div></div>
          </div>

          <div className="divide-y divide-zinc-100">
            {(rows || []).map((row, rowIndex) => {
              /**
               * Cada línea pertenece a la sección que tiene encima: es la única
               * sección cuyas partidas puede ofrecer su desplegable.
               */
              const parentPhase = getParentPhaseName(rowIndex);
              const sectionServices = parentPhase
                ? (catalogByPhase.get(catalogKey(parentPhase))?.services ?? [])
                : [];

              if (row.type === 'phase') {
                return (
                  <div 
                    key={row.id}
                    draggable
                    onDragStart={(e) => handleDragStart(rowIndex, e)}
                    onDragOver={(e) => handleDragOver(rowIndex, e)}
                    onDrop={(e) => handleDrop(rowIndex, e)}
                    onDragEnd={handleDragEnd}
                    className={`flex flex-wrap items-center gap-x-1 gap-y-0 md:grid md:grid-cols-[30px_1fr_auto] md:gap-3 p-3 md:p-2 bg-blue-50/40 hover:bg-blue-50/80 group transition ${dropIndex === rowIndex ? 'border-t-2 border-blue-500' : ''}`}
                  >
                    {/* The grip is a mouse affordance: HTML5 drag cannot be started by a
                        finger, so on a phone it is not rendered instead of sitting there
                        doing nothing. Moving a whole section — its lines follow the
                        header — is still to come. */}
                    <div className="hidden md:flex text-center cursor-grab active:cursor-grabbing text-zinc-300 hover:text-blue-500"><GripVertical size={18}/></div>
                    <input 
                      className="w-full md:w-auto min-w-0 font-extrabold text-base md:text-xl text-blue-900 bg-transparent border-none focus:ring-2 focus:ring-blue-200 rounded-md px-1 md:px-2 py-1 placeholder:text-blue-300 transition"
                      value={row.phase_name_snapshot || ''}
                      onChange={(e) => updateRow(row.id, { phase_name_snapshot: e.target.value })}
                      placeholder="Nombre de Sección"
                    />
                    <div className="ml-auto flex items-center gap-1 md:ml-0">
                      <button
                        type="button"
                        onClick={() => addServiceRow(rowIndex)}
                        title="Añadir una línea a esta sección"
                        className="flex items-center gap-1 min-h-[44px] md:min-h-0 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-100 px-3 md:px-2 py-1 rounded-md transition md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                      >
                        <Plus size={14} /> Línea
                      </button>
                      <button
                        onClick={() => removeRow(row.id)}
                        aria-label="Eliminar la sección"
                        className="flex h-10 w-10 md:h-auto md:w-auto items-center justify-center rounded text-zinc-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <Fragment key={row.id}>
                {/* The phone gets the same line as a collapsible card; the table below
                    is only rendered from md up. Both read and write the same row. */}
                <MobileLineCard
                  row={row}
                  rowIndex={rowIndex}
                  rowCount={rows.length}
                  sectionServices={sectionServices}
                  parentPhase={parentPhase}
                  onUpdate={updateRow}
                  onMove={moveRowBy}
                  onRemove={removeRow}
                  onApplyService={applyService}
                />
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(rowIndex, e)}
                  onDragOver={(e) => handleDragOver(rowIndex, e)}
                  onDrop={(e) => handleDrop(rowIndex, e)}
                  onDragEnd={handleDragEnd}
                  className={`hidden md:grid md:grid-cols-[30px_1fr_60px_100px_80px_100px_30px] md:gap-3 md:p-2 md:items-center hover:bg-zinc-50/80 group transition ${dropIndex === rowIndex ? 'border-t-2 border-blue-500' : ''}`}
                >
                   <div className="hidden md:flex text-center cursor-grab active:cursor-grabbing text-zinc-200 hover:text-zinc-400 justify-center"><GripVertical size={16}/></div>
                   <div className="md:col-span-1 flex flex-col gap-1">
                     <div className="relative flex items-center rounded-md border border-transparent hover:border-zinc-200 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition">
                         <input
                           className="font-medium text-zinc-900 bg-transparent rounded-md pl-2 pr-7 py-1.5 placeholder:text-zinc-300 border-none focus:ring-0 w-full"
                           value={row.service_name_snapshot || ''}
                           onChange={(e) => updateRow(row.id, { service_name_snapshot: e.target.value })}
                           placeholder="Descripción del ítem..."
                         />
                         {/* The dropdown opens from inside the description box: a native
                             select stretched over the chevron. Picking a partida of this
                             section fills description, unit and price at once. */}
                         <select
                           title={sectionServices.length === 0 ? 'No hay partidas del catálogo en esta sección' : 'Elegir una partida del catálogo'}
                           aria-label="Elegir una partida del catálogo"
                           value=""
                           onChange={(e) => applyService(row.id, e.target.value)}
                           className="absolute inset-y-0 right-0 w-8 opacity-0 cursor-pointer"
                         >
                           <option value="" disabled>{parentPhase ? `Elegir de «${parentPhase}»…` : 'Elegir del catálogo…'}</option>
                           {sectionServices.length === 0 && (
                             <option value="" disabled>Sin partidas del catálogo en esta sección</option>
                           )}
                           {sectionServices.map(c => (
                             <option key={c.id} value={c.id}>
                               {c.name} ({c.unit} — {c.base_price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})
                             </option>
                           ))}
                         </select>
                         <ChevronDown size={14} className="pointer-events-none absolute right-1.5 text-zinc-400" />
                       </div>
                       {/* The client note lives in its own full-width row below (9th grid cell). */}
                    </div>
                    <div className="flex flex-col gap-1">
                    <input 
                      className="w-full text-center bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md px-1 py-1.5 text-xs font-bold transition text-zinc-500 uppercase"
                      value={row.unit_snapshot || ''}
                      onChange={(e) => updateRow(row.id, { unit_snapshot: e.target.value })}
                      placeholder="m2"
                    />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="relative">
                      <span className="absolute right-2 top-1.5 text-zinc-400 text-sm pointer-events-none">€</span>
                      {/* A plain text field with a decimal keypad: `type="number"` throws
                          away the comma a Spanish keyboard offers, and «12,50» silently
                          became 1250. The same reader as the catalogue and the importer
                          (parsePriceInput) turns what was typed into the number. */}
                      <DecimalInput
                        className="w-full text-right bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md pl-2 pr-6 py-1.5 text-sm font-medium tabular-nums transition outline-none"
                        value={row.price_snapshot}
                        onValueChange={(value) => updateRow(row.id, { price_snapshot: value })}
                        ariaLabel={`Precio de ${row.service_name_snapshot || 'la línea'}`}
                      />
                    </div>
                    </div>
                    <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-0.5 justify-center">
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { quantity: Math.max(0, (row.quantity || 0) - 1) })}
                        aria-label="Restar una unidad"
                        className="flex h-10 w-10 shrink-0 md:h-auto md:w-auto items-center justify-center md:p-0.5 rounded hover:bg-blue-100 text-zinc-400 hover:text-blue-600 transition"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <DecimalInput
                        className="w-12 text-center font-bold text-blue-700 bg-transparent border border-transparent hover:border-blue-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md px-1 py-1.5 text-sm transition outline-none"
                        value={row.quantity}
                        onValueChange={(value) => updateRow(row.id, { quantity: value })}
                        ariaLabel="Cantidad"
                      />
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { quantity: (row.quantity || 0) + 1 })}
                        aria-label="Sumar una unidad"
                        className="flex h-10 w-10 shrink-0 md:h-auto md:w-auto items-center justify-center md:p-0.5 rounded hover:bg-blue-100 text-zinc-400 hover:text-blue-600 transition"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    </div>
                    <div className="flex flex-col gap-1 text-right">
                    <div className="text-right text-sm font-extrabold text-zinc-900 tabular-nums">
                      {calcRowTotal(row).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </div>
                    </div>
                    {/* One cell in both layouts: the delete button. The arrows that move
                        this line live in the phone card (the grip is a mouse affordance
                        and is not rendered below md). */}
                    <div className="md:col-span-1 flex items-center justify-center">
                      <button
                        onClick={() => removeRow(row.id)}
                        aria-label="Eliminar esta línea"
                        title="Eliminar esta línea"
                        className="flex md:h-auto md:w-auto items-center justify-center md:rounded-none text-zinc-300 hover:text-red-500 hover:bg-red-50 md:hover:bg-transparent transition md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {/* 9th cell: the client note, a full-width row of its own (md). It grows with
                        the text, so a long AI-generated paragraph is readable without clipping. */}
                    <div className="md:col-span-full md:pl-[42px]">
                      <AutoGrowTextarea
                        className="text-xs text-zinc-500 bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-300 focus:ring-1 focus:ring-blue-100 rounded-md px-2 py-1 placeholder:text-zinc-300 transition w-full resize-none leading-relaxed"
                        value={row.client_note || ''}
                        onChange={(value) => updateRow(row.id, { client_note: value })}
                        placeholder="Nota para el cliente (opcional)…"
                        minRows={2}
                      />
                    </div>
                </div>
                </Fragment>
              );
            })}
          </div>
          </div>

          {/* Quick Add Buttons — a two-column grid on a phone. As a wrapping flex
              row the section `<select>` sized itself to its longest option and ran
              past the card's right edge. */}
          <div className="grid grid-cols-2 gap-2 p-4 bg-zinc-50 border-t border-zinc-100 md:flex md:flex-wrap md:items-center md:gap-3">
            {hasSection ? (
              <button onClick={() => addServiceRow()} className="flex items-center justify-center gap-2 min-h-[44px] md:min-h-0 text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 md:px-4 py-2 rounded-lg transition active:scale-95 shadow-sm border border-blue-100 whitespace-nowrap">
                <Plus size={18} /> <span className="md:hidden">Línea</span><span className="hidden md:inline">Añadir Línea</span>
              </button>
            ) : (
              <p className="col-span-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                Añade una sección para empezar a añadir líneas de servicio.
              </p>
            )}
            <div className="flex min-w-0 items-center gap-1">
              <AddSectionControl catalogPhases={catalogPhaseNames} onAdd={addPhase} />
            </div>
            {/* AI Translate button + error */}
            <div className="col-span-2 flex flex-col items-end gap-1 md:ml-auto">
              <button
                onClick={handleTranslateForClient}
                disabled={isTranslating}
                className={`flex w-full md:w-auto items-center justify-center gap-2 min-h-[44px] md:min-h-0 text-sm font-bold px-4 py-2 rounded-lg transition active:scale-95 shadow-sm border ${
                  translateDone
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200'
                }`}
              >
                <Sparkles size={16} />
                {isTranslating ? (
                  <ConstructionLoader size="sm" label="Generando…" />
                ) : translateDone ? (
                  '✓ Notas generadas'
                ) : (
                  'Adaptar para cliente'
                )}
              </button>
              {translateError && (
                <p className="text-xs text-red-500 font-medium text-right max-w-[260px]">{translateError}</p>
              )}
            </div>
          </div>
            </>
          )}
        </div>

        {/* STICKY ACTION BAR — one row on a phone: the total on the left, the save
            button on the right. Two stacked panels (a full-width button above a
            three-figure strip) took 140px of a 640px screen and covered the line
            being read. */}
        <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-shell bg-white border border-zinc-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-3 md:p-4 md:px-8 flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-6 rounded-2xl z-50 print:hidden">
          {/* Phone: total, what it is made of, and whether it is saved. */}
          <div className="min-w-0 md:hidden">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">Total</span>
              <span className="text-xl font-black tabular-nums tracking-tight text-blue-600">
                {totals.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <p className="truncate text-[10px] font-bold tabular-nums text-zinc-400">
              Base {totals.subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              {' · '}
              IVA {totals.tax.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
            {(saveError || isDirty || savedAt) && (
              <p className={`truncate text-[10px] font-bold ${saveError ? 'text-red-500' : isDirty ? 'text-amber-600' : 'text-green-600'}`}>
                {saveError || (isDirty ? '• Cambios sin guardar' : '✓ Guardado')}
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="md:hidden flex min-h-[44px] shrink-0 items-center justify-center gap-2 bg-zinc-900 hover:bg-black active:bg-zinc-800 text-white px-5 py-3 rounded-xl font-bold transition shadow-md disabled:bg-zinc-700 disabled:cursor-progress"
          >
            {isSaving ? (
              <ConstructionLoader size="sm" tone="invert" label="Guardando…" />
            ) : (
              'Guardar'
            )}
          </button>

          {/* Desktop keeps the original arrangement: action on the left, figures on
              the right, with the line count and the full labels. */}
          <div className="hidden md:flex w-auto flex-col gap-1.5">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-auto flex items-center justify-center gap-2 bg-zinc-900 hover:bg-black active:bg-zinc-800 text-white px-8 py-3 rounded-xl font-bold transition shadow-md disabled:bg-zinc-700 disabled:cursor-progress"
            >
             {isSaving ? (
               <ConstructionLoader size="sm" tone="invert" label="Guardando…" />
             ) : (
               'Guardar Presupuesto'
             )}
            </button>
            {saveError ? (
              <p className="text-[11px] text-red-500 font-bold">{saveError}</p>
            ) : isDirty ? (
              <p className="text-[11px] text-amber-600 font-bold">• Cambios sin guardar</p>
            ) : savedAt ? (
              <p className="text-[11px] text-green-600 font-bold">✓ Guardado</p>
            ) : null}
          </div>
          <div className="hidden md:flex w-auto items-center justify-end gap-8">
            <div className="text-zinc-500 text-sm font-bold">Líneas: {rows?.length || 0}</div>
            <div className="flex flex-none items-center justify-end gap-8">
              <div className="min-w-0 text-right">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-0.5">
                  Subtotal
                </div>
                <div className="text-sm md:text-xl font-bold text-zinc-600 tabular-nums tracking-tight">
                  {totals.subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-0.5">
                  {taxLabel(totals.taxRate)}
                </div>
                <div className="text-sm md:text-xl font-bold text-zinc-600 tabular-nums tracking-tight">
                  {totals.tax.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-0.5">
                  {totals.taxRate > 0 ? 'Total (con IVA)' : 'Total (sin IVA)'}
                </div>
                <div className="text-lg md:text-3xl font-black text-blue-600 tabular-nums tracking-tight">
                  {totals.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete this obra: the confirm names the partidas and the unsaved work it takes
          with it, and stays on screen with the reason if the server refuses. */}
      <ConfirmDialog
        open={showDelete}
        title="Eliminar la obra"
        description={
          <>
            Se borrará «{estimate.property_address}»
            {lineItemCount > 0 ? (
              <> y sus <strong className="font-black text-zinc-700">{lineItemCount} partida{lineItemCount === 1 ? '' : 's'}</strong></>
            ) : (
              <> (no tiene ninguna partida)</>
            )}
            . No se puede deshacer.
            {isDirty ? ' También se perderán los cambios sin guardar.' : ''}
          </>
        }
        confirmLabel="Eliminar la obra"
        pendingLabel="Eliminando…"
        pending={isDeleting}
        error={deleteError}
        onConfirm={handleDeleteEstimate}
        onCancel={() => {
          if (!isDeleting) setShowDelete(false);
        }}
      />

      {/* The waits are modals, in the same place as every other blocking job. */}
      <LoadingOverlay
        open={showSaveModal}
        label="Guardando el presupuesto…"
        hint="Escribiendo las líneas en el servidor. No cierres esta pestaña."
      />
      <LoadingOverlay
        open={isDeleting}
        label="Eliminando la obra…"
        hint={`«${estimate.property_address}»`}
      />

      {/* PDF Preview Modal outside the no-print region */}
      {showPreview && (
        <EstimatePDFPreview
          estimate={estimate}
          rows={rows}
          company={company}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
