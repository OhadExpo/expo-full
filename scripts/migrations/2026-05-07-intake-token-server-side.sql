-- Strengthen the intake-form token model so trainee_id never round-trips
-- through anon. Audit Item #10 (2026-05-07).
--
-- Before: verify_intake_token() returned trainee_id; anon trusted it,
-- echoed it back on insert, RLS only validated payload shape.
-- Risk: a token shared on a public channel (group chat, social) lets
-- anyone with the link submit AS that trainee.
--
-- After: verify_intake_token() drops trainee_id from its return type.
-- A new submit_intake_form() RPC runs SECURITY DEFINER and atomically
-- (a) resolves the trainee_id server-side from the token, (b) inserts
-- the submission with that trainee_id, (c) marks the token used.
-- Anon never learns or controls trainee_id.
--
-- The anon INSERT policy on intake_submissions is replaced with a
-- trainer-only WITH CHECK so direct PostgREST inserts are no longer
-- accepted — submissions must go through the RPC.
--
-- Run via the Supabase dashboard SQL editor.
-- Safe to re-run: every step uses CREATE OR REPLACE / DROP IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. verify_intake_token — drop trainee_id from the return type
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_intake_token(text);

CREATE OR REPLACE FUNCTION public.verify_intake_token(p_token text)
RETURNS TABLE (form_type text, locale text, label text, used boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT t.form_type, t.locale, t.label, (t.used_at IS NOT NULL) AS used
  FROM intake_tokens t
  WHERE t.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.verify_intake_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_intake_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. submit_intake_form — server-side trainee_id resolve + atomic mark-used
-- ---------------------------------------------------------------------------
-- Returns the new submission's UUID on success, NULL on token problems
-- (already-used, missing, malformed). Frontend treats NULL as "try again".
CREATE OR REPLACE FUNCTION public.submit_intake_form(
  p_token   text,
  p_payload jsonb,
  p_email   text DEFAULT NULL,
  p_name    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_row intake_tokens%ROWTYPE;
  v_id        uuid;
BEGIN
  -- Payload sanity (mirrors the old anon-insert WITH CHECK).
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  IF length(p_payload::text) > 50000 THEN
    RAISE EXCEPTION 'payload too large';
  END IF;

  -- Lock + atomic mark-used. If the token doesn't exist or is already
  -- used, return NULL so the frontend can show 'invalid'/'used' state.
  SELECT * INTO v_token_row FROM intake_tokens
  WHERE token = p_token AND used_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Server-resolved trainee_id — anon never supplies or sees this value.
  INSERT INTO intake_submissions (form_type, locale, trainee_id, token, email, name, payload)
  VALUES (v_token_row.form_type, v_token_row.locale, v_token_row.trainee_id,
          p_token, p_email, p_name, p_payload)
  RETURNING id INTO v_id;

  UPDATE intake_tokens SET used_at = NOW() WHERE token = p_token;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_intake_form(text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_intake_form(text, jsonb, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lock down the anon INSERT policy on intake_submissions.
-- Submissions must now go through submit_intake_form(); direct PostgREST
-- inserts from anon are refused. Trainer can still insert manually if ever
-- needed (the trainer policies from 2026-05-06-intake-forms.sql cover that).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "intake_submissions_anon_insert" ON intake_submissions;

-- (Trainer SELECT/UPDATE/DELETE policies from the prior migration are kept.)

COMMIT;

-- ---------------------------------------------------------------------------
-- Verify after applying:
--   SELECT proname FROM pg_proc WHERE proname IN ('verify_intake_token','submit_intake_form');
--   SELECT polname FROM pg_policies WHERE tablename='intake_submissions';
-- The anon_insert policy should be gone; submit_intake_form should appear.
-- ---------------------------------------------------------------------------
