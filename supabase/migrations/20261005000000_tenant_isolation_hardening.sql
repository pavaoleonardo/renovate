-- Tenant isolation hardening.
--
-- Source of truth: a READ-ONLY audit of the live project (pg_class, pg_policies,
-- storage.objects), not of the other migration files — those only tell part of the story.
-- Three findings, worst first:
--
-- 1. storage.objects, "logos" bucket: the write policies only checked bucket_id, with no
--    ownership test whatsoever. Any signed-in user of ANY company could overwrite or delete
--    another company's logo — the logo printed on that other company's estimates — just by
--    naming the object. From now on the object has to live under <company_id>/... and
--    src/app/settings/page.tsx uploads there. The two objects already stored at the root of
--    the bucket stay reachable by whoever uploaded them (storage.objects.owner).
--    The public SELECT policy is deliberately left alone: the bucket is public by design
--    (the homeowner opens the estimate without signing in), so tightening reads would break
--    the product without protecting anything that is not already public.
--
-- 2. ai_rate_limits had RLS ENABLED with ZERO policies, so every read and write from the app
--    was denied — silently, because the app does not check those errors. The "10 paid AI
--    calls per hour per company" cap therefore never existed. These policies restore it,
--    scoped to the calling company like every other table.
--
-- 3. get_user_company_id() — the primitive all the policies are built on — is SECURITY
--    DEFINER with an unset search_path, a known privilege-escalation pattern. Signature and
--    body are identical; only the search_path is pinned.
--
-- Idempotent: safe to run twice, and safe to re-run after a partial failure.

-- ── 1. logos: every write must be inside the calling company's own folder ──────────
DROP POLICY IF EXISTS "Auth Users Upload" ON storage.objects;
DROP POLICY IF EXISTS "Auth Users Update" ON storage.objects;
DROP POLICY IF EXISTS "Auth Users Delete" ON storage.objects;

CREATE POLICY "logos_insert_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = get_user_company_id()::text
  );

-- `owner = auth.uid()` keeps the objects uploaded before this change replaceable by the
-- person who uploaded them; anything under the company folder is fair game for the company.
CREATE POLICY "logos_update_own_folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND ((storage.foldername(name))[1] = get_user_company_id()::text OR owner = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND ((storage.foldername(name))[1] = get_user_company_id()::text OR owner = auth.uid())
  );

CREATE POLICY "logos_delete_own_folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND ((storage.foldername(name))[1] = get_user_company_id()::text OR owner = auth.uid())
  );

-- ── 2. ai_rate_limits: a rate limit nobody can read is not a rate limit ───────────
DROP POLICY IF EXISTS "ai_rate_limits_select_own" ON ai_rate_limits;
CREATE POLICY "ai_rate_limits_select_own" ON ai_rate_limits
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "ai_rate_limits_insert_own" ON ai_rate_limits;
CREATE POLICY "ai_rate_limits_insert_own" ON ai_rate_limits
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

-- ── 3. pin the search_path of the isolation primitive ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_company_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT company_id FROM public.users WHERE id = auth.uid();
$function$;
