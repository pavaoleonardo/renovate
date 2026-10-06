"use client";

import { Estimate, EstimateRow, CompanyProfile } from '@/types';
import { computeTotals } from '@/lib/estimate-totals';
import { X, Printer, Mail, Download, MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export default function EstimatePDFPreview({
  estimate,
  rows,
  company,
  parentDateLabel,
  onClose,
}: {
  estimate: Estimate;
  rows: EstimateRow[];
  company: CompanyProfile | null;
  /** When this is a Modificación: the date of the original budget, for the heading. */
  parentDateLabel?: string | null;
  onClose: () => void;
}) {
  const docRef = useRef<HTMLDivElement>(null);

  const [emailTo, setEmailTo] = useState('');
  const [whatsappTo, setWhatsappTo] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showWhatsappForm, setShowWhatsappForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hint, setHint] = useState('');
  /**
   * Whether this device can attach the PDF through the OS share sheet. Only
   * phones/tablets can (see `canSharePdf`), and it reads `navigator`, so it is
   * evaluated on mount to keep the server and client markup identical.
   */
  const [shareSupported, setShareSupported] = useState(false);
  useEffect(() => {
    setShareSupported(canSharePdf());
    // canSharePdf() is a stable read of navigator; running once is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = rows.reduce((acc, r) => {
    if (r.type === 'item') return acc + (r.price_snapshot || 0) * (r.quantity || 0);
    return acc;
  }, 0);
  // The VAT is whatever this budget was issued with: 21 %, 10 % or none at all.
  const totals = computeTotals(subtotal, estimate.tax_rate);
  const vatIncluded = totals.taxRate > 0;

  /** File name used for the downloaded / shared PDF (strips characters illegal on disk). */
  const pdfFileName = `Presupuesto - ${(estimate.client_name || 'cliente').replace(/[/\\?%*:|"<>]+/g, '').trim() || 'cliente'}.pdf`;

  const today = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  /**
   * Renders the on-screen document into a real PDF file. html2pdf.js is imported
   * lazily inside this handler so it never lands in the editor's initial bundle
   * (the PDF engine loads only when the user asks to download or send).
   */
  const buildPdfBlob = async (): Promise<Blob> => {
    const node = docRef.current;
    if (!node) throw new Error('No se encontró el documento');
    const { default: html2pdf } = await import('html2pdf.js');
    const options = {
      margin: [8, 8, 8, 8] as [number, number, number, number],
      filename: pdfFileName,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] },
    };
    const blob = await html2pdf().set(options).from(node).outputPdf('blob');
    return blob as Blob;
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /**
   * True when handing the PDF to the OS share sheet is worthwhile. Only phones
   * and tablets benefit: there the sheet lists WhatsApp / Mail and attaches the
   * file automatically. On desktop the system sheet usually has no WhatsApp and
   * swallows the click — the mail draft or WhatsApp Web never opens — so we skip
   * it and fall back to downloading the PDF and opening the deep link.
   */
  const canSharePdf = (): boolean => {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
    const ua = navigator.userAgent || '';
    // iPadOS 13+ reports as a Mac; its touch support gives it away.
    const isMobile =
      /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    if (!isMobile) return false;
    try {
      return navigator.canShare({ files: [new File([new Blob()], pdfFileName, { type: 'application/pdf' })] });
    } catch {
      return false;
    }
  };

  /**
   * Hands the PDF to the device share sheet when the browser supports sharing
   * files (mobile → WhatsApp, Mail, Drive…). Returns true when that path was
   * taken — including when the user simply closed the sheet — so the caller
   * knows whether it still needs the download fallback.
   */
  const sharePdfFile = async (blob: Blob, message: string): Promise<boolean> => {
    if (canSharePdf()) {
      const file = new File([blob], pdfFileName, { type: 'application/pdf' });
      try {
        await navigator.share({ files: [file], title: pdfFileName, text: message });
        return true;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return true; // user closed the sheet
      }
    }
    return false;
  };

  const handleDownloadPdf = async () => {
    if (generating) return;
    setGenerating(true);
    setHint('');
    try {
      downloadBlob(await buildPdfBlob());
    } catch (err) {
      console.error('No se pudo generar el PDF:', err);
      setHint('No se pudo generar el PDF en este navegador. Prueba con «Imprimir → Guardar como PDF».');
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Email: a `mailto:` link cannot carry attachments, so we build the PDF first
   * and hand it to the share sheet when possible. Otherwise we download it and
   * open the mail draft, telling the user to attach the just-downloaded file.
   */
  const handleSendEmail = async () => {
    if (!emailTo || busy) return;
    setBusy(true);
    setHint('');
    try {
      const subject = `Presupuesto - ${estimate.client_name}`;
      const message = `Estimado/a ${estimate.client_name},\n\nLe envío el presupuesto para la dirección: ${estimate.property_address}.\n\nImporte total ${vatIncluded ? '(IVA incluido)' : '(sin IVA)'}: ${fmt(totals.total)}\n\nQuedo a su disposición para cualquier consulta.\n\nUn saludo.`;
      const blob = await buildPdfBlob();
      if (await sharePdfFile(blob, message)) return;
      downloadBlob(blob);
      window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      setHint(`Listo: se ha descargado «${pdfFileName}» y se ha abierto tu correo. Adjunta ese archivo antes de enviar.`);
    } catch (err) {
      console.error('No se pudo preparar el correo:', err);
      setHint('No se pudo generar el PDF. Prueba con «Imprimir → Guardar como PDF».');
    } finally {
      setBusy(false);
    }
  };

  /**
   * WhatsApp: uses the share sheet when files can be shared (mobile). On desktop
   * it downloads the PDF and opens WhatsApp Web with the message ready, so the
   * user drags in the downloaded file. The blank tab is opened inside the click
   * gesture so the popup blocker lets it through.
   */
  const handleSendWhatsapp = async () => {
    if (busy) return;
    setBusy(true);
    setHint('');
    const phone = whatsappTo.replace(/\D/g, '');
    const message = `Hola ${estimate.client_name}, le envío el presupuesto para ${estimate.property_address}. Importe total ${vatIncluded ? '(IVA incluido)' : '(sin IVA)'}: ${fmt(totals.total)}.`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const tab = canSharePdf() ? null : window.open('', '_blank');
    try {
      const blob = await buildPdfBlob();
      if (await sharePdfFile(blob, message)) {
        tab?.close();
        return;
      }
      downloadBlob(blob);
      if (tab) tab.location.href = waUrl;
      else window.location.href = waUrl;
      setHint(`Listo: se ha descargado «${pdfFileName}» y se ha abierto WhatsApp. Adjunta ese archivo antes de enviar.`);
    } catch (err) {
      tab?.close();
      console.error('No se pudo preparar el WhatsApp:', err);
      setHint('No se pudo generar el PDF. Prueba con «Imprimir → Guardar como PDF».');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print-modal-container fixed inset-0 z-[100] bg-zinc-900/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-12 px-4 print:p-0">
      {/* Top Action Bar (hidden when printing) */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-zinc-200 shadow-sm z-[110] print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <h2 className="hidden sm:block font-bold text-zinc-900">Vista de Documento</h2>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <button
              onClick={() => { setShowEmailForm(!showEmailForm); setShowWhatsappForm(false); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg font-bold transition text-sm"
            >
              <Mail size={16} /> <span className="hidden sm:inline">Email</span>
            </button>
            <button
              onClick={() => { setShowWhatsappForm(!showWhatsappForm); setShowEmailForm(false); }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 rounded-lg font-bold transition text-sm"
            >
              <MessageCircle size={16} /> <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={generating}
              className="flex items-center gap-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-800 px-3 sm:px-4 py-2 rounded-lg font-bold transition text-sm disabled:opacity-50"
            >
              <Download size={16} /> <span className="hidden sm:inline">{generating ? 'Generando…' : 'PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-black text-white px-3 sm:px-4 py-2 rounded-lg font-bold transition text-sm"
            >
              <Printer size={16} /> <span className="hidden sm:inline">Imprimir</span>
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
            <div className="max-w-4xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="email@cliente.com"
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 text-sm"
              />
              <button
                onClick={handleSendEmail}
                disabled={!emailTo || busy}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
              >
                {busy ? 'Generando…' : shareSupported ? 'Compartir por email' : 'Abrir correo con el PDF'}
              </button>
            </div>
            <p className="max-w-4xl mx-auto px-6 pb-2 text-[11px] font-medium text-zinc-500 leading-relaxed">
              {shareSupported
                ? `Se abrirá la hoja de compartir del sistema: elige tu app de correo y «${pdfFileName}» irá adjunto con el mensaje ya escrito.`
                : `Se descargará «${pdfFileName}» y se abrirá tu aplicación de correo con el mensaje ya escrito. Adjunta el PDF descargado antes de enviar.`}
            </p>
            {hint && <p className="max-w-4xl mx-auto px-6 pb-3 text-[11px] font-bold text-blue-700">{hint}</p>}
          </div>
        )}

        {showWhatsappForm && (
          <div className="border-t border-zinc-100 bg-zinc-50">
            <div className="max-w-4xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="tel"
                value={whatsappTo}
                onChange={(e) => setWhatsappTo(e.target.value)}
                placeholder="+34 600 000 000"
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 text-sm"
              />
              <button
                onClick={handleSendWhatsapp}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
              >
                {busy ? 'Generando…' : shareSupported ? 'Compartir por WhatsApp' : 'Abrir WhatsApp con el PDF'}
              </button>
            </div>
            <p className="max-w-4xl mx-auto px-6 pb-2 text-[11px] font-medium text-zinc-500 leading-relaxed">
              {shareSupported
                ? `Se abrirá la hoja de compartir del sistema: elige WhatsApp y «${pdfFileName}» irá adjunto con el mensaje ya escrito.`
                : `Se descargará «${pdfFileName}» y se abrirá WhatsApp Web con el mensaje ya escrito. Adjunta el PDF descargado antes de enviar.`}
            </p>
            {hint && <p className="max-w-4xl mx-auto px-6 pb-3 text-[11px] font-bold text-emerald-700">{hint}</p>}
          </div>
        )}
      </div>

      {/* THE DOCUMENT PAPER */}
      <div ref={docRef} className="print-modal bg-white w-full max-w-4xl shadow-2xl rounded-sm mt-8 print:mt-0 overflow-hidden flex flex-col min-h-[29.7cm]">
        
        {/* Header - Corporate Style */}
        <div className="p-6 sm:p-10 md:p-12 pb-8">
          <div className="flex justify-between items-start mb-12">
            <div>
              {company?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo_url} alt="Company Logo" className="h-16 object-contain" />
              ) : (
                <>
                  <h1 className="text-3xl font-black tracking-tight text-zinc-900">
                    {company?.name || 'RENOVATE'}<span className="text-blue-600">.</span>
                  </h1>
                  <p className="text-sm text-zinc-400 font-bold uppercase tracking-widest mt-1">
                    Servicios de Reforma
                  </p>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Presupuesto Nº</div>
              <div className="text-lg font-mono font-bold text-zinc-800 tracking-tighter">
                {estimate.id.slice(0, 8).toUpperCase()}
              </div>
              <div className="text-sm font-medium text-zinc-500 mt-1">{today}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-12 border-y border-zinc-100 py-8">
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
                {fmt(totals.total)}
              </div>
              <div className="text-[10px] text-zinc-400 font-bold mt-1">
                {vatIncluded ? `IVA del ${totals.taxRate}% INCLUIDO` : 'SIN IVA'}
              </div>
            </div>
          </div>
        </div>

        {estimate.kind === 'modificacion' && (
          <div className="px-6 sm:px-10 md:px-12 pb-2">
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-2.5 text-sm font-bold">
              Modificación del presupuesto{parentDateLabel ? ` del ${parentDateLabel}` : ''}
            </div>
          </div>
        )}

        {/* Content Table */}
        <div className="px-6 sm:px-10 md:px-12 flex-grow">
          <div className="grid grid-cols-[1fr_44px_72px_40px_84px] sm:grid-cols-[1fr_70px_100px_60px_110px] gap-2 sm:gap-4 pb-3 border-b-2 border-zinc-900 text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em]">
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
                <div key={row.id} className="grid grid-cols-[1fr_44px_72px_40px_84px] sm:grid-cols-[1fr_70px_100px_60px_110px] gap-2 sm:gap-4 py-3.5 text-sm items-start break-inside-avoid">
                  <div>
                    <p className="font-medium text-zinc-800 leading-snug">{row.service_name_snapshot || '—'}</p>
                    {row.client_note && (
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{row.client_note}</p>
                    )}
                  </div>
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
        <div className="px-6 sm:px-10 md:px-12 py-12 break-inside-avoid">
          <div className="flex justify-end border-t-2 border-zinc-900 pt-6">
            <div className="w-full sm:w-80 space-y-3">
              {vatIncluded && (
                <>
                  <div className="flex justify-between text-sm font-bold text-zinc-500">
                    <span>Base Imponible</span>
                    <span className="tabular-nums font-mono">{fmt(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-zinc-500">
                    <span>IVA ({totals.taxRate}%)</span>
                    <span className="tabular-nums font-mono">{fmt(totals.tax)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-2xl font-black text-zinc-900 border-t border-zinc-100 pt-4">
                <span>{vatIncluded ? 'TOTAL' : 'TOTAL SIN IVA'}</span>
                <span className="tabular-nums text-blue-600">{fmt(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Minimalist Contact Info */}
        <div className="px-6 sm:px-10 md:px-12 py-8 bg-zinc-50 border-t border-zinc-100 mt-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-8">
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
