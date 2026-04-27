-- Leads: capture email-only signups from the EXPO landing site.
--
-- Why: hero + footer carry a "drop your email" form so visitors who aren't
-- ready to buy today still leave a way to be reached. Posts directly from
-- the landing-site frontend via the Supabase REST API; no backend.
--
-- Run via the Supabase dashboard SQL editor.
-- Safe to re-run: every step uses IF NOT EXISTS / IF EXISTS.

CREATE TABLE IF NOT EXISTS leads (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text          NOT NULL,
  source       text          NOT NULL DEFAULT 'expo-il',
  context      text          NOT NULL DEFAULT 'unknown',  -- 'hero' | 'footer' | other
  user_agent   text,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  consumed_at  timestamptz                                -- set once Ohad replies / converts
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_source_uniq ON leads (lower(email), source);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Anonymous insert: anyone can drop their email. The publishable key is
-- exposed in the landing-site bundle, so we explicitly let the `anon`
-- role insert. Read/update is locked down to the trainer only.
DROP POLICY IF EXISTS "leads_anon_insert" ON leads;
CREATE POLICY "leads_anon_insert" ON leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) BETWEEN 5 AND 200
    AND email LIKE '%@%.%'
  );

-- Trainer read: same is_trainer() helper used by the rest of the schema.
-- If is_trainer() doesn't exist in your project yet, drop this policy and
-- rely on the service-role key for reads from scripts.
DROP POLICY IF EXISTS "leads_trainer_select" ON leads;
CREATE POLICY "leads_trainer_select" ON leads
  FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS "leads_trainer_update" ON leads;
CREATE POLICY "leads_trainer_update" ON leads
  FOR UPDATE TO authenticated
  USING (is_trainer())
  WITH CHECK (is_trainer());
