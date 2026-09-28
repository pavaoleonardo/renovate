-- Migration: price provenance and cost recipe for catalog services
--
-- Every partida of the default catalog says where its price comes from and how it is
-- built, so the app can show that honestly (our own draft, NOT a licensed base such
-- as BEDEC / IVE / CYPE — see SPEC.md §5) and so a future job can recompute the
-- price from the recipe instead of from a literal.
--
-- Run this in the Supabase SQL Editor (or with psql against the Session pooler).
-- Idempotent: ADD COLUMN IF NOT EXISTS, safe to run twice.
-- Until it is applied the app keeps working (searchCatalog uses SELECT *); only the
-- default-catalog seeding and the price-basis hint need these columns.

ALTER TABLE public.catalog_services
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS price_source_url text,
  ADD COLUMN IF NOT EXISTS price_reviewed_at date,
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS labour_hours numeric(8,3),
  ADD COLUMN IF NOT EXISTS labour_category text,
  ADD COLUMN IF NOT EXISTS material_anchor text;

-- Human-readable label shown under the price, e.g.
-- 'Borrador propio · contraste de bandas de mercado · 2026-09'.
COMMENT ON COLUMN public.catalog_services.price_source IS
  'Human-readable basis of the price, shown in the catalogue. Never a licensed base name unless actually licensed.';
COMMENT ON COLUMN public.catalog_services.price_source_url IS
  'Optional public reference for this specific price. NULL when there is none.';
COMMENT ON COLUMN public.catalog_services.price_reviewed_at IS
  'Date a human last reviewed this price. The UI flags anything older than 12 months.';
COMMENT ON COLUMN public.catalog_services.source_kind IS
  'Cost driver, not provenance: labour | material | mixed | admin-fee';
COMMENT ON COLUMN public.catalog_services.labour_hours IS
  'Labour content per unit, our own productivity assumption. Used only when prices start being recomputed.';
COMMENT ON COLUMN public.catalog_services.labour_category IS
  'Trade category the hours are priced at: peón | of.1 | of.2 | espec. | téc.';
COMMENT ON COLUMN public.catalog_services.material_anchor IS
  'Commodity family the material cost is anchored to (candidate INE IPRI series, ids not pinned yet).';

-- Verification: expected output is 7 rows, one per new column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'catalog_services'
  AND column_name IN (
    'price_source', 'price_source_url', 'price_reviewed_at', 'source_kind',
    'labour_hours', 'labour_category', 'material_anchor'
  )
ORDER BY column_name;
