-- Migration: Initial Schema for Renovation Estimates SaaS MVP

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COMPANIES
CREATE TABLE public.companies (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. USERS
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. CATALOG PHASES
CREATE TABLE public.catalog_phases (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.catalog_phases ENABLE ROW LEVEL SECURITY;

-- 4. CATALOG SERVICES
CREATE TABLE public.catalog_services (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  phase_id uuid NOT NULL REFERENCES public.catalog_phases(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text DEFAULT 'un' NOT NULL,
  base_price numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.catalog_services ENABLE ROW LEVEL SECURITY;

-- 5. ESTIMATES
CREATE TYPE public.estimate_status AS ENUM (
  'draft', 'sent', 'approved', 'rejected', 'in_progress', 'completed'
);

CREATE TABLE public.estimates (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  property_address text NOT NULL,
  status public.estimate_status DEFAULT 'draft' NOT NULL,
  total_amount numeric(12,2) DEFAULT 0 NOT NULL,
  warranty_months integer DEFAULT 0 NOT NULL,
  warranty_end_date date,
  created_at timestamptz DEFAULT now() NOT NULL,
  approved_at timestamptz
);
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

-- 6. ESTIMATE ROWS (Core Document Model)
CREATE TYPE public.estimate_row_type AS ENUM ('phase', 'item', 'note');

CREATE TABLE public.estimate_rows (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  type public.estimate_row_type DEFAULT 'item' NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  
  -- Snapshots
  phase_name_snapshot text,
  service_name_snapshot text,
  unit_snapshot text,
  price_snapshot numeric(12,2),
  
  quantity numeric(10,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  
  parent_phase_id uuid REFERENCES public.estimate_rows(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.estimate_rows ENABLE ROW LEVEL SECURITY;

-- Function: Auto calculate warranty end date on status change
CREATE OR REPLACE FUNCTION set_warranty_dates()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.approved_at = now();
    IF NEW.warranty_months > 0 THEN
      NEW.warranty_end_date = CURRENT_DATE + (NEW.warranty_months || ' months')::interval;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_estimate_approved
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION set_warranty_dates();

-- POLICIES (Simplified for MVP: Check if company_id matches current user's company_id)

CREATE OR REPLACE FUNCTION get_user_company_id() RETURNS uuid AS $$
  SELECT company_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Companies
CREATE POLICY "Users can view their own company" ON public.companies 
  FOR SELECT USING (id = get_user_company_id());

-- Users
CREATE POLICY "Users view users in same company" ON public.users 
  FOR SELECT USING (company_id = get_user_company_id());

-- Catalog Phases
CREATE POLICY "Company access catalog phases" ON public.catalog_phases 
  FOR ALL USING (company_id = get_user_company_id());

-- Catalog Services
CREATE POLICY "Company access catalog services" ON public.catalog_services 
  FOR ALL USING (
    phase_id IN (SELECT id FROM public.catalog_phases WHERE company_id = get_user_company_id())
  );

-- Estimates
CREATE POLICY "Company access estimates" ON public.estimates 
  FOR ALL USING (company_id = get_user_company_id());

-- Estimate Rows
CREATE POLICY "Company access estimate rows" ON public.estimate_rows 
  FOR ALL USING (
    estimate_id IN (SELECT id FROM public.estimates WHERE company_id = get_user_company_id())
  );
