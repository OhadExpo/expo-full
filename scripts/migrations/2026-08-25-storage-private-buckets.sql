-- Storage buckets: public -> private   (2026-08-25)
--
-- ⚠️  DO NOT RUN THIS WITHOUT OHAD. It is outward-facing and changes what real
--     athletes can load. The app code is already ready for it (see below), but
--     the flip itself is his call.
--
-- WHY. The 2026-07-19 security audit left this open and it is still true. Proven
-- again on 2026-08-25 with scripts/_probe-storage-exposure.cjs: an
-- UNAUTHENTICATED HEAD against two real athletes' form-video URLs returned
-- 200 with the full content-length —
--
--   form-videos/tr_yuval/1776776726471-form.webm   200  video/webm  8264444B
--   form-videos/tr_amit/1776955731343-form.mp4     200  video/mp4   2741938B
--
-- Anyone holding a URL can fetch an athlete's training video, meal photo, voice
-- note or SIGNED COACHING CONTRACT. coach-voice paths are `traineeId/timestamp.ext`
-- with no random component, so they are guessable rather than merely leakable.
--
-- WHAT IS ALREADY DONE. src/storageUrl.js resolves every stored object through
-- createSignedUrl, which works on a public bucket too — so it is a no-op today
-- and becomes the fix the moment this runs. It falls back to the raw URL on any
-- failure, so a signing hiccup cannot blank a video.
--
-- BEFORE RUNNING, CHECK:
--   1. Every media READ path goes through resolveStoredUrl(). Grep for
--      getPublicUrl( and /object/public/ — anything left will break.
--   2. storage.objects has SELECT policies letting the right people read. While
--      the buckets are public, reads bypass RLS entirely, so those policies may
--      not exist yet. WRITE scoping was fixed on 2026-07-19; READ was not,
--      because it did not matter until now.
--   3. Anything pasted OUTSIDE the app (a WhatsApp link to a contract) stops
--      working. That is the point, but know it before, not after.
--
-- ROLLBACK is instant and total: set public = true again.

-- 1) the flip
UPDATE storage.buckets
   SET public = false
 WHERE id IN ('form-videos', 'meal-photos', 'coach-voice', 'coaching-contracts');

-- 2) reads must now be granted explicitly. An athlete reads their OWN folder;
--    staff read everything. Mirrors the INSERT scoping from
--    scripts/migrations/2026-07-19-*.sql, including the couple `__N` strip.
--
--    NOTE: current_client_id() / is_staff() are the helpers those migrations
--    already rely on. If either is missing, STOP — do not invent one here.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'media_read_own_or_staff') THEN
    CREATE POLICY media_read_own_or_staff ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id IN ('form-videos', 'meal-photos', 'coach-voice')
        AND (
          is_staff()
          OR split_part(name, '/', 1) = split_part(current_client_id(), '__', 1)
        )
      );
  END IF;

  -- Signed contracts are staff-only: there is no athlete-facing reader for them.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'contracts_read_staff_only') THEN
    CREATE POLICY contracts_read_staff_only ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'coaching-contracts' AND is_staff());
  END IF;
END $$;

-- STATUS 2026-08-25 — WHAT IS AND IS NOT VERIFIED:
--   ✓ The exposure is real: unauthenticated HEAD on two real athletes' form
--     videos returned 200 (scripts/_probe-storage-exposure.cjs).
--   ✓ Signing WORKS from the OWNER seat — resolveStoredUrl returned a real
--     /object/sign/ URL in the live app.
--   ✗ Signing from an ATHLETE seat is UNVERIFIED. scripts/_probe-athlete-signing.mjs
--     could not complete an athlete sign-in, so we do NOT know whether an athlete
--     session can sign its own media. Object reads bypass RLS while the buckets
--     are public, so storage.objects may have no SELECT policy at all today.
--     >>> THIS IS THE BLOCKER. Verify it from a real athlete seat before running
--         this file, or athletes lose access to their own videos the moment it
--         executes. The policies below are written for exactly that, but they
--         have not been proven against a real athlete session.
--
-- VERIFY AFTER RUNNING (both must hold):
--   • node scripts/_probe-storage-exposure.cjs  -> the HEADs must now be 400/403.
--   • Sign in AS an athlete and open a form video in the portal — it must still
--     play. Verify from the real seat, not the owner's.
