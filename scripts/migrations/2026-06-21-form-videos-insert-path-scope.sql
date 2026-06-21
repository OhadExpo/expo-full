-- Hardening (audit 2026-06-21): the form-videos storage INSERT policy only
-- checks bucket + authed, NOT the folder. SELECT was path-scoped on 2026-05-07,
-- but INSERT was left open — so an authenticated trainee using supabase-js
-- directly could write into ANOTHER trainee's folder (and, because SELECT is
-- folder-scoped, that forged object becomes readable by the folder owner). The
-- app always writes `${clientId}/...`, so normal use is unaffected.
--
-- ⚠️ DO NOT APPLY BLIND. Adding a folder check to INSERT is the EXACT class of
-- change that has previously locked athletes out of uploading (grant/RLS drift).
-- BEFORE applying, VERIFY for EVERY athlete — especially COUPLES (tr_x__0 /
-- tr_x__1 sub-members) — that the folder the portal uploads to (clientId) equals
-- public.current_trainee_id() for that athlete's session. If a couple member
-- uploads to a folder that doesn't match current_trainee_id(), this policy will
-- 403 their uploads. Test as a real couple member (universal pw 1234) first.
-- After applying, re-query pg_policies (prod RLS drifts from repo).

DROP POLICY IF EXISTS auth_upload_form_videos ON storage.objects;
CREATE POLICY auth_upload_form_videos ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'form-videos'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_trainer()
      OR (storage.foldername(name))[1] = public.current_trainee_id()
    )
  );
