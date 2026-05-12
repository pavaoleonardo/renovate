-- Run this in Supabase SQL Editor
-- Creates a lightweight table to track AI API usage per company

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  endpoint text NOT NULL,
  called_at timestamptz DEFAULT now() NOT NULL
);

-- Index for fast lookups (company + endpoint + time window)
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_lookup 
  ON ai_rate_limits(company_id, endpoint, called_at);

-- Auto-delete records older than 24 hours to keep table small
-- (Run this periodically or set up a pg_cron job)
-- DELETE FROM ai_rate_limits WHERE called_at < now() - interval '24 hours';
