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
  
  quantity: number;
  total: number;
}

export interface CatalogService {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  phase_id: string;
  phase_name?: string;
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
}
