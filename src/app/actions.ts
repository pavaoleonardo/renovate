'use server'

import { Estimate, EstimateRow, CatalogService, CatalogPhase, CompanyProfile, LabourCategory, PriceSourceKind } from '@/types';
import { DEFAULT_CATALOG } from '@/lib/default-catalog';
import { catalogKey } from '@/lib/catalog-key';
import { findMarketBand, matchPhaseName } from '@/lib/catalog-match';
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

  // Row ids are generated client-side (crypto.randomUUID), so we can upsert the
  // whole layout by id and then prune only what the user actually removed. This
  // replaces an older "delete everything, then insert": if that write failed or
  // the connection dropped, it silently wiped the lines already saved.
  const rowsToUpsert = processedRows.map(r => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { created_at, ...rest } = r as EstimateRow & { created_at?: string };
    return rest;
  });

  // 1. Store the new/updated lines first (idempotent thanks to onConflict: 'id').
  const { error: upsertError } = await supabase
    .from('estimate_rows')
    .upsert(rowsToUpsert, { onConflict: 'id' });

  if (upsertError) {
    console.error('Error saving rows', upsertError);
    return { success: false, subtotal: 0, totalWithTax: 0 };
  }

  // 2. Remove the lines the user deleted — only after the rest is safely stored,
  //    so a failure here can never lose a budget.
  const keepIds = rowsToUpsert.map(r => r.id);
  const pruneQuery = supabase
    .from('estimate_rows')
    .delete()
    .eq('estimate_id', estimateId);

  const { error: pruneError } = keepIds.length > 0
    ? await pruneQuery.not('id', 'in', `(${keepIds.join(',')})`)
    : await pruneQuery;

  if (pruneError) {
    console.error('Error pruning removed rows', pruneError);
  }

  // 3. Finally reflect the recomputed totals on the estimate itself.
  await supabase
    .from('estimates')
    .update({ subtotal_amount: totals.subtotal, total_amount: totals.total })
    .eq('id', estimateId);

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
      price_source: (s.price_source as string) ?? null,
      price_source_url: (s.price_source_url as string) ?? null,
      price_reviewed_at: (s.price_reviewed_at as string) ?? null,
      source_kind: (s.source_kind as PriceSourceKind) ?? null,
      labour_hours: (s.labour_hours as number) ?? null,
      labour_category: (s.labour_category as LabourCategory) ?? null,
      material_anchor: (s.material_anchor as string) ?? null,
      _phaseOrder: phaseInfo?.order ?? 999,
    };
  });
  
  // Sort by phase order, then by service name within each phase
  services.sort((a, b) => a._phaseOrder - b._phaseOrder || a.name.localeCompare(b.name));
  
  return services as CatalogService[];
}

/** Lo que hizo una importación, para contarlo en /catalog. */
export interface ImportSummary {
  phasesCreated: number
  phasesReused: number
  servicesCreated: number
  servicesSkipped: number
  servicesWithBand: number
}

/**
 * Guarda las secciones y partidas leídas de un documento subido.
 *
 * Es una FUSIÓN, nunca un insert ciego: una sección cuyo nombre se parece a una que
 * la empresa ya tiene —sin contar acentos ni mayúsculas, y dando por válido que un
 * nombre esté contenido en otro— recibe las partidas importadas en vez de
 * duplicarse. Las partidas que ya están en esa sección se saltan, así que importar
 * dos veces el mismo documento no cambia nada.
 *
 * Cada línea cuyo nombre coincide con una partida del catálogo por defecto se
 * guarda con la banda de mercado de esa partida (`price_min` / `price_max`). La
 * banda es una referencia nuestra: el precio es el del documento y por eso no se le
 * atribuye ninguna base (`price_source` queda vacío).
 */
export async function addPhaseAndServices(
  phases: Omit<CatalogPhase, 'id'>[],
  phaseServicesMap: Record<number, Omit<CatalogService, 'id' | 'phase_id'>[]>
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    phasesCreated: 0,
    phasesReused: 0,
    servicesCreated: 0,
    servicesSkipped: 0,
    servicesWithBand: 0
  }

  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!userRecord?.company_id) throw new Error("Could not identify user's company.");

  const companyId = userRecord.company_id as string;

  // Secciones que ya existen: la importada se fusiona con la que se le parezca.
  const { data: existingPhases } = await supabase
    .from('catalog_phases')
    .select('id, name')
    .eq('company_id', companyId);

  const existingNames = (existingPhases ?? []).map((p: { name: string }) => String(p.name));
  const phaseIdByKey = new Map<string, string>();
  for (const p of existingPhases ?? []) {
    phaseIdByKey.set(catalogKey(String(p.name)), String(p.id));
  }

  // Partidas que ya existen, para no duplicarlas al reimportar.
  const takenInPhase = new Set<string>();
  const takenCodes = new Set<string>();
  const phaseIds = (existingPhases ?? []).map((p: { id: string }) => String(p.id));
  if (phaseIds.length > 0) {
    const { data: existingServices } = await supabase
      .from('catalog_services')
      .select('code, name, phase_id')
      .in('phase_id', phaseIds);
    for (const row of existingServices ?? []) {
      takenInPhase.add(`${row.phase_id}:${catalogKey(String(row.name))}`);
      if (row.code) takenCodes.add(catalogKey(String(row.code)));
    }
  }

  let orderIndex = existingPhases?.length ?? 0;

  for (let i = 0; i < phases.length; i++) {
    const incomingName = phases[i].name;
    const matchedName = matchPhaseName(incomingName, existingNames);
    let phaseId: string | null = matchedName ? (phaseIdByKey.get(catalogKey(matchedName)) ?? null) : null;

    if (phaseId) {
      summary.phasesReused++;
    } else {
      const { data: phaseData, error: phaseErr } = await supabase
        .from('catalog_phases')
        .insert({ name: incomingName, company_id: companyId, order_index: orderIndex })
        .select('id')
        .single();

      if (phaseErr || !phaseData) continue;

      phaseId = String(phaseData.id);
      phaseIdByKey.set(catalogKey(incomingName), phaseId);
      existingNames.push(incomingName);
      orderIndex++;
      summary.phasesCreated++;
    }

    const services = phaseServicesMap[i] || [];
    const rows: Record<string, unknown>[] = [];

    for (const service of services) {
      const nameKey = catalogKey(String(service.name));
      if (!nameKey) {
        summary.servicesSkipped++;
        continue;
      }
      if (takenInPhase.has(`${phaseId}:${nameKey}`)) {
        summary.servicesSkipped++;
        continue;
      }

      const code = (service as { code?: string | null }).code ?? null;
      if (code && takenCodes.has(catalogKey(code))) {
        summary.servicesSkipped++;
        continue;
      }

      const band = findMarketBand({ name: service.name, code });

      rows.push({
        phase_id: phaseId,
        name: service.name,
        unit: service.unit,
        base_price: service.base_price,
        code,
        origin: 'excel',
        price_min: band?.price_min ?? null,
        price_max: band?.price_max ?? null
      });
    }

    if (rows.length === 0) continue;

    // Guarda las partidas. Si el entorno todavía no tiene la migración
    // 20260927000000 (code / price_min / price_max) se reintenta sin esas
    // columnas: una columna que falta nunca debe hacer perder una importación.
    const firstAttempt = await supabase.from('catalog_services').insert(rows);
    let error = firstAttempt.error;
    let stored: Record<string, unknown>[] = rows;

    if (error) {
      stored = rows.map((row) => ({
        phase_id: row.phase_id,
        name: row.name,
        unit: row.unit,
        base_price: row.base_price,
        origin: row.origin
      }));
      const secondAttempt = await supabase.from('catalog_services').insert(stored);
      error = secondAttempt.error;
    }

    if (error) throw new Error(catalogErrorMessage(error.message));

    for (const row of stored) {
      takenInPhase.add(`${row.phase_id}:${catalogKey(String(row.name))}`);
      if (row.code) takenCodes.add(catalogKey(String(row.code)));
    }

    summary.servicesCreated += stored.length;
    summary.servicesWithBand += stored.filter((row) => row.price_min != null).length;
  }

  return summary;
}

/**
 * Provenance fields of the default catalogue (migration 20260928000000). They are
 * informative for the product, so when an environment has not run that migration
 * yet the seed retries without them: a missing optional column must never leave a
 * company without a catalogue.
 */
const PROVENANCE_FIELDS = [
  'price_source',
  'price_source_url',
  'price_reviewed_at',
  'source_kind',
  'labour_hours',
  'labour_category',
  'material_anchor',
] as const

const isMissingProvenanceColumn = (message: string) => {
  const text = message.toLowerCase()
  return (
    PROVENANCE_FIELDS.some((field) => text.includes(field)) &&
    /does not exist|could not find|schema cache/.test(text)
  )
}

const stripProvenance = (row: Record<string, unknown>): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...row }
  for (const field of PROVENANCE_FIELDS) delete copy[field]
  return copy
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
 * - `if-empty` (por defecto): sólo actúa si la empresa no tiene ninguna sección.
 * - `merge`: añade únicamente las partidas que faltan (por código, y por nombre
 *   dentro de la misma sección). No borra nada. Es la opción segura para empresas
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
        source_kind: service.source_kind,
        labour_hours: service.labour_hours,
        labour_category: service.labour_category,
        material_anchor: service.material_anchor,
        price_source: service.price_source,
        price_source_url: service.price_source_url,
        price_reviewed_at: service.price_reviewed_at,
      }));

    if (rows.length === 0) continue;

    const { error: serviceError } = await supabase.from('catalog_services').insert(rows);
    if (serviceError) {
      // Retry without the provenance fields when this environment has not applied
      // migration 20260928000000 yet.
      const fallback = isMissingProvenanceColumn(serviceError.message)
        ? await supabase.from('catalog_services').insert(rows.map(stripProvenance))
        : null;
      if (!fallback || fallback.error) {
        const failure = fallback?.error ?? serviceError;
        return { ...empty, phasesCreated, servicesCreated, servicesSkipped, success: false, error: catalogErrorMessage(failure.message) };
      }
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
 * Para las páginas que necesitan catálogo: si la empresa no tiene ninguna sección,
 * carga el catálogo por defecto. Si ya tiene catálogo, no hace nada.
 */
export async function ensureCatalog(): Promise<{ seeded: boolean; services: number }> {
  const result = await seedDefaultCatalog({ mode: 'if-empty' })
  return { seeded: result.success && result.servicesCreated > 0, services: result.servicesCreated }
}
