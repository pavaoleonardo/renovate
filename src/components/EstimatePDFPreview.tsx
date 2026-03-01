"use client";

import { Estimate, EstimateRow, CompanyProfile } from '@/types';
import { X, Printer, Mail } from 'lucide-react';
import { useState } from 'react';

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export default function EstimatePDFPreview({
  estimate,
  rows,
  company,
  onClose,
}: {
  estimate: Estimate;
  rows: EstimateRow[];
  company: CompanyProfile | null;
  onClose: () => void;
}) {
  const [emailTo, setEmailTo] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const subtotal = rows.reduce((acc, r) => {
    if (r.type === 'item') return acc + (r.price_snapshot || 0) * (r.quantity || 0);
    return acc;
  }, 0);
  const iva = subtotal * 0.21;
  const total = subtotal + iva;

  const today = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async () => {
    if (!emailTo) return;
    setSending(true);
    const subject = encodeURIComponent(`Presupuesto - ${estimate.client_name}`);
    const body = encodeURIComponent(
      `Estimado/a ${estimate.client_name},\n\nAdjunto le envío el presupuesto para la dirección: ${estimate.property_address}.\n\nImporte total (IVA incluido): ${fmt(total)}\n\nQuedo a su disposición para cualquier consulta.\n\nUn saludo.`
    );
    window.open(`mailto:${emailTo}?subject=${subject}&body=${body}`, '_blank');
    setSending(false);
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
  };

  return (
    <div className="print-modal-container fixed inset-0 z-[100] bg-zinc-900/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-12 px-4 print:p-0">
      {/* Top Action Bar (hidden when printing) */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-zinc-200 shadow-sm z-[110] print:hidden">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <h2 className="font-bold text-zinc-900">Vista de Documento</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEmailForm(!showEmailForm)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition text-sm"
            >
              <Mail size={16} /> Email
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-black text-white px-4 py-2 rounded-lg font-bold transition text-sm"
            >
              <Printer size={16} /> Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {showEmailForm && (
          <div className="border-t border-zinc-100 bg-zinc-50">
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="email@cliente.com"
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 text-sm"
              />
              <button
                onClick={handleSendEmail}
                disabled={!emailTo || sending}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm"
              >
                {sending ? 'Env...' : emailSent ? '✓ Listo' : 'Enviar maillto'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* THE DOCUMENT PAPER */}
      <div className="print-modal bg-white w-full max-w-4xl shadow-2xl rounded-sm mt-8 print:mt-0 overflow-hidden flex flex-col min-h-[29.7cm]">
        
        {/* Header - Corporate Style */}
        <div className="p-12 pb-8">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-zinc-900">
                {company?.name || 'RENOVATE'}<span className="text-blue-600">.</span>
              </h1>
              <p className="text-sm text-zinc-400 font-bold uppercase tracking-widest mt-1">
                Servicios de Reforma
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Presupuesto Nº</div>
              <div className="text-lg font-mono font-bold text-zinc-800 tracking-tighter">
                {estimate.id.slice(0, 8).toUpperCase()}
              </div>
              <div className="text-sm font-medium text-zinc-500 mt-1">{today}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 border-y border-zinc-100 py-8">
            <div>
              <div className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3">Resumen de Obra</div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-zinc-400 italic">Contacto:</p>
                <p className="text-base font-extrabold text-zinc-900">{estimate.client_name}</p>
              </div>
              <div className="space-y-1 mt-4">
                <p className="text-sm font-bold text-zinc-400 italic">Ubicación:</p>
                <p className="text-base font-extrabold text-zinc-900">{estimate.property_address}</p>
              </div>
            </div>
            <div className="bg-zinc-50 p-6 rounded-lg flex flex-col justify-center">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Presupuesto Estimado</div>
              <div className="text-3xl font-black text-zinc-900 tabular-nums">
                {fmt(total)}
              </div>
              <div className="text-[10px] text-zinc-400 font-bold mt-1">IVA del 21% INCLUIDO</div>
            </div>
          </div>
        </div>

        {/* Content Table */}
        <div className="px-12 flex-grow">
          <div className="grid grid-cols-[1fr_70px_100px_60px_110px] gap-4 pb-3 border-b-2 border-zinc-900 text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em]">
            <div>Concepto y Descripción</div>
            <div className="text-center">Unidad</div>
            <div className="text-right">Precio</div>
            <div className="text-center">Cant.</div>
            <div className="text-right">Subtotal</div>
          </div>

          <div className="divide-y divide-zinc-100">
            {rows.map((row) => {
              if (row.type === 'phase') {
                return (
                  <div key={row.id} className="pt-8 pb-3 break-after-avoid">
                    <h3 className="text-xs font-black text-zinc-900 bg-zinc-100 px-3 py-1.5 rounded inline-block uppercase tracking-widest">
                      {row.phase_name_snapshot}
                    </h3>
                  </div>
                );
              }

              const rowTotal = (row.price_snapshot || 0) * (row.quantity || 0);
              return (
                <div key={row.id} className="grid grid-cols-[1fr_70px_100px_60px_110px] gap-4 py-3.5 text-sm items-center break-inside-avoid">
                  <div className="font-medium text-zinc-800 leading-snug">{row.service_name_snapshot || '—'}</div>
                  <div className="text-center text-[11px] font-black text-zinc-400 uppercase">{row.unit_snapshot || ''}</div>
                  <div className="text-right tabular-nums text-zinc-600 font-medium">{fmt(row.price_snapshot || 0)}</div>
                  <div className="text-center font-bold text-zinc-900">{row.quantity || 0}</div>
                  <div className="text-right font-bold tabular-nums text-zinc-900">{fmt(rowTotal)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Final Summary Row */}
        <div className="px-12 py-12 break-inside-avoid">
          <div className="flex justify-end border-t-2 border-zinc-900 pt-6">
            <div className="w-80 space-y-3">
              <div className="flex justify-between text-sm font-bold text-zinc-500">
                <span>Base Imponible</span>
                <span className="tabular-nums font-mono">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-zinc-500">
                <span>IVA (21%)</span>
                <span className="tabular-nums font-mono">{fmt(iva)}</span>
              </div>
              <div className="flex justify-between text-2xl font-black text-zinc-900 border-t border-zinc-100 pt-4">
                <span>TOTAL</span>
                <span className="tabular-nums text-blue-600">{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Minimalist Contact Info */}
        <div className="px-12 py-8 bg-zinc-50 border-t border-zinc-100 mt-auto">
          <div className="flex justify-between items-start gap-8">
            <div className="space-y-1">
              {company && (company.contact_name || company.contact_email || company.contact_phone) ? (
                <>
                  {company.contact_name && <p className="text-sm font-black text-zinc-800 uppercase tracking-tighter">{company.contact_name}</p>}
                  <p className="text-sm text-zinc-500 font-medium">
                    {company.contact_phone} {company.contact_email && `· ${company.contact_email}`}
                  </p>
                  <p className="text-xs text-zinc-400 mt-2 italic">
                    {company.address} {company.cif && `· CIF: ${company.cif}`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-400 italic">Información de contacto no disponible</p>
              )}
            </div>

            <div className="text-right max-w-[280px]">
              <p className="text-xs font-black text-zinc-700 uppercase leading-relaxed text-balance">
                Este presupuesto tiene una validez de 30 días naturales
              </p>
              <p className="text-[10px] text-zinc-400 font-medium mt-2 leading-relaxed">
                Los precios contemplan materiales y mano de obra según descripción. Condiciones sujetas a revisión tras visita técnica final.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
