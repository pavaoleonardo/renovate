'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEstimate } from '@/app/actions';
import ConstructionLoader from '@/components/ConstructionLoader';
import { Trash2 } from 'lucide-react';

/**
 * Removes an obra from the client's ficha. It is only rendered for an obra with zero
 * lines, and the server refuses anything else, so the confirm here is about the obra
 * itself (its address), not about trusting this button.
 */
export default function DeleteObraButton({ estimateId, address }: { estimateId: string; address: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar la obra «${address}»? Está vacía: no tiene ninguna partida.`)) return;
    setDeleting(true);
    setError(null);
    const res = await deleteEstimate(estimateId);
    setDeleting(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
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
    </div>
  );
}
