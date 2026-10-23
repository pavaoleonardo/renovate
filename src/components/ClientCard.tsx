'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Client } from '@/types';
import { deleteClient, updateClient } from '@/app/actions';
import AutoGrowTextarea from './AutoGrowTextarea';
import ConstructionLoader from './ConstructionLoader';
import ConfirmDialog from './ConfirmDialog';
import { CheckCircle2, Save, Trash2 } from 'lucide-react';

const inputClass =
  'w-full px-3 py-2 bg-zinc-50 border border-transparent rounded-lg text-sm font-medium text-zinc-900 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none transition';

/**
 * The editable ficha of a client. The name lives here and not on the budget: every
 * obra that points at this client reads it, which is why `updateClient()` rewrites
 * the snapshot name on those budgets when it changes.
 */
export default function ClientCard({ client }: { client: Client }) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: client.name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    notes: client.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** La pregunta de borrado vive en un diálogo propio: `window.confirm` no puede enseñar
   *  nada mientras el borrado corre. */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateClient(client.id, draft);
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    // The obras listed next to this card print the client's name: refresh so a
    // rename shows up there too.
    router.refresh();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteClient(client.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push('/clients');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 p-5">
      <h2 className="font-black text-zinc-900 mb-4">Ficha del cliente</h2>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nombre</label>
          <input className={inputClass} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Email</label>
          <input type="email" className={inputClass} value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@email.com" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Teléfono</label>
          <input type="tel" className={inputClass} value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="600 000 000" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dirección del cliente</label>
          <input className={inputClass} value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder="Calle, número, ciudad" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Notas</label>
          <AutoGrowTextarea
            className={`${inputClass} resize-none leading-relaxed`}
            value={draft.notes}
            onChange={(value) => set('notes', value)}
            placeholder="Cómo llegó, quién recomienda, detalles a recordar…"
            minRows={2}
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-bold text-red-500">{error}</p>}

      {/* Two full-width rows on a phone: side by side, «Guardar ficha» wrapped onto two
          lines and «Eliminar» still left the row awkwardly balanced. */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-zinc-900 hover:bg-black text-white px-4 py-2 rounded-lg font-bold text-sm transition whitespace-nowrap disabled:bg-zinc-700 disabled:cursor-progress"
        >
          {saving ? (
            <ConstructionLoader size="sm" tone="invert" label="Guardando…" />
          ) : (
            <><Save size={16} /> Guardar ficha</>
          )}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-bold text-green-600">
            <CheckCircle2 size={14} /> Guardado
          </span>
        )}
        <button
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          disabled={deleting}
          title="Solo se puede borrar un cliente sin obras"
          className="sm:ml-auto flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg font-bold text-sm transition whitespace-nowrap disabled:opacity-60 disabled:cursor-progress"
        >
          {deleting ? (
            <ConstructionLoader size="sm" label="Eliminando…" />
          ) : (
            <><Trash2 size={16} /> Eliminar</>
          )}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar la ficha"
        description={<>Se borrará «{client.name}» de tu lista de clientes. Las obras tienen que estar eliminadas antes.</>}
        confirmLabel="Eliminar la ficha"
        pendingLabel="Eliminando…"
        pending={deleting}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
