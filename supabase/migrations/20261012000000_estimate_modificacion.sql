-- Modificación: an addendum that hangs from a principal budget.
--
-- A reforma rarely ends where it was budgeted. Instead of editing the budget the
-- client already accepted, the user adds a "Modificación" — its own document with
-- its own Nº and its own lines — linked back here with parent_estimate_id. The
-- list shows the two together (principal + modifications) and the addendum's PDF
-- is headed "Modificación del presupuesto del <fecha>".
--
-- approved_subtotal / approved_total freeze the figures the client accepted, so a
-- later edit to the lines can never rewrite what was approved.
--
-- RLS needs nothing new: a Modificación is inserted with the same company_id as
-- its parent, so the existing estimates policies already cover it.
--
-- Idempotent: safe to run twice.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'principal',
  ADD COLUMN IF NOT EXISTS parent_estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS approved_subtotal numeric(12,2),
  ADD COLUMN IF NOT EXISTS approved_total numeric(12,2);

CREATE INDEX IF NOT EXISTS idx_estimates_parent
  ON public.estimates (parent_estimate_id);
