-- Migration: name the new company from the signup form
--
-- The /login/signup page sends `company_name` inside raw_user_meta_data
-- (supabase.auth.signUp({ options: { data: { company_name } } })).
-- Use it when present; otherwise keep the previous default ("Company of <email>").
--
-- Run this in the Supabase SQL Editor. It is idempotent and safe to re-run.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_company_id uuid;
  new_company_name text;
BEGIN
  new_company_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), '');

  -- 1. Create the company for the new user
  INSERT INTO public.companies (name)
  VALUES (COALESCE(new_company_name, 'Company of ' || NEW.email))
  RETURNING id INTO new_company_id;

  -- 2. Link the auth user to the public.users row (required by the RLS helper
  --    get_user_company_id())
  INSERT INTO public.users (id, company_id, email)
  VALUES (NEW.id, new_company_id, NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (Re)install the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
