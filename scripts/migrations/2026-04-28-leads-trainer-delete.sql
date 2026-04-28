-- Allow the trainer to DELETE leads.
--
-- Why: the leads admin section in the coach app needs delete (clear test
-- rows, drop spam). The 2026-04-27 leads table migration only granted
-- anon INSERT, trainer SELECT, and trainer UPDATE — so previous DELETE
-- attempts via the REST API were silently filtered by RLS.
--
-- Run via the Supabase dashboard SQL editor.
-- Safe to re-run.

DROP POLICY IF EXISTS "leads_trainer_delete" ON leads;
CREATE POLICY "leads_trainer_delete" ON leads
  FOR DELETE TO authenticated
  USING (is_trainer());
