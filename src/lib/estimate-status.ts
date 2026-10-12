import { Estimate } from '@/types';

/**
 * The label + colour of a budget's state. Shared by the client's ficha
 * (/clients/[id]) and the obra rows it holds, so the two can never disagree
 * about what a budget is doing.
 *
 * Auto-expire: a budget still «Pendiente» or «Enviado» 30 days after it was
 * written is shown as «Caducado» even before anybody changes its status — the
 * PDF promises a 30-day validity, so the list has to say the same.
 *
 * Pure: no session, no database, no clock of its own (the caller's `now` is
 * injectable so the decision can be tested).
 */
export function getStatusLabel(
  estimate: Pick<Estimate, 'status' | 'created_at'>,
  now: Date = new Date()
): { label: string; color: string } {
  if (['draft', 'sent'].includes(estimate.status) && estimate.created_at) {
    const created = new Date(estimate.created_at);
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
