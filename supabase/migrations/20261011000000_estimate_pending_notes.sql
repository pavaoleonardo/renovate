-- Pending notes on a job ("Cambios de esta obra").
--
-- The changes the user jots down while the work is going on — something the
-- client asked for, something that turned up — captured on the spot and turned
-- into budget lines later. They are INTERNAL ONLY: nothing here reaches the
-- client PDF until it is converted into a line of the budget.
--
-- Tenant-scoped exactly like estimate_rows: through the estimate that owns them,
-- with no company_id of its own. Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.estimate_pending_notes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  text text NOT NULL,
  -- Section the note belongs to, when it is known (the section the user was in).
  section text,
  -- Optional hints captured with the note; the price is confirmed in the editor.
  quantity numeric(10,2),
  price numeric(12,2),
  -- 'open' while it waits, then 'converted' (turned into a line) or 'dismissed'.
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz
);

-- The badge on /estimates and the panel both ask "how many are open here".
CREATE INDEX IF NOT EXISTS idx_pending_notes_estimate
  ON public.estimate_pending_notes (estimate_id, status);

ALTER TABLE public.estimate_pending_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company access pending notes" ON public.estimate_pending_notes;
CREATE POLICY "Company access pending notes" ON public.estimate_pending_notes
  FOR ALL USING (
    estimate_id IN (SELECT id FROM public.estimates WHERE company_id = get_user_company_id())
  );
