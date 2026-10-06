export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'expired';
export type RowType = 'phase' | 'item' | 'note';
/** 'principal' is a normal budget; 'modificacion' is an addendum that hangs from one. */
export type EstimateKind = 'principal' | 'modificacion';
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
  /** 'principal' for a normal budget; 'modificacion' for an addendum. Absent = principal. */
  kind?: EstimateKind;
  /** The budget this addendum hangs from; null/absent for a principal. */
  parent_estimate_id?: string | null;
  /** Base (VAT excluded) frozen when the budget was approved; never rewritten later. */
  approved_subtotal?: number | null;
  /** Total (VAT included) frozen when the budget was approved. */
  approved_total?: number | null;
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

export type PendingNoteStatus = 'open' | 'converted' | 'dismissed';

/**
 * A change captured on the job ("Cambios de esta obra") that has not yet become a
 * line of the budget. Internal only — it never reaches the client PDF.
 */
export interface PendingNote {
  id: string;
  estimate_id: string;
  /** Free text as the user jotted it down, e.g. "Añadir 3 enchufes en el salón". */
  text: string;
  /** Section it belongs to, when known. */
  section: string | null;
  /** Suggested quantity / price; the price is confirmed in the editor. */
  quantity: number | null;
  price: number | null;
  status: PendingNoteStatus;
  created_at?: string;
}

/**
 * What a dictated change does to the budget: `add` creates a new line, `update` sets the
 * final quantity of a line that already exists, `remove` takes an existing line out.
 */
export type VoiceLineOp = 'add' | 'update' | 'remove';

/** A budget line the AI proposes from a dictated change. Never has a price of its own. */
export interface VoiceProposalLine {
  /** What the change does to the budget. Unknown values fall back to `add`. */
  op: VoiceLineOp;
  /** Plain-language description, e.g. "Instalar 3 enchufes en el salón". */
  description: string;
  /**
   * For `add`: how many units to add. For `update`: the FINAL quantity the line should
   * end up with (not the difference). Ignored by `remove`.
   */
  quantity: number;
  unit: string;
  /**
   * Existing budget line this change refers to, copied verbatim (e.g. "Bañera blanca
   * 170 cm"): the line an `update`/`remove` acts on, and where an `add` is placed (just
   * below it). `null` when it relates to none — the line then lands in its section or, with
   * no hint at all, at the end of the budget.
   */
  anchor?: string | null;
  /**
   * Only meaningful for `add`: whether the AI thinks the work matches a catalog entry
   * (`'catalog'`) or is brand new (`'new'`). It is only a hint — the editor re-checks the
   * catalog itself before deciding the price, so a wrong hint never invents a price.
   */
  source?: 'catalog' | 'new' | null;
}

/**
 * What OpenAI returns for a dictated change: a short summary, the section it
 * seems to belong to, and the lines to add or adjust. The user reviews and edits all of
 * it before anything reaches the budget.
 */
export interface VoiceProposal {
  summary: string;
  section: string | null;
  lines: VoiceProposalLine[];
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
  /** Stable key of the line (`importLineKey`), the same one the match plan uses. */
  key: string;
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
/**
 * Status of an imported line against what the company already has: `exact` and
 * `auto` merge on their own, `similar` is asked to the user (or to the AI), `new`
 * is created.
 */
export type ImportMatchStatus = 'exact' | 'auto' | 'similar' | 'new';

/**
 * What the AI proposed for one doubtful line: the partida of the company's own
 * catalog it should merge into. It is only a proposal — the review panel shows it
 * marked and the user can change it before confirming.
 */
export interface ImportMatchSuggestion {
  /** Stable key of the line (`importLineKey`). */
  key: string;
  targetId: string;
  targetName: string;
}

/**
 * What the importer proposes for one line of the document, so the review panel on
 * /catalog can show it and the user can change it before anything is saved.
 */
export interface ExcelPreviewMatch {
  /** Stable key of the line: section + partida, accents and case ignored. */
  key: string;
  name: string;
  unit: string;
  status: ImportMatchStatus;
  /** 1 on an exact match; the similarity score on `auto` / `similar`; 0 on `new`. */
  score: number;
  /** Partida of the company's own catalog this line merges into. */
  target: { id: string; name: string; unit: string; base_price: number; phase_name: string | null } | null;
  /**
   * Market band of the matching default-catalogue partida, with the price proposed
   * for a line the document leaves without one. `null` when nothing credible
   * matched — a made-up band is worse than none.
   */
  band: { min: number; max: number; suggested: number; matchedName: string } | null;
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
  /** What the importer proposes for each line (merge / ask / create). */
  matches: ExcelPreviewMatch[];
  /**
   * Qué se hace con cada sección del documento: la que se fusiona con una que ya
   * existe (con qué nombre) y la que se creará nueva. `mergesInto: null` significa que
   * el emparejado determinista no encontró nada y que decidirá la IA al confirmar.
   */
  sections: { name: string; mergesInto: string | null }[];
  /**
   * Propuesta de la IA para las líneas dudosas, pedida en el mismo análisis (una sola
   * llamada, automática). `null` cuando no había nada dudoso o cuando el documento se
   * volvió a analizar con otros ajustes.
   */
  ai: { suggestions: ImportMatchSuggestion[]; note: string } | null;
  /** Partidas the company already has in this catalog, the pool the lines match against. */
  existingServices: number;
  totals: {
    phases: number;
    services: number;
    missingPrices: number;
    suspiciousPrices: number;
    /** Lines that already exist (exact or auto) and will be merged. */
    existingMatches: number;
    /** Lines that look like something already there: the user decides. */
    similarMatches: number;
    /** Lines that look like nothing and will be created. */
    newServices: number;
    /** Lines without a price the default catalogue can fill in with an estimate. */
    estimatedPrices: number;
  };
  warnings: string[];
}
