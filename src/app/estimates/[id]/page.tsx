import { getEstimateDetails, searchCatalog, getCompanyProfile } from '@/app/actions';
import EstimateEditor from '@/components/EstimateEditor';
import Link from 'next/link';

export default async function EstimateDocumentPage({ params }: { params: { id: string } }) {
  const { estimate, rows = [] } = await getEstimateDetails(params.id);
  const catalog = await searchCatalog() || [];
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
