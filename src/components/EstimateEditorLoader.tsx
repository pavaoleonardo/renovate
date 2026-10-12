import { getEstimateDetails, searchCatalog, getCompanyProfile, ensureCatalog, getPendingNotes, getClients } from '@/app/actions';
import EstimateEditor from '@/components/EstimateEditor';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Everything the budget editor needs, fetched in one place.
 *
 * Two routes render it: the canonical `/clients/[clientId]/estimates/[estimateId]`,
 * and the pre-clients `/estimates/[estimateId]`, kept alive for an obra that has no
 * client (there is no client id to build the canonical path with) — its PDF is a
 * document the client may already hold, so it must stay reachable.
 */
export default async function EstimateEditorLoader({
  estimateId,
  backHref,
  backLabel,
  expectClientId,
}: {
  estimateId: string;
  backHref: string;
  backLabel: string;
  /** Canonical route only: the client the path claims, so a stale address self-corrects. */
  expectClientId?: string;
}) {
  const { estimate, rows = [] } = await getEstimateDetails(estimateId);

  // An obra can be moved to another client from the editor's header, which leaves
  // the client id in the address behind. Rather than showing one client's obra
  // under another client's path, send the browser to where the obra actually
  // lives — and to the flat /estimates address if it was left without a client.
  if (expectClientId && estimate && estimate.client_id !== expectClientId) {
    redirect(estimate.client_id ? `/clients/${estimate.client_id}/estimates/${estimateId}` : `/estimates/${estimateId}`);
  }
  const { data: pendingNotes } = await getPendingNotes(estimateId);

  // The company's clients: the editor header links this obra to one of them (and
  // adopts budgets written before `clients` existed).
  const { data: clients } = await getClients();

  let catalog = (await searchCatalog()) || [];
  if (catalog.length === 0) {
    // First time this company opens a budget with an empty catalog: load the
    // default one (42 partidas) so nobody has to start from scratch.
    await ensureCatalog();
    catalog = (await searchCatalog()) || [];
  }

  const company = await getCompanyProfile();

  if (!estimate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold text-zinc-900">Presupuesto no encontrado</h2>
        <Link href={backHref} className="text-blue-600 hover:underline">{backLabel}</Link>
      </div>
    );
  }

  return (
    <EstimateEditor
      initialEstimate={estimate}
      initialRows={rows}
      catalog={catalog}
      company={company}
      clients={clients}
      initialPendingNotes={pendingNotes || []}
    />
  );
}
