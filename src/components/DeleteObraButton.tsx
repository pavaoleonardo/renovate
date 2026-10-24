'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEstimate } from '@/app/actions';
import ConstructionLoader from '@/components/ConstructionLoader';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingOverlay from '@/components/LoadingOverlay';
import { Trash2 } from 'lucide-react';

/**
 * Removes an obra from the client's ficha.
 *
 * The confirm is a real dialog, not `window.confirm`: it hides nothing, it names what
 * disappears — the address, and how many partidas go with it — and it can keep a
 * failure on screen. While the delete runs the page is covered by the app's loading
 * modal, so the ficha cannot be tapped again behind the dialog.
 *
 * `rowCount` decides the wording and the permission: zero lines is noise and the
 * server deletes it, one line or more requires `withLines` and is refused by the
 * server unless asked. The list therefore never destroys work by a mis-tap.
 */
export default function DeleteObraButton({
  estimateId,
  address,
  rowCount = 0,
}: {
  estimateId: string;
  address: string;
  /** Partidas that would go with the obra. */
  rowCount?: number;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteEstimate(estimateId, { withLines: rowCount > 0 });
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
        title={rowCount > 0 ? `Eliminar esta obra y sus ${rowCount} partidas` : 'Eliminar esta obra vacía'}
        className="flex items-center gap-1.5 min-h-[44px] md:min-h-0 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-bold text-xs transition disabled:opacity-60 disabled:cursor-progress whitespace-nowrap"
      >
        {deleting ? (
          <ConstructionLoader size="sm" label="Eliminando…" />
        ) : (
          <><Trash2 size={14} /> Eliminar</>
        )}
      </button>
      {error && <span className="text-[10px] font-bold text-red-500 text-right max-w-[180px]">{error}</span>}

      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar la obra"
        description={
          rowCount > 0 ? (
            <>
              Se borrará «{address}» y sus <strong className="font-black text-zinc-700">{rowCount} partida{rowCount === 1 ? '' : 's'}</strong>.
              No se puede deshacer.
            </>
          ) : (
            <>Se borrará «{address}». No tiene ninguna partida, así que no se pierde ningún trabajo.</>
          )
        }
        confirmLabel="Eliminar la obra"
        pendingLabel="Eliminando…"
        pending={deleting}
        error={error}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
      />

      <LoadingOverlay open={deleting} label="Eliminando la obra…" hint={`«${address}»`} />
    </div>
  );
}
