-- SECURITY — storage INSERT scoping + upload size caps. Applied to prod 2026-07-19.
--
-- meal-photos / coach-voice / coaching-contracts INSERT policies checked ONLY
-- bucket_id, with no path scoping, so ANY signed-in athlete could write into
-- ANY other athlete's folder — plant a file under someone else's contract or
-- voice prefix, or use the project as free file hosting. form-videos was
-- already scoped correctly (is_trainer() OR own folder); this brings the other
-- three in line.
--
-- Couple-safe: a couple is ONE trainee row whose members upload under
-- '<parent>__0' / '__1', while current_trainee_id() returns the PARENT id.
-- Both sides are compared with a trailing '__N' stripped — the same rule the
-- realtime topic predicate uses — otherwise couple members lose uploads.
--
-- coaching-contracts has NO writer anywhere in src/ or api/ (contracts are
-- signed through the sign_contract RPC into the DB), so it is restricted to
-- staff rather than left open to every athlete.
--
-- Buckets also had file_size_limit = NULL (unbounded uploads). Caps are
-- generous enough not to reject a real phone video, the largest legit upload.
--
-- NOT addressed here (Ohad's call, pre-existing): all four buckets are still
-- public:true, so object READS need no auth — anyone with a URL can fetch a
-- form video, meal photo, voice note or signed contract. Making them private
-- means migrating every stored /object/public/ URL to signed URLs.
--
-- Verified after applying (scripts/_verify-storage-write-scoping.cjs, 4/4):
--   own meal folder upload      -> still works
--   other athlete meal folder   -> RLS violation
--   other athlete voice folder  -> RLS violation
--   coaching-contracts as athlete -> RLS violation

drop policy if exists meals_write_authed on storage.objects;
create policy meals_write_authed on storage.objects
for insert to authenticated
with check (
  bucket_id = 'meal-photos'
  and (
    public.is_staff()
    or (
      public.current_trainee_id() is not null
      and regexp_replace((storage.foldername(name))[1], '__[0-9]+$', '')
          = regexp_replace(public.current_trainee_id(), '__[0-9]+$', '')
    )
  )
);

drop policy if exists voice_write_authed on storage.objects;
create policy voice_write_authed on storage.objects
for insert to authenticated
with check (
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

drop policy if exists contracts_write_authed on storage.objects;
create policy contracts_write_authed on storage.objects
for insert to authenticated
with check (bucket_id = 'coaching-contracts' and public.is_staff());

update storage.buckets set file_size_limit = 314572800 where id = 'form-videos';        -- 300 MB
update storage.buckets set file_size_limit =  26214400 where id = 'coach-voice';        --  25 MB
update storage.buckets set file_size_limit =  15728640 where id = 'meal-photos';        --  15 MB
update storage.buckets set file_size_limit =  10485760 where id = 'coaching-contracts'; --  10 MB
