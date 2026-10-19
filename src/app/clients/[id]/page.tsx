import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createEstimate, getClientWithEstimates, getPendingCounts } from '@/app/actions';
import ClientCard from '@/components/ClientCard';
import DeleteObraButton from '@/components/DeleteObraButton';
import SubmitButton from '@/components/SubmitButton';
import { computeTotals } from '@/lib/estimate-totals';
import { getStatusLabel } from '@/lib/estimate-status';
import { Plus } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * One client and their obras. This is where an obra is born: unlike a Modificación
 * (which used to hang from a budget), a new reforma for the same client is simply
 * another obra here, with its own address and its own lines.
 */
export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const payload = await getClientWithEstimates(params.id).catch(() => null);
  if (!payload) notFound();
  const { client, estimates, rowCounts } = payload;

  // The badge the old flat list used to show on each budget: a change captured in
  // the field («Cambios de esta obra») that nobody has turned into a line yet.
  const pendingCounts = await getPendingCounts();

  const handleNewObra = async (formData: FormData) => {
    'use server';
    const address = ((formData.get('address') as string) || '').trim();
    const obra = await createEstimate(client.id, address);
    redirect(`/clients/${client.id}/estimates/${obra.id}`);
  };

  return (
    <div className="max-w-shell mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <Link href="/clients" className="text-sm font-bold text-zinc-400 hover:text-zinc-900 transition">
        &larr; Clientes
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-4xl font-extrabold text-zinc-900 tracking-tight">{client.name}</h1>
        <p className="text-zinc-500 mt-2 font-medium">
          {estimates.length === 0
            ? 'Todavía sin obras.'
            : `${estimates.length} obra${estimates.length !== 1 ? 's' : ''}, cada una con su propio presupuesto.`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
        <ClientCard client={client} />

        <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-black text-zinc-900">Obras</h2>
            <form action={handleNewObra} className="flex gap-2 items-center">
              <input
                type="text"
                name="address"
                placeholder="Dirección de la obra..."
                className="px-3 py-2 bg-zinc-50 border-transparent rounded-lg text-sm font-medium text-zinc-900 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
              />
              <SubmitButton
                pendingLabel="Creando la obra…"
                className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2 rounded-lg font-bold text-sm shadow transition whitespace-nowrap disabled:bg-blue-400"
              >
                <Plus size={16} /> Nueva obra
              </SubmitButton>
            </form>
          </div>

          {estimates.length === 0 ? (
            <p className="p-8 text-center text-zinc-500 font-medium">
              Este cliente aún no tiene obras. Crea la primera arriba: la dirección es lo que
              distingue una obra de otra.
            </p>
          ) : (
            <div className="divide-y divide-zinc-50">
              {estimates.map((e) => {
                const st = getStatusLabel(e);
                const totals = computeTotals(Number(e.subtotal_amount ?? e.total_amount) || 0, e.tax_rate);
                const empty = rowCounts[e.id] === 0;
                return (
                  <div
                    key={e.id}
                    className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_104px] gap-3 p-4 items-center hover:bg-blue-50/50 transition group"
                  >
                    <Link
                      href={`/clients/${client.id}/estimates/${e.id}`}
                      className="grid grid-cols-1 md:grid-cols-[80px_1.4fr_110px_140px_40px] gap-3 items-center"
                    >
                      <div className="text-xs font-bold text-zinc-400 hidden md:block">
                        {formatDate(e.created_at)}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-zinc-900 truncate">{e.property_address}</span>
                        {pendingCounts[e.id] ? (
                          <span
                            title={`${pendingCounts[e.id]} cambio(s) de obra sin resolver`}
                            className="shrink-0 text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                          >
                            📝 {pendingCounts[e.id]}
                          </span>
                        ) : null}
                        {empty ? (
                          <span
                            title="Esta obra no tiene ninguna partida"
                            className="shrink-0 text-[10px] font-black text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded"
                          >
                            vacía
                          </span>
                        ) : null}
                      </div>
                      <div>
                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wide ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="text-right tabular-nums font-extrabold text-zinc-900">{fmt(totals.total)}</div>
                      <div className="text-blue-600 flex justify-end opacity-0 group-hover:opacity-100 transition font-bold text-sm">
                        &rarr;
                      </div>
                    </Link>
                    <div className="flex md:justify-end">
                      {empty ? <DeleteObraButton estimateId={e.id} address={e.property_address} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
