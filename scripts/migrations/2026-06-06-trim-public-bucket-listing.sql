-- 2026-06-06 — stop anon ENUMERATION of public storage buckets (audit pass 3).
--
-- All four buckets (form-videos, meal-photos, coach-voice, coaching-contracts)
-- are public:true, so object reads go via /object/public/<path> which bypasses
-- RLS. The broad SELECT policies dropped below only enabled LISTING — letting
-- anyone with the bundled publishable key enumerate every athlete's form videos
-- / meal photos / voice notes. The app reads exclusively via getPublicUrl, so
-- dropping these does NOT break playback (verified: public-URL read returns 200
-- video/mp4; anon list now returns []).
--
-- form-videos keeps `auth_read_form_videos` (path-scoped, is_trainer OR own
-- folder) so the coach DashboardView storage-probe list still works.
-- Uploads (public_upload / *_write_authed) left untouched — public_upload is the
-- athlete (anon) upload path; tightening it needs an authed-upload code change.

drop policy if exists public_read        on storage.objects;  -- form-videos broad list
drop policy if exists meals_read_any     on storage.objects;  -- meal-photos
drop policy if exists voice_read_any     on storage.objects;  -- coach-voice
drop policy if exists contracts_read_any on storage.objects;  -- coaching-contracts

-- STILL OPEN (Ohad's call):
--  * public_upload (form-videos) — anyone can upload; needs authed-upload refactor.
--  * Full privatization (signed URLs) if the unguessable-public-path model is
--    deemed insufficient for health-related form videos.
--  * Enable Supabase Auth leaked-password protection (HaveIBeenPwned) — dashboard toggle.
