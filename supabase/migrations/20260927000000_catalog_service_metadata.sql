-- Migration: extra metadata for catalog services
--
-- Adds the fields that let the app show a market price band next to the price,
-- keep the technical description (also a starting point for the client note)
-- and store a service code for future Excel / BC3 round-trips.
--
-- Run this in the Supabase SQL Editor. Idempotent: ADD COLUMN IF NOT EXISTS.
-- Until it is applied, the app keeps working (searchCatalog uses SELECT *), only
-- the default-catalog seeding needs these columns.

ALTER TABLE public.catalog_services
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price_min numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'manual';

-- origin: 'catalogo_base' (seeded default catalog) | 'excel' (imported) | 'manual'
COMMENT ON COLUMN public.catalog_services.origin IS 'catalogo_base | excel | manual';

CREATE INDEX IF NOT EXISTS idx_catalog_services_code ON public.catalog_services(code);

-- Verification: expected output is the 5 new columns at the end of the list
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'catalog_services'
ORDER BY ordinal_position;
