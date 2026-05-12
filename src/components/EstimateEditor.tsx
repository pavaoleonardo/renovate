"use client";

import { useState, useMemo, useRef } from 'react';
import { Estimate, EstimateRow, CatalogService, EstimateStatus, CompanyProfile } from '@/types';
import { saveEstimateRows, updateEstimateStatus, updateEstimateInfo } from '@/app/actions';
import { Plus, GripVertical, Trash2, Printer, CheckCircle2, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import EstimatePDFPreview from './EstimatePDFPreview';

export default function EstimateEditor({ 
  initialEstimate, 
  initialRows, 
  catalog,
  company
}: { 
  initialEstimate: Estimate; 
  initialRows: EstimateRow[]; 
  catalog: CatalogService[];
  company: CompanyProfile | null;
}) {
  const [estimate, setEstimate] = useState(initialEstimate);
  const [rows, setRows] = useState(initialRows || []);
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragNode_] = useState<HTMLDivElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateDone, setTranslateDone] = useState(false);
  const dragNode = useRef<HTMLDivElement | null>(dragNode_);

  // Totals recalc
  const calcRowTotal = (r: EstimateRow) => (r.price_snapshot || 0) * (r.quantity || 0);
  const totalAmount = useMemo(() => rows.reduce((acc, r) => acc + calcRowTotal(r), 0), [rows]);

  // Group catalog by phase
  const catalogByPhase = useMemo(() => {
    const groups: Record<string, CatalogService[]> = {};
    for (const s of (catalog || [])) {
      const phase = s.phase_name || 'Sin categoría';
      if (!groups[phase]) groups[phase] = [];
      groups[phase].push(s);
    }
    return groups;
  }, [catalog]);

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

  const addServiceRow = () => {
    setRows([...rows, {
      id: crypto.randomUUID(),
      type: 'item',
      position: rows.length,
      phase_name_snapshot: null,
      service_name_snapshot: '',
      unit_snapshot: 'un',
      price_snapshot: 0,
      quantity: 1,
      total: 0
    }]);
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
    await saveEstimateRows(estimate.id, rows);
    setIsSaving(false);
  };

  const handleTranslateForClient = async () => {
    setIsTranslating(true);
    setTranslateDone(false);
    try {
      const res = await fetch('/api/translate-for-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const { notes } = await res.json();
      if (notes) {
        setRows(rows.map(r => notes[r.id] ? { ...r, client_note: notes[r.id] } : r));
        setTranslateDone(true);
        setTimeout(() => setTranslateDone(false), 3000);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const s = e.target.value as EstimateStatus;
    const res = await updateEstimateStatus(estimate.id, s);
    setEstimate(res.estimate);
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
      <div className="no-print-area max-w-5xl mx-auto py-10 px-4 min-h-screen pb-40">
        
        {/* HEADER ... rest of editor ... */}
        {/* (I'll keep the same structure but ensuring the no-print-area div closes before the modal) */}
        {/* ... */}
        <div className="bg-white p-6 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* ... header content ... */}
          <div>
            <input
              className="text-3xl font-extrabold text-zinc-900 tracking-tight bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg px-2 py-1 w-full transition"
              value={estimate.client_name}
              onChange={(e) => setEstimate({ ...estimate, client_name: e.target.value })}
              onBlur={() => updateEstimateInfo(estimate.id, { client_name: estimate.client_name })}
              placeholder="Nombre del cliente"
            />
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
          <div className="flex flex-col items-end gap-3 w-full md:w-auto">
            <div className="flex items-center gap-3">
               <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Estado</span>
               <select 
                value={estimate.status} 
                onChange={handleStatusChange}
                className="border-zinc-200 rounded-lg shadow-sm font-bold bg-white text-zinc-800 py-2 pl-4 pr-10 focus:ring-blue-500 focus:border-blue-500 transition cursor-pointer"
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
           
            <button 
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-lg transition font-semibold text-sm w-full md:w-auto justify-center"
            >
              <Printer size={18} /> Exportar PDF
            </button>
          </div>
        </div>

        {/* DOCUMENT ROWS */}
        <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 overflow-hidden">
          <div className="grid grid-cols-[30px_1fr_120px_60px_100px_80px_100px_30px] gap-3 p-3 bg-zinc-50/80 border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-widest items-center">
            <div></div>
            <div>Descripción</div>
            <div>Catálogo</div>
            <div className="text-center">Unid</div>
            <div className="text-right">Precio</div>
            <div className="text-center">Cant</div>
            <div className="text-right">Total</div>
            <div></div>
          </div>

          <div className="divide-y divide-zinc-50">
            {(rows || []).map((row, rowIndex) => {
              if (row.type === 'phase') {
                return (
                  <div 
                    key={row.id}
                    draggable
                    onDragStart={(e) => handleDragStart(rowIndex, e)}
                    onDragOver={(e) => handleDragOver(rowIndex, e)}
                    onDrop={(e) => handleDrop(rowIndex, e)}
                    onDragEnd={handleDragEnd}
                    className={`grid grid-cols-[30px_1fr_40px] gap-3 p-2 bg-blue-50/40 hover:bg-blue-50/80 items-center group transition ${dropIndex === rowIndex ? 'border-t-2 border-blue-500' : ''}`}
                  >
                    <div className="text-center cursor-grab active:cursor-grabbing text-zinc-300 hover:text-blue-500"><GripVertical size={18}/></div>
                    <input 
                      className="font-extrabold text-xl text-blue-900 bg-transparent border-none focus:ring-2 focus:ring-blue-200 rounded-md px-2 py-1 placeholder:text-blue-300 w-full transition"
                      value={row.phase_name_snapshot || ''}
                      onChange={(e) => updateRow(row.id, { phase_name_snapshot: e.target.value })}
                      placeholder="Nombre de Sección"
                    />
                    <button onClick={() => removeRow(row.id)} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 size={16} /></button>
                  </div>
                );
              }

              return (
                <div 
                  key={row.id}
                  draggable
                  onDragStart={(e) => handleDragStart(rowIndex, e)}
                  onDragOver={(e) => handleDragOver(rowIndex, e)}
                  onDrop={(e) => handleDrop(rowIndex, e)}
                  onDragEnd={handleDragEnd}
                  className={`grid grid-cols-[30px_1fr_120px_60px_100px_80px_100px_30px] gap-3 p-2 items-center hover:bg-zinc-50/80 group transition ${dropIndex === rowIndex ? 'border-t-2 border-blue-500' : ''}`}
                >
                   <div className="text-center cursor-grab active:cursor-grabbing text-zinc-200 hover:text-zinc-400 flex justify-center"><GripVertical size={16}/></div>
                   <div className="flex flex-col gap-1">
                     <input 
                        className="font-medium text-zinc-900 bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md px-2 py-1.5 placeholder:text-zinc-300 transition w-full"
                        value={row.service_name_snapshot || ''}
                        onChange={(e) => updateRow(row.id, { service_name_snapshot: e.target.value })}
                        placeholder="Descripción del ítem..."
                      />
                      <textarea
                        className="text-xs text-zinc-500 bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-300 focus:ring-1 focus:ring-blue-100 rounded-md px-2 py-1 placeholder:text-zinc-300 transition w-full resize-none mt-0.5 leading-relaxed"
                        rows={1}
                        value={row.client_note || ''}
                        onChange={(e) => updateRow(row.id, { client_note: e.target.value })}
                        placeholder="Nota para el cliente (opcional)..."
                        onInput={(e) => {
                          const t = e.target as HTMLTextAreaElement;
                          t.style.height = 'auto';
                          t.style.height = t.scrollHeight + 'px';
                        }}
                      />
                   </div>
                    <select 
                      className="text-xs rounded-md border-transparent hover:border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-zinc-50 text-zinc-600 truncate py-1.5 px-2 font-medium transition cursor-pointer"
                      onChange={(e) => applyService(row.id, e.target.value)}
                      value=""
                    >
                      <option value="" disabled>{getParentPhaseName(rowIndex) || 'Elegir del catálogo...'}</option>
                      {(() => {
                        const parentPhase = getParentPhaseName(rowIndex);
                        const matchedServices = parentPhase ? catalogByPhase[parentPhase] : null;
                        
                        if (matchedServices && matchedServices.length > 0) {
                          // Show only services from the parent phase
                          return matchedServices.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.unit} — {c.base_price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})
                            </option>
                          ));
                        } else {
                          // No matching phase or no parent: show all grouped
                          return Object.entries(catalogByPhase).map(([phaseName, services]) => (
                            <optgroup key={phaseName} label={phaseName}>
                              {services.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.unit} — {c.base_price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})
                                </option>
                              ))}
                            </optgroup>
                          ));
                        }
                      })()}
                    </select>
                    <input 
                      className="w-full text-center bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md px-1 py-1.5 text-xs font-bold transition text-zinc-500 uppercase"
                      value={row.unit_snapshot || ''}
                      onChange={(e) => updateRow(row.id, { unit_snapshot: e.target.value })}
                      placeholder="m2"
                    />
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-zinc-400 text-sm">€</span>
                      <input 
                        type="number"
                        className="w-full text-right bg-transparent border border-transparent hover:border-zinc-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md pl-5 pr-2 py-1.5 text-sm font-medium tabular-nums transition"
                        value={row.price_snapshot || ''}
                        onChange={(e) => updateRow(row.id, { price_snapshot: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { quantity: Math.max(0, (row.quantity || 0) - 1) })}
                        className="p-0.5 rounded hover:bg-blue-100 text-zinc-400 hover:text-blue-600 transition"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <input 
                        type="number"
                        className="w-12 text-center font-bold text-blue-700 bg-transparent border border-transparent hover:border-blue-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-md px-1 py-1.5 text-sm transition"
                        value={row.quantity || ''}
                        onChange={(e) => updateRow(row.id, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { quantity: (row.quantity || 0) + 1 })}
                        className="p-0.5 rounded hover:bg-blue-100 text-zinc-400 hover:text-blue-600 transition"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    <div className="text-right text-sm font-extrabold text-zinc-900 tabular-nums">
                      {calcRowTotal(row).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </div>
                    <button onClick={() => removeRow(row.id)} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition flex justify-center"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>

          {/* Quick Add Buttons */}
          <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex gap-3 items-center flex-wrap">
            <button onClick={addServiceRow} className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition active:scale-95 shadow-sm border border-blue-100">
              <Plus size={18} /> Añadir Línea
            </button>
            <div className="flex items-center gap-1">
              <select
                className="text-sm font-bold text-zinc-700 bg-white hover:bg-zinc-50 px-4 py-2 rounded-lg transition shadow-sm border border-zinc-200 cursor-pointer appearance-none pr-8"
                value=""
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    addPhase();
                  } else {
                    addPhase(e.target.value);
                  }
                  e.target.value = '';
                }}
              >
                <option value="" disabled>+ Añadir Sección...</option>
                {Object.keys(catalogByPhase).map(phaseName => (
                  <option key={phaseName} value={phaseName}>{phaseName}</option>
                ))}
                <option value="__custom__">— Sección personalizada</option>
              </select>
            </div>
            {/* AI Translate button */}
            <button
              onClick={handleTranslateForClient}
              disabled={isTranslating}
              className={`ml-auto flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg transition active:scale-95 shadow-sm border ${
                translateDone
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200'
              }`}
            >
              <Sparkles size={16} />
              {isTranslating ? 'Generando...' : translateDone ? '✓ Notas generadas' : 'Adaptar para cliente'}
            </button>
          </div>
        </div>

        {/* STICKY ACTION BAR */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl bg-white border border-zinc-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-4 px-6 md:px-8 flex justify-between items-center rounded-2xl z-50 print:hidden">
          <div>
            <button 
              onClick={handleSave} 
              disabled={isSaving}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-black active:bg-zinc-800 text-white px-8 py-3 rounded-xl font-bold transition shadow-md disabled:opacity-50"
            >
             {isSaving ? 'Guardando...' : 'Guardar Presupuesto'}
            </button>
          </div>
          <div className="text-right flex items-center gap-8">
            <div className="hidden md:block text-zinc-500 text-sm font-bold">Líneas: {rows?.length || 0}</div>
            <div className="flex gap-8">
              <div className="text-right">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-0.5">Subtotal</div>
                <div className="text-xl font-bold text-zinc-600 tabular-nums tracking-tight">
                  {totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-0.5">IVA (21%)</div>
                <div className="text-xl font-bold text-zinc-600 tabular-nums tracking-tight">
                  {(totalAmount * 0.21).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-0.5">Total (con IVA)</div>
                <div className="text-3xl font-black text-blue-600 tabular-nums tracking-tight">
                  {(totalAmount * 1.21).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
