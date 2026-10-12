import { redirect } from 'next/navigation';
import { getEstimateDetails } from '@/app/actions';
import EstimateEditorLoader from '@/components/EstimateEditorLoader';

/**
 * Pre-clients address of an obra, kept for bookmarks. It redirects to the obra's
 * canonical home under its client.
 *
 * Only a budget WITHOUT a client is rendered here instead: there is no client id
 * to build the canonical path with, and dropping it at /clients would leave a real
 * document (its PDF is in someone's inbox) with no way to be opened.
 */
export default async function LegacyEstimatePage({ params }: { params: { id: string } }) {
  const { estimate } = await getEstimateDetails(params.id);

  if (estimate?.client_id) {
    redirect(`/clients/${estimate.client_id}/estimates/${params.id}`);
  }

  return (
    <EstimateEditorLoader
      estimateId={params.id}
      backHref="/clients"
      backLabel="Volver a mis clientes"
    />
  );
}
