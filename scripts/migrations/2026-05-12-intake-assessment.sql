-- 2026-05-12 — Physical assessment as a third intake form_type.
--
-- WHY: Initial intake captures lifestyle / pain context but isn't measurable
-- enough to program block #1 from. The assessment form adds structured
-- self-administered tests (sit-rise, single-leg balance, push-up max,
-- plank hold) + pain-region multi-select + injury history so block #1 is
-- programmed from data, not chat snippets.
--
-- This is a CHECK-constraint extension only — no new tables. Tokens and
-- submissions already store `form_type`, just need to allow 'assessment'.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK (only if no 'assessment' rows have been inserted yet):
--   ALTER TABLE intake_tokens DROP CONSTRAINT intake_tokens_form_type_check;
--   ALTER TABLE intake_tokens ADD CONSTRAINT intake_tokens_form_type_check
--     CHECK (form_type IN ('initial', 'progress'));
--   -- same for intake_submissions

BEGIN;

ALTER TABLE intake_tokens
  DROP CONSTRAINT IF EXISTS intake_tokens_form_type_check;
ALTER TABLE intake_tokens
  ADD CONSTRAINT intake_tokens_form_type_check
  CHECK (form_type IN ('initial', 'progress', 'assessment'));

ALTER TABLE intake_submissions
  DROP CONSTRAINT IF EXISTS intake_submissions_form_type_check;
ALTER TABLE intake_submissions
  ADD CONSTRAINT intake_submissions_form_type_check
  CHECK (form_type IN ('initial', 'progress', 'assessment'));

-- Tighten the anon-insert policy to match the new form_type set.
DROP POLICY IF EXISTS "intake_submissions_anon_insert" ON intake_submissions;
CREATE POLICY "intake_submissions_anon_insert" ON intake_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    payload IS NOT NULL
    AND jsonb_typeof(payload) = 'object'
    AND length(payload::text) <= 50000
    AND form_type IN ('initial', 'progress', 'assessment')
    AND locale IN ('he', 'en')
  );

COMMIT;
