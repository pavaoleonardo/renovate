'use server'

import { Estimate, EstimateRow, CatalogService, CatalogPhase, CompanyProfile } from '@/types';
import { DEFAULT_CATALOG } from '@/lib/default-catalog';
import { catalogErrorMessage } from '@/lib/catalog-errors';
import { computeTotals, normalizeTaxRate } from '@/lib/estimate-totals';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getEstimates() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .order('created_at', { ascending: false });
    
  return { data: (data || []) as Estimate[], error };
}

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const supabase = createClient();

  // Get the authenticated user from auth first
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: user } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', authUser.id)
    .single();

  if (!user?.company_id) return null;
  
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', user.company_id)
    .single();
  
  if (error || !data) return null;
  return data as CompanyProfile;
}

export async function createEstimate(client_name: string, property_address: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  
  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();
    
  if (!userRecord?.company_id) throw new Error("Could not identify user's company.");

  const { data, error } = await supabase
    .from('estimates')
    .insert({
      company_id: userRecord.company_id,
      client_name: client_name || 'Nuevo Cliente',
      property_address: property_address || 'Pendiente',
      status: 'draft',
      total_amount: 0,
      // subtotal_amount (0) and tax_rate (21) come from the column defaults, so
      // creating a budget keeps working even before the tax migration is applied.
      warranty_months: 12
    })
    .select()
    .single();
    
  if (error) throw new Error(error.message);
  return data as Estimate;
}

export async function updateEstimateInfo(id: string, updates: { client_name?: string; property_address?: string }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('estimates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Estimate;
}

export async function getEstimateDetails(id: string) {
  const supabase = createClient();
  
  const { data: estimate, error: estError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single();

  if (estError || !estimate) {
    throw new Error('Estimate not found');
  }

  const { data: rows, error: rowsError } = await supabase
    .from('estimate_rows')
    .select('*')
    .eq('estimate_id', id)
    .order('position', { ascending: true });

  if (rowsError) {
    console.error(rowsError);
  }

  return { 
    estimate: estimate as Estimate, 
    rows: (rows || []) as EstimateRow[] 
  };
}

export async function saveEstimateRows(estimateId: string, rows: EstimateRow[]) {
  const supabase = createClient();
  
  const processedRows = rows.map((r, index) => {
    const isItem = r.type === 'item';
    const total = isItem ? (r.price_snapshot || 0) * (r.quantity || 0) : 0;
    return {
      ...r,
      position: index,
      total,
      estimate_id: estimateId,
    };
  });
  
  const subtotalAmount = processedRows.reduce((acc, r) => acc + (r.total || 0), 0);

  // The VAT lives on the estimate now (0 %, 10 % or 21 %), not on the row data,
  // so read it here: both totals are stored with the same meaning the editor and
  // the PDF display.
  const { data: current } = await supabase
    .from('estimates')
    .select('tax_rate')
    .eq('id', estimateId)
    .single();

  const totals = computeTotals(subtotalAmount, current?.tax_rate);

  // 1. Update both stored totals (base imponible + total with VAT)
  await supabase
    .from('estimates')
    .update({ subtotal_amount: totals.subtotal, total_amount: totals.total })
    .eq('id', estimateId);

  // 2. Wipe existing rows
  await supabase
    .from('estimate_rows')
    .delete()
    .eq('estimate_id', estimateId);

  // 3. Insert newly synced ordered layout
  const rowsToInsert = processedRows.map(r => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...rest } = r as EstimateRow & { created_at?: string };
    return { id, ...rest };
  });

  const { error } = await supabase.from('estimate_rows').insert(rowsToInsert);

  if (error) {
    console.error('Error saving rows', error);
    return { success: false, subtotal: 0, totalWithTax: 0 };
  }

  return { success: true, subtotal: totals.subtotal, totalWithTax: totals.total };
}

export async function updateEstimateStatus(estimateId: string, status: Estimate['status']) {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('estimates')
    .update({ status })
    .eq('id', estimateId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  
  return { success: true, estimate: data as Estimate };
}

/**
 * Changes the VAT applied to a budget (0 %, 10 % or 21 %) and recomputes the
 * stored totals from the rows already in the database, so the dashboard can
 * never drift from the document even if the user leaves without saving.
 */
export async function updateEstimateTaxRate(estimateId: string, taxRate: number) {
  const supabase = createClient();
  const rate = normalizeTaxRate(taxRate);

  const { data: rows } = await supabase
    .from('estimate_rows')
    .select('type, price_snapshot, quantity')
    .eq('estimate_id', estimateId);

  const subtotalAmount = (rows || []).reduce((acc, row) => {
    const r = row as { type: string; price_snapshot: number | null; quantity: number | null };
    if (r.type !== 'item') return acc;
    return acc + (Number(r.price_snapshot) || 0) * (Number(r.quantity) || 0);
  }, 0);

  const totals = computeTotals(subtotalAmount, rate);

  const { data, error } = await supabase
    .from('estimates')
    .update({
      tax_rate: totals.taxRate,
      subtotal_amount: totals.subtotal,
      total_amount: totals.total,
    })
    .eq('id', estimateId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/estimates');
  revalidatePath(`/estimates/${estimateId}`);

  return { success: true, estimate: data as Estimate };
}

export async function searchCatalog(): Promise<CatalogService[]> {
  const supabase = createClient();
  
  // Get phases in order
  const { data: phases } = await supabase
    .from('catalog_phases')
    .select('id, name, order_index')
    .order('order_index', { ascending: true });
  
  const phaseMap = new Map<string, { name: string; order: number }>();
  (phases || []).forEach((p: { id: string; name: string; order_index: number }) => {
    phaseMap.set(p.id, { name: p.name, order: p.order_index });
  });

  const { data, error } = await supabase
    .from('catalog_services')
    .select('*');
  
  if (error) return [];
  
  const services = (data || []).map((s: Record<string, unknown>) => {
    const phaseInfo = phaseMap.get(s.phase_id as string);
    return {
      id: s.id as string,
      name: s.name as string,
      unit: s.unit as string,
      base_price: s.base_price as number,
      phase_id: s.phase_id as string,
      phase_name: phaseInfo?.name || 'Sin categoría',
      code: (s.code as string) ?? null,
      description: (s.description as string) ?? null,
      price_min: (s.price_min as number) ?? null,
      price_max: (s.price_max as number) ?? null,
      origin: (s.origin as string) ?? null,
      _phaseOrder: phaseInfo?.order ?? 999,
    };
  });
  
  // Sort by phase order, then by service name within each phase
  services.sort((a, b) => a._phaseOrder - b._phaseOrder || a.name.localeCompare(b.name));
  
  return services as CatalogService[];
}

export async function addPhaseAndServices(phases: Omit<CatalogPhase, 'id'>[], phaseServicesMap: Record<number, Omit<CatalogService, 'id' | 'phase_id'>[]>) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  
  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();
    
  if (!userRecord?.company_id) throw new Error("Could not identify user's company.");

  for (let i = 0; i < phases.length; i++) {
    const { data: phaseData, error: phaseErr } = await supabase
      .from('catalog_phases')
      .insert({ 
        name: phases[i].name, 
        company_id: userRecord.company_id,
        order_index: i
      })
      .select('id')
      .single();

    if (phaseErr || !phaseData) continue;
    
    const services = phaseServicesMap[i] || [];
    if (services.length > 0) {
      const servicesToInsert = services.map((s: Omit<CatalogService, 'id' | 'phase_id'>) => ({
        ...s,
        phase_id: phaseData.id,
        origin: 'excel'
      }));
      await supabase.from('catalog_services').insert(servicesToInsert);
    }
  }
}

type SeedMode = 'if-empty' | 'replace' | 'merge'

export interface SeedResult {
  success: boolean
  mode: SeedMode
  phasesCreated: number
  servicesCreated: number
  servicesSkipped: number
  error?: string
}

const normalize = (value: string) => value.trim().toLowerCase()

/**
 * Carga el catálogo por defecto en el catálogo de la empresa del usuario.
 *
 * - `if-empty` (por defecto): sólo actúa si la empresa no tiene ninguna fase.
 * - `merge`: añade únicamente las partidas que faltan (por código, y por nombre
 *   dentro de la misma fase). No borra nada. Es la opción segura para empresas
 *   que ya tienen su propio catálogo importado.
 * - `replace`: borra el catálogo de la empresa y carga el catálogo por defecto.
 *   Destructivo: la UI debe pedir confirmación explícita.
 */
export async function seedDefaultCatalog(options?: { mode?: SeedMode }): Promise<SeedResult> {
  const mode: SeedMode = options?.mode ?? 'if-empty'
  const empty: SeedResult = { success: true, mode, phasesCreated: 0, servicesCreated: 0, servicesSkipped: 0 }
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...empty, success: false, error: 'No autenticado.' };

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  const companyId = userRecord?.company_id as string | undefined;
  if (!companyId) {
    return { ...empty, success: false, error: 'No se encontró la empresa del usuario.' };
  }

  const { data: existingPhases } = await supabase
    .from('catalog_phases')
    .select('id, name')
    .eq('company_id', companyId);

  const hasCatalog = (existingPhases?.length ?? 0) > 0;

  if (mode === 'if-empty' && hasCatalog) {
    return { ...empty, servicesSkipped: 0 };
  }

  if (mode === 'replace' && hasCatalog) {
    // Borra SOLO el catálogo de esta empresa: nunca fiarse únicamente de RLS.
    const phaseIds = (existingPhases || []).map((p: { id: string }) => p.id);
    if (phaseIds.length > 0) {
      await supabase.from('catalog_services').delete().in('phase_id', phaseIds);
    }
    await supabase.from('catalog_phases').delete().eq('company_id', companyId);
  }

  // Índices para no duplicar nada en modo merge
  const phaseIdByName = new Map<string, string>();
  if (mode !== 'replace') {
    for (const p of existingPhases ?? []) {
      phaseIdByName.set(normalize(String(p.name)), String(p.id));
    }
  }

  const existingCodes = new Set<string>();
  const existingNamePerPhase = new Set<string>();
  if (mode === 'merge' && hasCatalog) {
    const phaseIds = (existingPhases || []).map((p: { id: string }) => p.id);
    const { data: rows } = await supabase
      .from('catalog_services')
      .select('code, name, phase_id')
      .in('phase_id', phaseIds);
    for (const row of rows ?? []) {
      if (row.code) existingCodes.add(String(row.code));
      existingNamePerPhase.add(`${row.phase_id}:${normalize(String(row.name))}`);
    }
  }

  let phasesCreated = 0;
  let servicesCreated = 0;
  let servicesSkipped = 0;

  for (let i = 0; i < DEFAULT_CATALOG.length; i++) {
    const phase = DEFAULT_CATALOG[i];
    let phaseId = phaseIdByName.get(normalize(phase.name)) ?? null;

    if (!phaseId) {
      const { data: phaseData, error: phaseError } = await supabase
        .from('catalog_phases')
        .insert({ name: phase.name, company_id: companyId, order_index: (existingPhases?.length ?? 0) + i })
        .select('id')
        .single();

      if (phaseError || !phaseData) {
        return { ...empty, phasesCreated, servicesCreated, servicesSkipped, success: false, error: catalogErrorMessage(phaseError?.message) };
      }

      phaseId = String(phaseData.id);
      phaseIdByName.set(normalize(phase.name), phaseId);
      phasesCreated++;
    }

    const rows = phase.services
      .filter((service) => {
        if (existingCodes.has(service.code)) { servicesSkipped++; return false; }
        if (existingNamePerPhase.has(`${phaseId}:${normalize(service.name)}`)) { servicesSkipped++; return false; }
        return true;
      })
      .map((service) => ({
        phase_id: phaseId as string,
        name: service.name,
        unit: service.unit,
        base_price: service.base_price,
        code: service.code,
        description: service.description,
        price_min: service.price_min,
        price_max: service.price_max,
        origin: 'catalogo_base',
      }));

    if (rows.length === 0) continue;

    const { error: serviceError } = await supabase.from('catalog_services').insert(rows);
    if (serviceError) {
      return { ...empty, phasesCreated, servicesCreated, servicesSkipped, success: false, error: catalogErrorMessage(serviceError.message) };
    }

    for (const row of rows) {
      existingCodes.add(row.code);
      existingNamePerPhase.add(`${row.phase_id}:${normalize(row.name)}`);
    }
    servicesCreated += rows.length;
  }

  revalidatePath('/catalog');
  revalidatePath('/estimates');

  return { success: true, mode, phasesCreated, servicesCreated, servicesSkipped };
}

/**
 * Para las páginas que necesitan catálogo: si la empresa no tiene ninguna fase,
 * carga el catálogo por defecto. Si ya tiene catálogo, no hace nada.
 */
export async function ensureCatalog(): Promise<{ seeded: boolean; services: number }> {
  const result = await seedDefaultCatalog({ mode: 'if-empty' })
  return { seeded: result.success && result.servicesCreated > 0, services: result.servicesCreated }
}
