export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'expired';
export type RowType = 'phase' | 'item' | 'note';

export interface Estimate {
  id: string;
  client_name: string;
  property_address: string;
  status: EstimateStatus;
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
