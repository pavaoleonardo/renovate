import { getEstimateDetails, searchCatalog, getCompanyProfile, ensureCatalog } from '@/app/actions';
import EstimateEditor from '@/components/EstimateEditor';
import Link from 'next/link';

export default async function EstimateDocumentPage({ params }: { params: { id: string } }) {
  const { estimate, rows = [] } = await getEstimateDetails(params.id);

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
        <Link href="/estimates" className="text-blue-600 hover:underline">Volver al listado</Link>
      </div>
    );
  }

  return (
    <EstimateEditor 
      initialEstimate={estimate} 
      initialRows={rows} 
      catalog={catalog}
      company={company}
    />
  );
}
