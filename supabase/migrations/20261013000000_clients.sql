-- Clients: a client owns one or more obras (budgets).
--
-- Until now the client was a `client_name` text on every estimate, so the same
-- client with two obras existed twice with nothing tying them together. This
-- migration gives the client its own table and hangs the budgets from it:
--
--   companies → clients → estimates → estimate_rows
--
-- `estimates.client_name` is deliberately kept: it is the snapshot the PDF and
-- the email print, so they need no join, and every budget written before this
-- migration keeps working untouched. `updateClient()` in src/app/actions.ts
-- refreshes that snapshot whenever the client is renamed, so the two can never
-- drift. `property_address` stays as the obra's address.
--
-- ON DELETE SET NULL (not CASCADE): deleting a client must never delete real
-- documents. `deleteClient()` refuses to delete a client that still owns obras.
--
-- Idempotent: safe to run twice, and the backfill only touches rows that still
-- have no client (so re-running after the app has been used changes nothing).

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company access clients" ON public.clients;
CREATE POLICY "Company access clients" ON public.clients
  FOR ALL USING (company_id = get_user_company_id());

CREATE INDEX IF NOT EXISTS idx_clients_company
  ON public.clients (company_id, name);

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_client
  ON public.estimates (client_id);

-- Backfill: one client per (company, client_name) already in use, then link the
-- budgets to it. Two budgets of the same client keep hanging from that one ficha;
-- the user splits them afterwards if they were really two people.
INSERT INTO public.clients (company_id, name)
SELECT DISTINCT e.company_id, e.client_name
FROM public.estimates e
WHERE e.client_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.company_id = e.company_id AND c.name = e.client_name
  );

UPDATE public.estimates e
SET client_id = c.id
FROM public.clients c
WHERE e.client_id IS NULL
  AND c.company_id = e.company_id
  AND c.name = e.client_name;
