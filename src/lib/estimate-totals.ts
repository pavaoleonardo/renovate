/**
 * Single source of truth for the money in a budget.
 *
 * Before this file existed the VAT lived hardcoded in two places with two
 * different meanings: EstimateEditor and EstimatePDFPreview put 21 % on top of
 * the rows, while saveEstimateRows() persisted the base amount in
 * estimates.total_amount — so /estimates showed a lower, unlabelled figure than
 * the document the client had received. Now every surface (editor, PDF, email,
 * dashboard and the values the server actions persist) goes through
 * computeTotals().
 *
 * The only supported rates are 0 (no VAT), 10 (dwelling older than 2 years) and
 * 21 (general). See supabase/migrations/20260928000000_estimate_tax_rate.sql.
 */

export const TAX_RATE_OPTIONS = [
  { value: 0, label: 'Sin IVA', hint: 'El presupuesto se emite sin IVA.' },
  { value: 10, label: 'IVA 10%', hint: 'Reforma de vivienda de más de 2 años.' },
  { value: 21, label: 'IVA 21%', hint: 'Tipo general.' },
] as const;

/** Rate used for budgets that did not choose one (matches the old hardcoded 21 %). */
export const DEFAULT_TAX_RATE = 21;

export interface EstimateTotals {
  /** Sum of the rows, VAT excluded (base imponible). */
  subtotal: number;
  /** Applied VAT percentage: 0, 10 or 21. */
  taxRate: number;
  /** VAT amount; 0 when the budget is issued without VAT. */
  tax: number;
  /** subtotal + tax: the figure /estimates shows and the PDF prints as TOTAL. */
  total: number;
}

/** Money is persisted as numeric(12,2), so round to cents everywhere. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Accepts anything coming from the database, a <select> or a form and returns 0, 10 or 21. */
export function normalizeTaxRate(value: unknown): number {
  // A missing value must never mean "drop the VAT" from a client document.
  if (value === null || value === undefined || value === '') return DEFAULT_TAX_RATE;
  const rate = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(rate)) return DEFAULT_TAX_RATE;
  const match = TAX_RATE_OPTIONS.find((option) => option.value === rate);
  return match ? match.value : DEFAULT_TAX_RATE;
}

export function computeTotals(subtotal: number, taxRate: unknown): EstimateTotals {
  const rate = normalizeTaxRate(taxRate);
  const base = round2(Number(subtotal) || 0);
  const tax = round2((base * rate) / 100);
  return { subtotal: base, taxRate: rate, tax, total: round2(base + tax) };
}

/** "IVA (21%)" or "Sin IVA" — shared so the editor, the PDF and the email agree. */
export function taxLabel(taxRate: unknown): string {
  const rate = normalizeTaxRate(taxRate);
  return rate === 0 ? 'Sin IVA' : `IVA (${rate}%)`;
}

export function taxHint(taxRate: unknown): string {
  const rate = normalizeTaxRate(taxRate);
  return TAX_RATE_OPTIONS.find((option) => option.value === rate)?.hint || '';
}

/** The money columns of a stored estimate, as far as the totals are concerned. */
export interface EstimateMoney {
  /** Base imponible (VAT excluded). */
  subtotal_amount?: number | null;
  /** Base + VAT; the fallback when a row predates the tax migration. */
  total_amount?: number | null;
  tax_rate?: unknown;
}

export interface CombinedTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * Adds up a principal budget and its modifications. Each document is taxed with
 * its own rate, so the sum runs over their computed totals — never over the
 * un-taxed bases. /estimates shows the result as "12.400 € + 850 €".
 */
export function combinedTotals(estimates: EstimateMoney[]): CombinedTotals {
  return estimates.reduce<CombinedTotals>(
    (acc, e) => {
      const base = Number(e.subtotal_amount ?? e.total_amount ?? 0) || 0;
      const t = computeTotals(base, e.tax_rate);
      return {
        subtotal: round2(acc.subtotal + t.subtotal),
        tax: round2(acc.tax + t.tax),
        total: round2(acc.total + t.total),
      };
    },
    { subtotal: 0, tax: 0, total: 0 }
  );
}
