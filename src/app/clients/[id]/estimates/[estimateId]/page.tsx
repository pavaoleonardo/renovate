import EstimateEditorLoader from '@/components/EstimateEditorLoader';

/**
 * The obra editor, at its canonical address: under the client that owns it. The
 * client id in the path is the one the ficha lists, so a budget can never be
 * reached through a client that does not own it.
 */
export default async function ClientEstimatePage({
  params,
}: {
  params: { id: string; estimateId: string };
}) {
  return (
    <EstimateEditorLoader
      estimateId={params.estimateId}
      expectClientId={params.id}
      backHref={`/clients/${params.id}`}
      backLabel="Volver a la ficha del cliente"
    />
  );
}
