import Link from 'next/link';
import { getEstimates, createEstimate, getCompanyProfile } from '@/app/actions';
import { redirect } from 'next/navigation';
import { Estimate } from '@/types';

function getStatusLabel(estimate: Estimate) {
  // Auto-expire: if status is draft or sent and older than 30 days
  if (['draft', 'sent'].includes(estimate.status) && estimate.created_at) {
    const created = new Date(estimate.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 30) {
      return { label: 'Caducado', color: 'bg-red-100 text-red-700' };
    }
  }

  const map: Record<string, { label: string; color: string }> = {
    draft: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800' },
    sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-800' },
    approved: { label: 'Aceptado', color: 'bg-green-100 text-green-800' },
    rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
    in_progress: { label: 'En Curso', color: 'bg-violet-100 text-violet-800' },
    completed: { label: 'Completado', color: 'bg-emerald-100 text-emerald-800' },
    expired: { label: 'Caducado', color: 'bg-red-100 text-red-700' },
  };
  return map[estimate.status] || { label: estimate.status, color: 'bg-zinc-100 text-zinc-600' };
}

function groupByYear(estimates: Estimate[]): Record<string, Estimate[]> {
  const groups: Record<string, Estimate[]> = {};
  for (const e of estimates) {
    const year = e.created_at 
      ? new Date(e.created_at).getFullYear().toString()
      : 'Sin fecha';
    if (!groups[year]) groups[year] = [];
    groups[year].push(e);
  }
  return groups;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function EstimatesList() {
  const { data } = await getEstimates();
  const company = await getCompanyProfile();
  const estimates = data || [];
  const grouped = groupByYear(estimates);
  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a)); // newest first

  const handleNewEstimate = async (formData: FormData) => {
    'use server';
    const clientName = formData.get('clientName') as string;
    const propertyAddress = formData.get('propertyAddress') as string;
    const newEst = await createEstimate(clientName, propertyAddress);
    redirect(`/estimates/${newEst.id}`);
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-4">
      <div className="flex justify-between items-center mb-10 flex-col md:flex-row gap-4">
        <div>
          {company && <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-1">{company.name}</p>}
          <h1 className="text-4xl font-extrabold text-zinc-900 tracking-tight">Presupuestos</h1>
          <p className="text-zinc-500 mt-2 font-medium">Gestiona las propuestas de reforma de tu empresa.</p>
        </div>
        
        <form action={handleNewEstimate} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-zinc-200 shadow-sm w-full md:w-auto">
          <input 
            type="text" 
            name="clientName" 
            placeholder="Cliente..." 
            className="px-3 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none font-medium text-zinc-900 min-w-[120px]" 
            required
          />
          <input 
            type="text" 
            name="propertyAddress" 
            placeholder="Dirección obra..." 
            className="px-3 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none font-medium text-zinc-900 min-w-[140px]" 
            required
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-5 py-2.5 rounded-lg font-bold shadow transition flex items-center gap-2 whitespace-nowrap">
            <span className="text-xl leading-none mb-0.5">+</span> Nuevo
          </button>
        </form>
      </div>

      {estimates.length === 0 && (
        <div className="bg-white rounded-xl border border-zinc-100 p-12 text-center">
          <p className="text-zinc-500 font-medium text-lg">Aún no hay presupuestos. ¡Crea el primero arriba!</p>
        </div>
      )}

      {years.map(year => (
        <div key={year} className="mb-8">
          {/* Year header */}
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-black text-zinc-400">{year}</h2>
            <div className="flex-1 h-px bg-zinc-200"></div>
            <span className="text-xs font-bold text-zinc-400">{grouped[year].length} presupuesto{grouped[year].length !== 1 ? 's' : ''}</span>
          </div>

          <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 overflow-hidden">
            <div className="divide-y divide-zinc-50">
              {grouped[year].map(e => {
                const st = getStatusLabel(e);
                return (
                  <Link 
                    key={e.id} 
                    href={`/estimates/${e.id}`} 
                    className="grid grid-cols-1 md:grid-cols-[80px_1.2fr_1.5fr_100px_110px_80px] gap-3 p-4 items-center hover:bg-blue-50/50 transition group"
                  >
                    <div className="text-xs font-bold text-zinc-400 hidden md:block">
                      {formatDate(e.created_at)}
                    </div>
                    <div className="font-bold text-zinc-900 truncate">
                      {e.client_name}
                    </div>
                    <div className="text-sm text-zinc-500 font-medium truncate hidden md:block">
                      📍 {e.property_address}
                    </div>
                    <div>
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wide ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="text-right tabular-nums font-extrabold text-zinc-900">
                      {(e.total_amount || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </div>
                    <div className="text-blue-600 text-right font-bold text-sm opacity-0 group-hover:opacity-100 transition hidden md:block">
                      Abrir &rarr;
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
