-- 2026-05-07 — form-videos bucket SELECT: path-scoped per trainee.
-- Audit Item #3.
--
-- WHY: The current `auth_read_form_videos` policy in supabase-rls-auth.sql
--   USING (bucket_id = 'form-videos' AND (is_trainer() OR auth.uid() IS NOT NULL))
-- lets ANY signed-in trainee enumerate AND download every other client's
-- form videos. The bucket has no per-folder RLS today.
--
-- WHAT THIS DOES:
--   1. Adds a SECURITY DEFINER helper public.current_trainee_id() that
--      resolves the calling user's trainee row from the email→trainees
--      mapping kept in store(key='expo-trainees'). Returns the trainee_id
--      string (e.g. 'tr_diego' or 'tr_moshe_dana__0') or NULL if the
--      caller has no trainee row.
--   2. Replaces auth_read_form_videos with a path-scoped policy: trainer
--      reads everything; a trainee reads only objects whose first folder
--      segment matches current_trainee_id().
--
-- The existing trainer_delete_form_videos and auth_upload_form_videos
-- policies stay unchanged. Upload still requires only "authenticated";
-- a trainee can technically upload into someone else's folder if they
-- forge the path, but that's a write-to-someone-else's-folder threat,
-- not a read-someone-else's-data threat. Tightening upload likewise is
-- a follow-up; the audit's blocker was the read leak.
--
-- HOW TO APPLY: paste in Supabase Studio → SQL Editor → Run. Re-runs safe.
-- HOW TO ROLLBACK: re-apply supabase-rls-auth.sql lines 112-117 to
-- restore the open SELECT. Keep current_trainee_id() — the multi-tenant
-- DRAFT migration is going to want it (it currently references an
-- undefined current_client_id() — same shape, different name).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Helper: current_trainee_id()
-- ---------------------------------------------------------------------------
-- Reads store('expo-trainees'), iterates each trainee row, returns the row
-- whose `email` field (string OR array of strings) contains the caller's
-- JWT email (case-insensitive). SECURITY DEFINER so anon/authenticated can
-- call it without store-row RLS in their way; STABLE so Postgres can cache
-- the result within a single statement.
CREATE OR REPLACE FUNCTION public.current_trainee_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tr AS (
    SELECT v->>'id' AS id, v->'email' AS email_field
    FROM store, jsonb_array_elements(value::jsonb) AS v
    WHERE key = 'expo-trainees'
  )
  SELECT tr.id FROM tr
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(tr.email_field) = 'array' THEN tr.email_field
        WHEN tr.email_field IS NULL THEN '[]'::jsonb
        ELSE jsonb_build_array(tr.email_field#>>'{}')
      END
    ) AS e
    WHERE lower(e) = lower(auth.jwt()->>'email')
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_trainee_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_trainee_id() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Replace the SELECT policy with a path-scoped version
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "auth_read_form_videos" ON storage.objects;

CREATE POLICY "auth_read_form_videos" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'form-videos'
    AND (
      is_trainer()
      OR (
        public.current_trainee_id() IS NOT NULL
        AND (storage.foldername(name))[1] = public.current_trainee_id()
      )
    )
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Verify after applying:
--   SELECT polname, qual FROM pg_policies
--   WHERE schemaname='storage' AND polname='auth_read_form_videos';
--
-- Manual smoke (sign in as Diego in dev, then in supabase-js):
--   await supabase.storage.from('form-videos').list('tr_diego')      // OK
--   await supabase.storage.from('form-videos').list('tr_some_other') // empty
--
--   const { data } = await supabase.storage.from('form-videos')
--     .createSignedUrl('tr_some_other/anything.mp4', 60);
--   // expected: { error: 'Object not found' } — the SELECT policy denies
--   // the underlying row, so signed-URL minting fails.
-- ---------------------------------------------------------------------------
