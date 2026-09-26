-- Migration: optional VAT per budget + unambiguous stored totals
--
-- Before this migration the editor and the PDF always applied a hardcoded 21 %
-- VAT, but saveEstimateRows() stored the base amount in estimates.total_amount,
-- so /estimates showed a lower, unlabelled figure than the document the client
-- had already received. This migration makes the stored numbers self-describing
-- and lets a budget be issued with 21 % (general), 10 % (renovation of a
-- dwelling older than 2 years) or 0 % (no VAT) VAT.
--
--   subtotal_amount = sum of estimate_rows, tax excluded (base imponible)
--   tax_rate        = 0 | 10 | 21
--   total_amount    = subtotal_amount + VAT  -> what /estimates and the PDF show
--
-- Backfill: existing rows could only ever mean "base at 21 %", because that is
-- exactly what the PDF printed as TOTAL. So the stored total is raised by 21 %
-- once, which brings the dashboard in line with the documents already sent to
-- clients (and can be undone with total_amount = subtotal_amount, tax_rate = 0).
-- The guard is subtotal_amount IS NULL, only true before this migration runs, so
-- re-running it changes nothing.
--
-- Run in the Supabase SQL Editor or with psql. Idempotent.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 21 NOT NULL,
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2);

UPDATE public.estimates
SET subtotal_amount = total_amount,
    total_amount = round(total_amount * 1.21, 2)
WHERE subtotal_amount IS NULL;

ALTER TABLE public.estimates
  ALTER COLUMN subtotal_amount SET DEFAULT 0,
  ALTER COLUMN subtotal_amount SET NOT NULL;

COMMENT ON COLUMN public.estimates.tax_rate IS 'VAT percentage applied to the budget: 0 (sin IVA), 10 (vivienda > 2 años) or 21 (general).';
COMMENT ON COLUMN public.estimates.subtotal_amount IS 'Sum of estimate_rows, tax excluded (base imponible).';
COMMENT ON COLUMN public.estimates.total_amount IS 'subtotal_amount + VAT. The figure shown on /estimates and as TOTAL in the PDF.';

-- Verification: expected "estimates" = "consistent", every row at 21 % after the backfill
SELECT count(*) AS estimates,
       count(*) FILTER (WHERE total_amount = round(subtotal_amount * (1 + tax_rate / 100), 2)) AS consistent,
       count(*) FILTER (WHERE tax_rate = 21) AS at_21_percent,
       coalesce(sum(total_amount - subtotal_amount), 0) AS total_vat_stored
FROM public.estimates;
