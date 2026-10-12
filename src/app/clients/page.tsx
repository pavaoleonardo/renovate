import Link from 'next/link';
import { redirect } from 'next/navigation';
import { addClient, getClients, getCompanyProfile, getEstimates } from '@/app/actions';
import { Estimate } from '@/types';
import { computeTotals } from '@/lib/estimate-totals';
import { ChevronRight, Plus, Users } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/**
 * The clients list — the app's entry point, because every obra belongs to a
 * client. Each row opens the client's ficha, where their obras live.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  const { data: clients } = await getClients();
  const { data: estimates } = await getEstimates();
  const company = await getCompanyProfile();

  /**
   * One pass over the budgets: how many obras each client owns and what they add
   * up to. The amounts go through computeTotals(), so this page can never show a
   * different figure from the PDF of the same obra.
   */
  const byClient = new Map<string, { count: number; total: number }>();
  // Budgets nobody has adopted yet: written before `clients` existed, or left
  // without a client by a hand-run ON DELETE SET NULL. They get their own section
  // instead of disappearing — each one is a document a client may already hold.
  const unassigned: Estimate[] = [];
  for (const e of estimates) {
    if (!e.client_id) {
      unassigned.push(e);
      continue;
    }
    const { total } = computeTotals(Number(e.subtotal_amount ?? e.total_amount) || 0, e.tax_rate);
    const entry = byClient.get(e.client_id) || { count: 0, total: 0 };
    entry.count += 1;
    entry.total += total;
    byClient.set(e.client_id, entry);
  }

  const handleNewClient = async (formData: FormData) => {
    'use server';
    const name = ((formData.get('clientName') as string) || '').trim();
    if (!name) return;
    const client = await addClient(name, {
      email: (formData.get('clientEmail') as string) || '',
      phone: (formData.get('clientPhone') as string) || '',
    });
    redirect(`/clients/${client.id}`);
  };

  return (
    <div className="max-w-shell mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-end mb-10 flex-col md:flex-row gap-6">
        <div>
          {company && <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-1">{company.name}</p>}
          <h1 className="text-4xl font-extrabold text-zinc-900 tracking-tight">Clientes</h1>
          <p className="text-zinc-500 mt-2 font-medium">
            Un cliente puede tener varias obras. Cada obra es un presupuesto con sus propias líneas.
          </p>
        </div>

        <form
          action={handleNewClient}
          className="flex flex-wrap gap-2 items-center bg-white p-2 rounded-xl border border-zinc-200 shadow-sm w-full md:w-auto"
        >
          <input
            type="text"
            name="clientName"
            placeholder="Nombre del cliente..."
            className="flex-1 min-w-[150px] px-3 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none font-medium text-zinc-900"
            required
          />
          <input
            type="email"
            name="clientEmail"
            placeholder="Email..."
            className="flex-1 min-w-[130px] px-3 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none font-medium text-zinc-900"
          />
          <input
            type="tel"
            name="clientPhone"
            placeholder="Teléfono..."
            className="flex-1 min-w-[110px] px-3 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none font-medium text-zinc-900"
          />
          <button
            type="submit"
            className="shrink-0 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-5 py-2.5 rounded-lg font-bold shadow transition flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={16} /> Nuevo cliente
          </button>
        </form>
      </div>

      {searchParams?.message && (
        <p className="mb-8 p-4 bg-zinc-100 text-zinc-600 font-medium text-center rounded-lg text-sm">
          {searchParams.message}
        </p>
      )}

      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-100 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Users size={22} />
          </div>
          <p className="text-zinc-500 font-medium text-lg">
            Aún no tienes clientes. Crea el primero arriba y añádele su primera obra.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 overflow-hidden">
          <div className="divide-y divide-zinc-50">
            {clients.map((c) => {
              const stats = byClient.get(c.id);
              const count = stats?.count ?? 0;
              return (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_120px_140px_40px] gap-3 p-4 items-center hover:bg-blue-50/50 transition group"
                >
                  <div className="font-bold text-zinc-900 truncate">{c.name}</div>
                  <div className="text-sm text-zinc-500 font-medium truncate">
                    {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="text-xs font-bold text-zinc-400">
                    {count > 0 ? `${count} obra${count !== 1 ? 's' : ''}` : 'Sin obras'}
                  </div>
                  <div className="text-right tabular-nums font-extrabold text-zinc-900">
                    {stats ? fmt(stats.total) : '—'}
                  </div>
                  <div className="text-blue-600 flex justify-end opacity-0 group-hover:opacity-100 transition">
                    <ChevronRight size={18} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mt-8 bg-amber-50 border border-amber-100 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100">
            <h2 className="font-black text-amber-900">
              {unassigned.length} presupuesto{unassigned.length !== 1 ? 's' : ''} sin cliente
            </h2>
            <p className="text-sm text-amber-800 font-medium mt-1">
              Se escribieron antes de que existieran las fichas de cliente. Ábrelos y elige su
              cliente en la cabecera: la obra pasará a la ficha que le corresponde.
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {unassigned.map((e) => (
              <Link
                key={e.id}
                href={`/estimates/${e.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-amber-100/50 transition"
              >
                <span className="font-bold text-amber-900 truncate">{e.client_name || 'Sin nombre'}</span>
                <span className="text-sm text-amber-800 font-medium truncate">
                  📍 {e.property_address}
                </span>
                <span className="ml-auto text-xs font-black text-amber-700 whitespace-nowrap">
                  Asignar cliente &rarr;
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
