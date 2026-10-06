-- Missing column: `estimate_rows.client_note`.
--
-- The editor (and the future AI/voice note filler) already wrote the client-facing
-- note on every line, but the column never existed. Because the save used to spread
-- the whole row object into the upsert, Postgres rejected the ENTIRE statement with
-- "column client_note does not exist" and the budget was lost without a word.
--
-- Additive and idempotent: safe to run twice and on data already stored.
-- Applied by hand (Supabase SQL Editor) — see SPEC.md §7.

ALTER TABLE public.estimate_rows
  ADD COLUMN IF NOT EXISTS client_note text;

COMMENT ON COLUMN public.estimate_rows.client_note IS
  'Plain-language description printed under the partida in the client PDF.';
