'use server'

import { Estimate, EstimateRow, CatalogService, CatalogPhase, CompanyProfile } from '@/types';
import { createClient } from '@/lib/supabase/server';

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
  const { data: user } = await supabase.from('users').select('company_id').single();
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
  
  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
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
  
  const totalAmount = processedRows.reduce((acc, r) => acc + (r.total || 0), 0);

  // 1. Update total amount
  await supabase
    .from('estimates')
    .update({ total_amount: totalAmount })
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
    return { success: false, totalAmount: 0 };
  }

  return { success: true, totalAmount };
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
      _phaseOrder: phaseInfo?.order ?? 999,
    };
  });
  
  // Sort by phase order, then by service name within each phase
  services.sort((a, b) => a._phaseOrder - b._phaseOrder || a.name.localeCompare(b.name));
  
  return services as CatalogService[];
}

export async function addPhaseAndServices(phases: Omit<CatalogPhase, 'id'>[], phaseServicesMap: Record<number, Omit<CatalogService, 'id' | 'phase_id'>[]>) {
  const supabase = createClient();
  
  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
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
        phase_id: phaseData.id
      }));
      await supabase.from('catalog_services').insert(servicesToInsert);
    }
  }
}
