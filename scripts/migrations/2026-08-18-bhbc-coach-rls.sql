-- BHBC coach access — ADDITIVE, low-risk. Grants the 4 BHBC coach accounts
-- read access to ONLY the expo-bhbc-* store keys, and the PT write access to
-- the medical key. Touches NO existing policy, so owner/staff/athlete access is
-- unchanged and PT clients in expo-trainees stay invisible to coaches.
-- Ohad 2026-08-18 (first practice = today; coaches need read-only login).

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
      'expo-bhbc-league','expo-bhbc-medical'
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
