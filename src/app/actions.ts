'use server'

import { Estimate, EstimateRow, CatalogService, CatalogPhase, CompanyProfile, LabourCategory, PriceSourceKind, PendingNote, PendingNoteStatus } from '@/types';
import { DEFAULT_CATALOG } from '@/lib/default-catalog';
import { IMPORT_AI_ENDPOINT, aiRateLimitReached, askOpenAiJson, recordAiCall } from '@/lib/ai';
import { catalogKey } from '@/lib/catalog-key';
import {
  ExistingService,
  ImportedServiceInput,
  importLineKey,
  matchIncomingService,
  parseSectionMatches,
  priceChanged,
  sectionMatchPrompt,
  unmatchedSections
} from '@/lib/catalog-import';
import { bandSuggestedPrice, findMarketMatch, matchPhaseName } from '@/lib/catalog-match';
import { IMPORT_ESTIMATE_SOURCE, todayIsoDate } from '@/lib/price-basis';
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
  // Row ids are generated client-side (crypto.randomUUID), so we can upsert the
  // whole layout by id and then prune only what the user actually removed. This
  // replaces an older "delete everything, then insert": if that write failed or
  // the connection dropped, it silently wiped the lines already saved.
  //
  // Only columns that really exist on estimate_rows are sent. Spreading the whole
  // row object used to push fields the table did not know (the client_note the
  // editor filled in) and Postgres rejected the *entire* upsert with "column
  // client_note does not exist" — the budget never saved and nobody was told. An
  // allow-list stops any future extra field from doing the same.
  const rowsToUpsert = processedRows.map(r => ({
    id: r.id,
    estimate_id: r.estimate_id,
    type: r.type,
    position: r.position,
    phase_name_snapshot: r.phase_name_snapshot ?? null,
    service_name_snapshot: r.service_name_snapshot ?? null,
    unit_snapshot: r.unit_snapshot ?? null,
    price_snapshot: r.price_snapshot ?? null,
    client_note: r.client_note ?? null,
    quantity: r.quantity ?? 0,
    total: r.total ?? 0,
  }));

  // 1. Store the new/updated lines first (idempotent thanks to onConflict: 'id').
  const { error: upsertError } = await supabase
    .from('estimate_rows')
    .upsert(rowsToUpsert, { onConflict: 'id' });

  if (upsertError) {
    console.error('Error saving rows', upsertError);
    return { success: false, error: upsertError.message, subtotal: 0, totalWithTax: 0 };
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

  return { success: true, error: null, subtotal: totals.subtotal, totalWithTax: totals.total };
}

export async function updateEstimateStatus(estimateId: string, status: Estimate['status']) {
  const supabase = createClient();
  
  const update: Record<string, unknown> = { status };

  // Freeze what the client accepted: turning a budget into "Aceptado" records the
  // figures it was approved with, so a later edit to the lines cannot rewrite them.
  if (status === 'approved') {
    const { data: current } = await supabase
      .from('estimates')
      .select('status, subtotal_amount, total_amount')
      .eq('id', estimateId)
      .single();
    if (current && current.status !== 'approved') {
      update.approved_subtotal = current.subtotal_amount ?? 0;
      update.approved_total = current.total_amount ?? 0;
    }
  }

  const { data, error } = await supabase
    .from('estimates')
    .update(update)
    .eq('id', estimateId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  
  return { success: true, estimate: data as Estimate };
}

/**
 * Creates a "Modificación": an addendum budget that hangs from a principal one.
 * It copies the client, address, VAT and warranty so the user only has to add the
 * extra lines — and, with a negative price, the removed work.
 */
export async function createModificacion(parentEstimateId: string) {
  const supabase = createClient();

  const { data: parent, error: parentError } = await supabase
    .from('estimates')
    .select('company_id, client_name, property_address, tax_rate, warranty_months')
    .eq('id', parentEstimateId)
    .single();

  if (parentError || !parent) throw new Error('No se encontró el presupuesto original.');

  const { data, error } = await supabase
    .from('estimates')
    .insert({
      company_id: parent.company_id,
      client_name: parent.client_name,
      property_address: parent.property_address,
      status: 'draft',
      subtotal_amount: 0,
      total_amount: 0,
      tax_rate: parent.tax_rate,
      warranty_months: parent.warranty_months,
      kind: 'modificacion',
      parent_estimate_id: parentEstimateId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/estimates');
  return data as Estimate;
}

/** Minimal parent header (for the "Modificación del presupuesto del…" heading). */
export async function getParentEstimate(parentId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('estimates')
    .select('id, client_name, created_at')
    .eq('id', parentId)
    .single();
  return (data as { id: string; client_name: string; created_at?: string } | null);
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

/**
 * ── Cambios de esta obra (pending notes) ──────────────────────────────────────
 * Captured changes that are NOT part of the budget yet. They stay internal until
 * the user converts one into a line; nothing here is ever printed on the client
 * PDF. Scoped to the company through the estimate that owns them (RLS), like
 * estimate_rows.
 */

export async function getPendingNotes(estimateId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('estimate_pending_notes')
    .select('*')
    .eq('estimate_id', estimateId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading pending notes', error);
    return { data: [] as PendingNote[] };
  }
  return { data: (data || []) as PendingNote[] };
}

export async function addPendingNote(
  estimateId: string,
  text: string,
  hint: { section?: string | null; quantity?: number | null; price?: number | null } = {}
) {
  const clean = (text || '').trim();
  if (!clean) return { success: false as const, error: 'La nota está vacía.' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('estimate_pending_notes')
    .insert({
      estimate_id: estimateId,
      text: clean,
      section: hint.section ?? null,
      quantity: hint.quantity ?? null,
      price: hint.price ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding pending note', error);
    return { success: false as const, error: error.message };
  }

  revalidatePath('/estimates');
  return { success: true as const, note: data as PendingNote };
}

/**
 * Marks a note resolved. The line itself is created client-side (so it can be
 * reviewed and saved with the rest of the budget) — this only records what the
 * user did with the note.
 */
async function setPendingNoteStatus(noteId: string, status: PendingNoteStatus) {
  const supabase = createClient();
  const { error } = await supabase
    .from('estimate_pending_notes')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) {
    console.error('Error resolving pending note', error);
    return { success: false as const, error: error.message };
  }

  revalidatePath('/estimates');
  return { success: true as const };
}

export async function convertPendingNote(noteId: string) {
  return setPendingNoteStatus(noteId, 'converted');
}

export async function dismissPendingNote(noteId: string) {
  return setPendingNoteStatus(noteId, 'dismissed');
}

/** How many open notes each estimate has, for the badge on /estimates. */
export async function getPendingCounts(): Promise<Record<string, number>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('estimate_pending_notes')
    .select('estimate_id')
    .eq('status', 'open');

  if (error) {
    console.error('Error counting pending notes', error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data || []) as { estimate_id: string }[]) {
    counts[row.estimate_id] = (counts[row.estimate_id] || 0) + 1;
  }
  return counts;
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
  /** Partidas que ya estaban y cuyo precio ha corregido el documento. */
  servicesUpdated: number
  servicesSkipped: number
  servicesWithBand: number
  /** Partidas fusionadas con una parecida que ya existía (no idéntica). */
  servicesMergedSimilar: number
  /** Partidas que llegaron sin precio y se han guardado con la estimación de la banda. */
  servicesEstimated: number
  /** Se pidió ayuda a la IA para las secciones que no encajaban (si había alguna). */
  aiAttempted: boolean
  /** La IA no estaba disponible: la importación siguió igual, sin emparejar secciones. */
  aiUnavailable: boolean
  /** La empresa ya gastó su ventana de llamadas de IA y no se pudo preguntar. */
  aiRateLimited: boolean
  /** Secciones que la IA emparejó con una que ya existía. */
  aiAssisted: number
}

/** Las respuestas del panel de revisión: fusionar una línea concreta o crearla. */
export type ImportDecision = 'merge' | 'new'

export interface ImportOptions {
  /** Respuestas del usuario (o de la IA) para las líneas dudosas, por clave de línea. */
  decisions?: Record<string, ImportDecision>
  /**
   * Rellenar con la estimación de la banda de mercado las partidas que el documento
   * deja sin precio. Activado por defecto: un 0,00 € en el catálogo no ayuda a nadie.
   */
  fillMissingPrices?: boolean
}

/**
 * Guarda las secciones y partidas leídas de un documento subido.
 *
 * Es una FUSIÓN, nunca un insert ciego: una sección cuyo nombre se parece a una que
 * la empresa ya tiene —sin contar acentos ni mayúsculas— recibe las partidas
 * importadas en vez de duplicarse, y lo mismo hace cada partida («Demolición de
 * tabique de ladrillo» se fusiona con «Demolición de tabique» que ya estaba).
 *
 * Las partidas idénticas no se duplican y, si el documento trae un precio distinto,
 * ese precio es una corrección y se aplica (`servicesUpdated`). Cuando el parecido no
 * es concluyente, el estado es `similar` y la decisión la trae `options.decisions`
 * (respuesta del usuario en el panel de revisión, o de la IA si la pidió): con
 * `merge` se fusiona, con `new` se crea.
 *
 * Cada línea que se crea hereda la banda de mercado de la partida del catálogo por
 * defecto que describe el mismo trabajo (`price_min` / `price_max`), por nombre
 * exacto, por código o por parecido. Si el documento no trae precio y
 * `options.fillMissingPrices` está activo, la partida se guarda con la estimación de
 * esa banda y **se declara como estimación** (`IMPORT_ESTIMATE_SOURCE`); un precio
 * del documento, en cambio, no reclama ninguna base.
 *
 * Con `options.useAI` y alguna sección que no encaje con ninguna existente, se pide
 * UNA vez a la IA que diga con cuál debería fusionarse cada una. La IA nunca puede
 * inventar una sección: su respuesta se valida contra las que ya existen y, si falla,
 * la importación sigue sin ella.
 */
export async function addPhaseAndServices(
  phases: Omit<CatalogPhase, 'id'>[],
  phaseServicesMap: Record<number, ImportedServiceInput[]>,
  options: ImportOptions = {}
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    phasesCreated: 0,
    phasesReused: 0,
    servicesCreated: 0,
    servicesUpdated: 0,
    servicesSkipped: 0,
    servicesWithBand: 0,
    servicesMergedSimilar: 0,
    servicesEstimated: 0,
    aiAttempted: false,
    aiUnavailable: false,
    aiRateLimited: false,
    aiAssisted: 0
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

  // Partidas que ya existen: el grupo contra el que se decide cada línea importada.
  // No se duplican, pero tampoco se ignoran: si el documento trae otro precio para una
  // que ya está, es una corrección y se aplica.
  const pool: ExistingService[] = [];
  const phaseNameById = new Map<string, string>();
  for (const p of existingPhases ?? []) {
    phaseNameById.set(String((p as { id: string }).id), String((p as { name: string }).name));
  }

  const phaseIds = Array.from(phaseNameById.keys());
  if (phaseIds.length > 0) {
    const { data: existingServices } = await supabase
      .from('catalog_services')
      .select('id, code, name, unit, base_price, phase_id')
      .in('phase_id', phaseIds);
    for (const row of existingServices ?? []) {
      pool.push({
        id: String(row.id),
        name: String(row.name),
        unit: String(row.unit ?? 'ud'),
        base_price: row.base_price === null || row.base_price === undefined ? 0 : Number(row.base_price),
        phase_id: String(row.phase_id),
        phase_name: phaseNameById.get(String(row.phase_id)) ?? null,
        code: (row.code as string) ?? null
      });
    }
  }

  // ── Emparejado por IA (de pago, automático y acotado) ────────────────────────
  // La IA no es un botón que el usuario deba acordarse de pulsar: se usa sola para lo
  // que el emparejado determinista no supo resolver, que es exactamente lo que devuelve
  // `unmatchedSections`. Si no queda ninguna sección dudosa no hay llamada que pagar, y
  // el contador de `ai_rate_limits` (10 usos por hora y empresa) es el techo del gasto:
  // agotado, la importación sigue igual y el resumen lo dice.
  const aiMatchByKey = new Map<string, string>();
  if (existingNames.length > 0) {
    const unmatched = unmatchedSections(phases.map((phase) => phase.name), existingNames);

    if (unmatched.length > 0) {
      summary.aiAttempted = true;
      const ai = await matchSectionsWithAI(supabase, companyId, unmatched, existingNames);

      if (ai.status === 'rate-limited') {
        summary.aiRateLimited = true;
      } else if (ai.status === 'error') {
        summary.aiUnavailable = true;
      } else {
        ai.matches.forEach((existingName, incomingName) => {
          aiMatchByKey.set(catalogKey(incomingName), existingName);
        });
        summary.aiAssisted = aiMatchByKey.size;
      }
    }
  }

  let orderIndex = existingPhases?.length ?? 0;

  for (let i = 0; i < phases.length; i++) {
    const incomingName = phases[i].name;
    let matchedName = matchPhaseName(incomingName, existingNames);
    // La IA sólo aporta cuando lo determinista no encontró nada, y nunca puede
    // inventarse una sección: su respuesta se validó contra las que ya existen.
    if (!matchedName) matchedName = aiMatchByKey.get(catalogKey(incomingName)) ?? null;
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

    // La sección con la que se fusiona manda a la hora de medir el parecido de sus
    // partidas, y es la que se usa para la clave de la decisión del panel.
    const phaseName = matchedName ?? incomingName;
    const services = phaseServicesMap[i] || [];
    const rows: Record<string, unknown>[] = [];

    for (const service of services) {
      const nameKey = catalogKey(String(service.name));
      if (!nameKey) {
        summary.servicesSkipped++;
        continue;
      }

      const code = service.code ?? null;
      const match = matchIncomingService({ name: service.name, code }, pool, phaseName);
      // La respuesta del panel se busca por la sección con la que se fusiona y, si no
      // está, por la sección tal como venía en el documento: el resumen previo usa el
      // nombre del documento (que es el que el usuario vio) y aquí la sección puede
      // haberse fusionado con una que ya existía, con otro nombre.
      const decision =
        options.decisions?.[importLineKey(phaseName, service.name)] ??
        options.decisions?.[importLineKey(incomingName, service.name)];

      // ¿Trae precio de verdad? Un 0 sin la marca es «sin precio», y un «sin precio» no
      // puede corregir a 0 un precio que la empresa ya tenía.
      const incomingPrice = Number(service.base_price);
      const bringsPrice =
        service.has_price === true ||
        (service.has_price === undefined && Number.isFinite(incomingPrice) && incomingPrice > 0);

      // «Crear nueva» se obedece… salvo cuando la partida ya está con ese mismo nombre
      // en esa misma sección: eso no sería crear, sería duplicar.
      const target = decision === 'new' && match.status !== 'exact' ? null : match.target;

      if (target) {
        // Ya está en el catálogo: la fila se queda donde está y sólo se corrige el
        // precio, y sólo cuando el documento trae otro distinto.
        if (bringsPrice && target.id && priceChanged(target.base_price, incomingPrice)) {
          if (await updateServicePrice(supabase, target.id, incomingPrice)) summary.servicesUpdated++;
          else summary.servicesSkipped++;
        } else {
          summary.servicesSkipped++;
        }
        if (match.status === 'similar') summary.servicesMergedSimilar++;
        continue;
      }

      const market = findMarketMatch({ name: service.name, code, unit: service.unit });
      // Sin precio en el documento y con banda creíble: se guarda la estimación, que es
      // lo que evita partidas a 0,00 € en el catálogo. La estimación se declara.
      const estimate =
        !bringsPrice && options.fillMissingPrices !== false && market
          ? bandSuggestedPrice(market.band.price_min, market.band.price_max)
          : null;
      if (estimate !== null) summary.servicesEstimated++;

      const row: Record<string, unknown> = {
        phase_id: phaseId,
        name: service.name,
        unit: service.unit,
        base_price: bringsPrice ? incomingPrice : estimate ?? 0,
        code,
        origin: 'excel',
        price_min: market?.band.price_min ?? null,
        price_max: market?.band.price_max ?? null
      };
      if (estimate !== null) {
        row.price_source = IMPORT_ESTIMATE_SOURCE;
        row.price_reviewed_at = todayIsoDate();
      }

      rows.push(row);
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

    // Sin id: lo que acaba de insertarse no puede volver a actualizarse en esta misma
    // importación, pero sí cuenta como duplicado si el documento repite la línea.
    for (const row of stored) {
      pool.push({
        id: '',
        name: String(row.name),
        unit: String(row.unit ?? 'ud'),
        base_price: Number(row.base_price ?? 0),
        phase_id: String(row.phase_id),
        phase_name: phaseName,
        code: (row.code as string) ?? null
      });
    }

    summary.servicesCreated += stored.length;
    summary.servicesWithBand += stored.filter((row) => row.price_min != null).length;
  }

  return summary;
}

/**
 * Corrige el precio de una partida que ya existía, porque el documento trae otro.
 *
 * Ese precio es el del documento, así que la fila ya no puede seguir reclamando la
 * base que traía: `price_source` y `price_reviewed_at` vuelven a null. Una etiqueta
 * que describe un precio que ya no está es peor que ninguna etiqueta.
 *
 * El alcance es la propia fila (su sección ya se buscó por `company_id`). Si el
 * entorno todavía no tiene la migración de procedencia, se reintenta sólo con el
 * precio: una columna que falta no debe impedir la corrección.
 */
async function updateServicePrice(
  supabase: ReturnType<typeof createClient>,
  id: string,
  basePrice: number
): Promise<boolean> {
  const withProvenance = await supabase
    .from('catalog_services')
    .update({ base_price: basePrice, price_source: null, price_reviewed_at: null })
    .eq('id', id);
  if (!withProvenance.error) return true;

  const priceOnly = await supabase
    .from('catalog_services')
    .update({ base_price: basePrice })
    .eq('id', id);
  return !priceOnly.error;
}

/**
 * Pide a la IA que empareje secciones que no encajan con ninguna existente, en UNA
 * sola llamada por importación.
 *
 * Devuelve «nombre importado → nombre existente» ya validado contra las secciones
 * reales de la empresa: cualquier nombre que la IA se invente se descarta, así que la
 * IA no puede crear ni renombrar nada, sólo proponer una fusión.
 *
 * Devuelve `null` cuando la IA no está disponible (sin clave, límite agotado o
 * respuesta ilegible): una importación nunca debe caerse porque falle la IA.
 */
/** Respuesta de la IA al emparejado de secciones, con el motivo cuando no hay respuesta. */
interface AiSectionMatches {
  status: 'ok' | 'rate-limited' | 'error'
  matches: Map<string, string>
}

async function matchSectionsWithAI(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  unmatched: string[],
  existingNames: string[]
): Promise<AiSectionMatches> {
  try {
    // El contador se comprueba (y se cobra) antes de llamar: `rate-limited` se distingue
    // de `error` porque el mensaje que ve el usuario es distinto.
    if (await aiRateLimitReached(supabase, companyId, IMPORT_AI_ENDPOINT)) {
      return { status: 'rate-limited', matches: new Map() };
    }
    await recordAiCall(supabase, companyId, IMPORT_AI_ENDPOINT);

    // Temperatura baja: esto es una decisión de clasificación, no redacción.
    const answer = await askOpenAiJson<Record<string, unknown>>(
      sectionMatchPrompt(unmatched, existingNames),
      0.1
    );

    return { status: 'ok', matches: parseSectionMatches(answer, unmatched, existingNames) };
  } catch (error) {
    console.error('Error emparejando secciones con IA:', error);
    return { status: 'error', matches: new Map() };
  }
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
