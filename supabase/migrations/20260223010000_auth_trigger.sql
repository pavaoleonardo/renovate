-- Function to handle new user signup and automatically link a company
-- Run this in your Supabase SQL Editor to make auth work cleanly.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- 1. Create a default company for the new user automatically
  INSERT INTO public.companies (name)
  VALUES ('Company of ' || NEW.email)
  RETURNING id INTO new_company_id;

  -- 2. Link the new user auth ID to the Postgres public.users table (Needed for RLS overrides)
  INSERT INTO public.users (id, company_id, email)
  VALUES (NEW.id, new_company_id, NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to watch auth.users inserts
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
