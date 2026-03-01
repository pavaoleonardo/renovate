-- Migration: Allow company owners to update their company profile
CREATE POLICY "Users can update their own company" ON public.companies
  FOR UPDATE USING (id = get_user_company_id())
  WITH CHECK (id = get_user_company_id());
