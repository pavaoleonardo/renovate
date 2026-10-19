import * as xlsx from 'xlsx';
import { NextResponse } from 'next/server';
import { collectCatalogPages } from '@/lib/catalog-pages';
import { catalogTemplateRows, defaultCatalogPhases } from '@/lib/catalog-template';
import { createClient } from '@/lib/supabase/server';
import type { CatalogService } from '@/types';

/**
 * Downloads the company's catalogue as an Excel sheet: one partida per row, with the
 * column headers the /catalog importer recognises (Fase, Código, Partida, Descripción,
 * Unidad, Precio). Editing this file and importing it again is the shortest path to a
 * company's own price list, and it doubles as an export.
 *
 * It reads the company's real table, not just the seeded catalogue: the button says
 * «descarga tus partidas» and the imported ones have to be in the file (they were not:
 * the download always returned the 60 default partidas, so the code column of a
 * company's own partidas never made the round trip). A company with no catalogue yet
 * gets the default one, which is still a valid template to start from.
 *
 * Served from the server on purpose: /catalog must not pull `xlsx` into the browser
 * bundle (see SPEC §5 and src/lib/document-formats.ts).
 */
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  const companyId = userRecord?.company_id ? String(userRecord.company_id) : null;
  const phases = companyId ? await loadCompanyCatalog(supabase, companyId) : [];
  const rows = catalogTemplateRows(phases.length > 0 ? phases : defaultCatalogPhases());

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 }, { wch: 10 }, { wch: 54 }, { wch: 64 }, { wch: 7 }, { wch: 11 }, { wch: 12 }, { wch: 12 },
  ];

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, 'Catalogo');
  // `array` avoids Node's Buffer, whose type is not assignable to BodyInit here.
  const body = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' }) as BodyInit;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-catalogo.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * The company's catalogue, section by section and in its own order. The read is
 * bounded (`collectCatalogPages`) because a company that imports big documents ends up
 * with thousands of partidas, and a truncated download is worse than a slow one.
 */
async function loadCompanyCatalog(
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<{ name: string; services: CatalogService[] }[]> {
  const { data: phaseRows } = await supabase
    .from('catalog_phases')
    .select('id, name')
    .eq('company_id', companyId)
    .order('order_index', { ascending: true });

  const phases = ((phaseRows ?? []) as { id: string; name: string }[]).map((phase) => ({
    id: String(phase.id),
    name: String(phase.name),
    services: [] as CatalogService[],
  }));
  if (phases.length === 0) return [];

  const phaseIds = phases.map((phase) => phase.id);
  const services = await collectCatalogPages<CatalogService>((window) =>
    loadServicePage(supabase, phaseIds, window.from, window.to)
  );

  const byPhaseId = new Map(phases.map((phase) => [phase.id, phase]));
  for (const service of services) {
    byPhaseId.get(String(service.phase_id))?.services.push(service);
  }

  return phases.map((phase) => ({ name: phase.name, services: phase.services }));
}

async function loadServicePage(
  supabase: ReturnType<typeof createClient>,
  phaseIds: string[],
  from: number,
  to: number
): Promise<CatalogService[]> {
  const { data } = await supabase
    .from('catalog_services')
    .select('id, phase_id, name, code, description, unit, base_price, price_min, price_max, origin')
    .in('phase_id', phaseIds)
    // Deterministic order: without it a windowed read can repeat or skip rows.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to);

  return ((data ?? []) as unknown as CatalogService[]).map((row) => ({
    ...row,
    base_price: Number(row.base_price ?? 0),
    name: String(row.name ?? ''),
    unit: String(row.unit ?? 'ud'),
  }));
}
