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

-- CORRECTED 2026-10-02 (#510-S9, S10), before it has ever run:
--   * a couple's members upload to '<parent>__0/...' and '<parent>__1/...'
--     (2026-07-19-scope-storage-writes.sql); the first draft compared the bare
--     folder with the stripped caller id, so a couple member would have lost
--     their OWN videos, meals and voice notes. Both sides are stripped now,
--     with the same expression the write policy uses.
--   * plan exercise demos live in form-videos/_lib/ and every athlete plays
--     them; the first draft made them staff-only. _lib is readable by any
--     signed-in seat.
--   * DROP + CREATE, not IF NOT EXISTS: a policy of the same name left by an
--     earlier experiment must not survive with the old predicate.
-- Measured 2.10 while still public: an athlete seat signs its OWN form-videos
-- object and cannot list or sign another athlete's (audit-out/_athlete-sign-probe.mjs).
DROP POLICY IF EXISTS media_read_own_or_staff ON storage.objects;
CREATE POLICY media_read_own_or_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('form-videos', 'meal-photos', 'coach-voice')
    AND (
      public.is_staff()
      OR (bucket_id = 'form-videos' AND (storage.foldername(name))[1] = '_lib')
      OR (
        public.current_trainee_id() IS NOT NULL
        AND regexp_replace((storage.foldername(name))[1], '__[0-9]+$', '')
            = regexp_replace(public.current_trainee_id(), '__[0-9]+$', '')
      )
    )
  );

-- Signed contracts are staff-only: there is no athlete-facing reader for them.
DROP POLICY IF EXISTS contracts_read_staff_only ON storage.objects;
CREATE POLICY contracts_read_staff_only ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'coaching-contracts' AND public.is_staff());

-- STATUS 2026-08-25 — WHAT IS AND IS NOT VERIFIED:
--   ✓ The exposure is real: unauthenticated HEAD on two real athletes' form
--     videos returned 200 (scripts/_probe-storage-exposure.cjs).
--   ✓ Signing WORKS from the OWNER seat — resolveStoredUrl returned a real
--     /object/sign/ URL in the live app.
--   ✓ (2.10) Signing from an ATHLETE seat WORKS for the athlete's own folder
--     and is refused for another athlete's ("Object not found") - a SELECT
--     policy is already live and scopes (audit-out/_athlete-sign-probe.mjs, as
--     the diego fixture). The 2.10 read-path audit found 8 raw-URL renderers;
--     all now go through StoredMedia / resolveStoredUrl (#510-S1..S8).
--   ? Still to measure before running: a COUPLE member (tr_x__0) signing their
--     own media, and the owner signing coach-voice (QUEUE #480 saw a 400).
--
-- VERIFY AFTER RUNNING (both must hold):
--   • node scripts/_probe-storage-exposure.cjs  -> the HEADs must now be 400/403.
--   • Sign in AS an athlete and open a form video in the portal — it must still
--     play. Verify from the real seat, not the owner's.
