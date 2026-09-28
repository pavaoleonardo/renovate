export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'expired';
export type RowType = 'phase' | 'item' | 'note';

export interface Estimate {
  id: string;
  client_name: string;
  property_address: string;
  status: EstimateStatus;
  /** Sum of the rows, VAT excluded (base imponible). */
  subtotal_amount: number;
  /** Applied VAT percentage: 0 (sin IVA), 10 (vivienda > 2 años) or 21 (general). */
  tax_rate: number;
  /** subtotal_amount + VAT. The figure shown on /estimates and as TOTAL in the PDF. */
  total_amount: number;
  warranty_months: number;
  warranty_end_date: string | null;
  created_at?: string;
}

export interface EstimateRow {
  id: string;
  type: RowType;
  position: number;
  
  // Snapshots
  phase_name_snapshot: string | null;
  service_name_snapshot: string | null;
  unit_snapshot: string | null;
  price_snapshot: number | null;
  
  // Client-facing description (plain language note for the PDF)
  client_note?: string | null;

  quantity: number;
  total: number;
}

export type CatalogUnit = 'm2' | 'ml' | 'm3' | 'ud' | 'vg' | 'h' | 'kg';

/**
 * What drives the cost of a partida — labour, material, both, or an administrative
 * fee. It is a cost driver, not a provenance claim: the basis itself is written in
 * `price_source` (see docs/catalogo-precios.md).
 */
export type PriceSourceKind = 'labour' | 'material' | 'mixed' | 'admin-fee';

/** Trade category the labour hours of a partida are priced at. */
export type LabourCategory = 'peón' | 'of.1' | 'of.2' | 'espec.' | 'téc.';

export interface CatalogService {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  phase_id: string;
  phase_name?: string;
  /** Metadata used by the default catalog and by future Excel / BC3 round-trips. */
  code?: string | null;
  description?: string | null;
  /** Market band shown as a hint when reviewing a price. */
  price_min?: number | null;
  price_max?: number | null;
  /** 'catalogo_base' | 'excel' | 'manual' */
  origin?: string | null;
  /** Basis shown under the price; never a licensed base name unless actually licensed. */
  price_source?: string | null;
  /** Public reference for this specific price; null when there is none. */
  price_source_url?: string | null;
  /** ISO date a human last reviewed this price; older than 12 months reads as stale. */
  price_reviewed_at?: string | null;
  /** Cost driver of the partida. */
  source_kind?: PriceSourceKind | null;
  /** Labour content per unit, recorded so a later job can recompute the price. */
  labour_hours?: number | null;
  labour_category?: LabourCategory | null;
  /** Commodity family the material cost is anchored to. */
  material_anchor?: string | null;
}

export interface CatalogPhase {
  id: string;
  name: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  cif: string | null;
  logo_url: string | null;
}

/**
 * Result of analysing an uploaded Excel on /catalog, shown BEFORE anything is
 * saved: which column was read as the price and what each line will become.
 */
export interface ExcelPreviewService {
  name: string;
  unit: string;
  base_price: number;
  hasPrice: boolean;
}

export interface ExcelPreviewPhase {
  name: string;
  services: ExcelPreviewService[];
}

/** One column of the uploaded document, with a sample of what is inside it. */
export interface ExcelPreviewColumn {
  index: number;
  letter: string;
  header: string;
  /** First few values of the column («12,35», «45,90»…), to recognise it at a glance. */
  samples: string[];
  /** How many cells of the column hold a number. */
  numbers: number;
}

/** Sheet of the document partidas were actually read from. */
export interface ExcelPreviewSheet {
  name: string;
  phases: number;
  services: number;
}

export interface ExcelPreview {
  /** Name of the uploaded file. */
  fileName: string;
  /** Excel, CSV, PDF, Word… as read by the server. */
  documentKind: string;
  /** Only the sheets that contributed partidas. */
  sheets: ExcelPreviewSheet[];
  /** Columns of the sheet used, so the user can pick the price column by hand. */
  columns: ExcelPreviewColumn[];
  /** True when the user asked to import every line without a price. */
  ignorePrices: boolean;
  phases: ExcelPreviewPhase[];
  priceColumn: { letter: string; header: string; detectedByHeader: boolean; chosenByUser: boolean };
  /**
   * Column the sections were read from, when the sheet has one. `null` means the
   * sections were guessed from the title rows of the sheet.
   */
  sectionColumn: { letter: string; header: string } | null;
  /** Column read as the description of each partida. */
  nameColumn: { letter: string; header: string };
  /** Column read as the unit of each partida. */
  unitColumn: { letter: string; header: string };
  headerRow: number | null;
  totals: { phases: number; services: number; missingPrices: number; suspiciousPrices: number };
  warnings: string[];
}
