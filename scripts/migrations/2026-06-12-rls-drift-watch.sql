-- 2026-06-12 — "never again" package: RLS drift watch + upload-retry policy.
--
-- Context: two prod incidents (2026-06-06 store lock broke the athlete login
-- gate; 2026-06-12 a dropped EXECUTE grant on current_trainee_id() broke every
-- athlete video upload). Both were RLS/grant drift the 10-min athlete canary
-- could not see. This migration gives the canary X-ray vision:
--
--   1. health_rls_manifest(p_secret) — secret-gated SECURITY DEFINER snapshot
--      of ALL RLS policies (public + storage), ALL public-schema function
--      grants (anon/authenticated EXECUTE), and per-table RLS-enabled flags.
--      The canary hashes this against a baseline committed in the repo
--      (scripts/rls-baseline.json) and pages the coach on ANY divergence —
--      including paths no synthetic check exercises.
--
--   2. form_videos_update_own — closes the latent upload-retry bug: the
--      athlete XHR upload sends x-upsert:true; retrying the SAME storagePath
--      (blobQueue does exactly this) hits INSERT ... ON CONFLICT DO UPDATE,
--      and form-videos had NO UPDATE policy at all → retry always failed.
--
--   3. health_owner_subs re-gated on the rotated HEALTH_SECRET (rotated
--      2026-06-12 because `vercel env pull` returns sensitive vars empty;
--      old value was unrecoverable). Secret + this SQL rotate together.
--
-- <HEALTH_SECRET> below is a placeholder — paste the real value (Vercel env
-- HEALTH_SECRET) when applying. NEVER commit the real secret.

-- ---------------------------------------------------------------------------
-- 1. RLS manifest snapshot
-- ---------------------------------------------------------------------------
create or replace function public.health_rls_manifest(p_secret text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_secret is distinct from '<HEALTH_SECRET>' then null else
    jsonb_build_object(
      'policies', (
        select coalesce(jsonb_agg(jsonb_build_object(
          's', schemaname, 't', tablename, 'p', policyname,
          'r', roles::text, 'c', cmd,
          'q', coalesce(qual, ''), 'w', coalesce(with_check, '')
        ) order by schemaname, tablename, policyname), '[]'::jsonb)
        from pg_policies
        where schemaname in ('public', 'storage')
      ),
      'functions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'f', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
          'anon', has_function_privilege('anon', p.oid, 'execute'),
          'authed', has_function_privilege('authenticated', p.oid, 'execute'),
          'secdef', p.prosecdef
        ) order by p.proname, p.oid), '[]'::jsonb)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      ),
      'rls', (
        select coalesce(jsonb_agg(jsonb_build_object(
          't', c.relname, 'on', c.relrowsecurity
        ) order by c.relname), '[]'::jsonb)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      )
    )
  end;
$$;

revoke all on function public.health_rls_manifest(text) from public;
grant execute on function public.health_rls_manifest(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. form-videos: athlete may overwrite (upsert-retry) ONLY in own folder
-- ---------------------------------------------------------------------------
drop policy if exists form_videos_update_own on storage.objects;
create policy form_videos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'form-videos'
    and (
      is_trainer()
      or (
        public.current_trainee_id() is not null
        and (storage.foldername(name))[1] = public.current_trainee_id()
      )
    )
  )
  with check (
    bucket_id = 'form-videos'
    and (
      is_trainer()
      or (
        public.current_trainee_id() is not null
        and (storage.foldername(name))[1] = public.current_trainee_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. health_owner_subs — re-gate on the rotated secret
--    (definition fetched live before applying; only the secret literal
--    changes. If the live body differs from the recreate below, STOP and
--    reconcile first.)
-- ---------------------------------------------------------------------------
-- Run first:  select pg_get_functiondef(oid) from pg_proc
--             where proname = 'health_owner_subs';
-- Then re-create it with '<HEALTH_SECRET>' as the gate value.

-- ---------------------------------------------------------------------------
-- 4. form-videos INSERT scoping (applied 2026-06-12, audit follow-up)
-- ---------------------------------------------------------------------------
-- The old `public_upload` policy was FOR INSERT TO public WITH CHECK
-- (bucket_id='form-videos') — i.e. ANYONE with the bundled publishable key
-- could write to ANY folder. That produced orphan folders (t4/t5/_lib) and is
-- a bucket-fill DoS (free-tier 1GB cap → 413s for everyone). The app now
-- uploads with the athlete's SESSION token (not the anon key), so INSERT can
-- be scoped to the caller's own trainee folder.
drop policy if exists public_upload on storage.objects;
drop policy if exists form_videos_insert_own on storage.objects;
create policy form_videos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'form-videos'
    and (
      is_trainer()
      or (
        public.current_trainee_id() is not null
        and (storage.foldername(name))[1] = public.current_trainee_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Storage cap watch (secret-gated) — canary pages at 88% of the 1GB cap
-- ---------------------------------------------------------------------------
create or replace function public.health_storage_usage(p_secret text)
returns jsonb language sql stable security definer set search_path = public, storage as $$
  select case when p_secret is distinct from '<HEALTH_SECRET>' then null else
    (select jsonb_build_object('bucket','form-videos',
       'bytes', coalesce(sum((metadata->>'size')::bigint),0),
       'objects', count(*)) from storage.objects where bucket_id='form-videos')
  end;
$$;
revoke all on function public.health_storage_usage(text) from public;
grant execute on function public.health_storage_usage(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verify after applying:
--   select public.health_rls_manifest('<HEALTH_SECRET>') is not null;       -- true
--   select public.health_rls_manifest('wrong') is null;                     -- true
--   select count(*) from pg_policies where policyname='form_videos_update_own'; -- 1
--   select count(*) from pg_policies where policyname='form_videos_insert_own'; -- 1
--   select count(*) from pg_policies where policyname='public_upload';          -- 0
--   select public.health_storage_usage('<HEALTH_SECRET>');                       -- {bytes,objects}
-- After ANY intentional change here: re-run scripts/regen-rls-baseline.cjs and
-- commit scripts/rls-baseline.json in the SAME commit or the canary pages.
-- ---------------------------------------------------------------------------
