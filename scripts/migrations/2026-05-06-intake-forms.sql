-- Intake forms: native EXPO replacements for the three Google Forms Ohad
-- has been sending clients (HE initial, EN initial, HE progress check-in).
--
-- Why: lands submissions inside the product (coach inbox, trainee detail
-- timeline) instead of separate Google Drive sheets, and lets us tie a
-- progress submission to a specific trainee.
--
-- Design:
--   intake_tokens — one-shot or per-trainee URLs Ohad generates from the
--   coach UI. Public form reads metadata via verify_intake_token() RPC,
--   then submits with the token attached.
--
--   intake_submissions — payload JSONB keyed by question id. trainee_id
--   set when the token was issued for an existing trainee (progress
--   check-ins) and null for prospects (initial intake).
--
-- Run via the Supabase dashboard SQL editor.
-- Safe to re-run: every step uses IF NOT EXISTS / IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intake_tokens (
  token         text         PRIMARY KEY,
  form_type     text         NOT NULL CHECK (form_type IN ('initial', 'progress')),
  locale        text         NOT NULL CHECK (locale IN ('he', 'en')),
  trainee_id    text,
  label         text,
  used_at       timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intake_tokens_created_at_idx ON intake_tokens (created_at DESC);

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intake_submissions (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type     text          NOT NULL CHECK (form_type IN ('initial', 'progress')),
  locale        text          NOT NULL CHECK (locale IN ('he', 'en')),
  trainee_id    text,
  token         text,
  email         text,
  name          text,
  payload       jsonb         NOT NULL,
  created_at    timestamptz   NOT NULL DEFAULT NOW(),
  reviewed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS intake_submissions_created_at_idx ON intake_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS intake_submissions_trainee_id_idx ON intake_submissions (trainee_id);
CREATE INDEX IF NOT EXISTS intake_submissions_token_idx ON intake_submissions (token);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE intake_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;

-- Tokens: trainer-only. Public verifies via verify_intake_token() RPC below
-- which runs SECURITY DEFINER and only returns the metadata for the exact
-- token supplied — anon never gets to enumerate the table.
DROP POLICY IF EXISTS "intake_tokens_trainer_all" ON intake_tokens;
CREATE POLICY "intake_tokens_trainer_all" ON intake_tokens
  FOR ALL TO authenticated
  USING (is_trainer())
  WITH CHECK (is_trainer());

-- Submissions: anon can INSERT (the public form path). Validation in the
-- WITH CHECK keeps it from being a wide-open dump endpoint.
DROP POLICY IF EXISTS "intake_submissions_anon_insert" ON intake_submissions;
CREATE POLICY "intake_submissions_anon_insert" ON intake_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    payload IS NOT NULL
    AND jsonb_typeof(payload) = 'object'
    AND length(payload::text) <= 50000
    AND form_type IN ('initial', 'progress')
    AND locale IN ('he', 'en')
  );

DROP POLICY IF EXISTS "intake_submissions_trainer_select" ON intake_submissions;
CREATE POLICY "intake_submissions_trainer_select" ON intake_submissions
  FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS "intake_submissions_trainer_update" ON intake_submissions;
CREATE POLICY "intake_submissions_trainer_update" ON intake_submissions
  FOR UPDATE TO authenticated
  USING (is_trainer())
  WITH CHECK (is_trainer());

DROP POLICY IF EXISTS "intake_submissions_trainer_delete" ON intake_submissions;
CREATE POLICY "intake_submissions_trainer_delete" ON intake_submissions
  FOR DELETE TO authenticated
  USING (is_trainer());

-- ---------------------------------------------------------------------------
-- verify_intake_token RPC — public read for "is this token good?" check.
-- SECURITY DEFINER so anon can call it without needing read access on
-- intake_tokens. Returns nothing (zero rows) if the token doesn't exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_intake_token(p_token text)
RETURNS TABLE (form_type text, locale text, label text, trainee_id text, used boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT t.form_type, t.locale, t.label, t.trainee_id, (t.used_at IS NOT NULL) AS used
  FROM intake_tokens t
  WHERE t.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.verify_intake_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_intake_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- mark_intake_token_used RPC — public callable, sets used_at on a single
-- token. SECURITY DEFINER again so anon doesn't need write access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_intake_token_used(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE intake_tokens SET used_at = NOW() WHERE token = p_token AND used_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_intake_token_used(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_intake_token_used(text) TO anon, authenticated;

COMMIT;
