'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEstimate } from '@/app/actions';
import ConstructionLoader from '@/components/ConstructionLoader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Trash2 } from 'lucide-react';

/**
 * Removes an obra from the client's ficha. It is only rendered for an obra with zero
 * lines, and the server refuses anything else, so the confirm here is about the obra
 * itself (its address), not about trusting this button.
 *
 * The confirm is a real dialog with the loader inside: `window.confirm` hides the page
 * and says nothing while the delete runs.
 */
export default function DeleteObraButton({ estimateId, address }: { estimateId: string; address: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteEstimate(estimateId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        disabled={deleting}
        title="Eliminar esta obra vacía"
        className="flex items-center gap-1.5 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-bold text-xs transition disabled:opacity-60 disabled:cursor-progress whitespace-nowrap"
      >
        {deleting ? (
          <ConstructionLoader variant="wall" size="sm" label="Eliminando…" />
        ) : (
          <><Trash2 size={14} /> Eliminar</>
        )}
      </button>
      {error && <span className="text-[10px] font-bold text-red-500 text-right max-w-[180px]">{error}</span>}

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar la obra"
        description={<>Se borrará «{address}». No tiene ninguna partida, así que no se pierde ningún trabajo.</>}
        confirmLabel="Eliminar la obra"
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
