-- #480 (30.9): the owner's seat asked for a signed URL of a coach voice note and
-- got 400 on every load: bucket coach-voice had INSERT policies only, and
-- createSignedUrl needs SELECT. storageUrl.js fell back to the public URL, so the
-- note played, but every load made one failed request.
--
-- Reads mirror the write rule voice_write_authed: staff, or the athlete whose
-- folder it is. The bucket is still public, so this exposes nothing new; it is
-- also the read rule the bucket needs before it can go private (#510-S).
-- Rollback: drop policy voice_read_authed on storage.objects;
create policy voice_read_authed on storage.objects
  for select to authenticated
  using (
    bucket_id = 'coach-voice'
    and (
      public.is_staff()
      or (
        public.current_trainee_id() is not null
        and regexp_replace((storage.foldername(name))[1], '__[0-9]+$', '')
          = regexp_replace(public.current_trainee_id(), '__[0-9]+$', '')
      )
    )
  );
