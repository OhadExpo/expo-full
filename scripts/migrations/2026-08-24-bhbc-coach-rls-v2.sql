-- BHBC coach access v2 — ADDITIVE, idempotent, safe to re-run.
-- Supersedes 2026-08-18-bhbc-coach-rls.sql: same grants, plus the new
-- per-session plan key (expo-bhbc-plans) so a coach can READ what the squad is
-- doing in each slot. Touches no existing policy outside the ones it owns, so
-- owner/staff/athlete access is unchanged and PT clients in expo-trainees stay
-- invisible to coaches.
-- Ohad 2026-08-24 (coach sign-ins provisioned the same day).

-- Who is a BHBC coach / the BHBC physio (email allowlist, mirrors src/auth.jsx).
create or replace function public.is_bhbc_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce((auth.jwt() ->> 'email'), '')) in (
    'benshemer4@gmail.com','elishai115@gmail.com','yehuorland@gmail.com','yoel23919@gmail.com'
  );
$$;

create or replace function public.is_bhbc_pt()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce((auth.jwt() ->> 'email'), '')) = 'yoel23919@gmail.com';
$$;

-- The keys a coach may READ. expo-bhbc-roster is the PT-client-free projection.
-- Everything else in `store` (expo-trainees, expo-cw, plans, etc.) stays denied.
drop policy if exists store_bhbc_coach_read on public.store;
create policy store_bhbc_coach_read on public.store
  for select to authenticated
  using (
    public.is_bhbc_coach()
    and key in (
      'expo-bhbc-roster','expo-bhbc-loads','expo-bhbc-fixtures',
      'expo-bhbc-league','expo-bhbc-medical','expo-bhbc-plans'
    )
  );

-- The PT (physio) may WRITE the medical board only. Upsert = insert + update.
drop policy if exists store_bhbc_pt_medical_write on public.store;
create policy store_bhbc_pt_medical_write on public.store
  for update to authenticated
  using (public.is_bhbc_pt() and key = 'expo-bhbc-medical')
  with check (public.is_bhbc_pt() and key = 'expo-bhbc-medical');
drop policy if exists store_bhbc_pt_medical_insert on public.store;
create policy store_bhbc_pt_medical_insert on public.store
  for insert to authenticated
  with check (public.is_bhbc_pt() and key = 'expo-bhbc-medical');

-- Proof, in one row per coach: what each account can now read.
select
  'expo-bhbc-plans in coach read policy' as check,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store'
      and policyname = 'store_bhbc_coach_read'
      and qual like '%expo-bhbc-plans%'
  ) as ok;
