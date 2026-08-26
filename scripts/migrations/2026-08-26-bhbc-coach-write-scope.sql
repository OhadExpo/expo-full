-- BHBC coaches can write the MEDICAL board and the SHARED EXERCISE LIBRARY.
-- They should be able to write neither.
--
-- Found 2026-08-26 by signing in as benshemer4@gmail.com (a regular coach, not
-- the PT) and writing each store key's own value straight back — a real
-- round-trip through RLS that changes nothing:
--
--   expo-bhbc-medical   read=yes  write=ALLOWED   <-- injuries, PT-only by design
--   expo-bhbc-loads     read=yes  write=ALLOWED   <-- correct, this is their job
--   expo-bhbc-roster    read=yes  write=ALLOWED   <-- correct
--   expo-bhbc-plans     read=yes  write=ALLOWED   <-- correct
--   expo-exercises      read=yes  write=ALLOWED   <-- 1,326 exercises, WHOLE BUSINESS
--   expo-trainees       read=NO                   <-- correct
--
-- src/auth.jsx says the PT is "the ONLY BHBC coach (besides the owner) allowed
-- to report/edit injuries. The other coaches view the medical board read-only."
-- That rule was enforced in the UI only. The database allowed any coach to
-- write both keys through the API.
--
-- WHY RESTRICTIVE. Postgres RLS is permissive-OR: if any policy allows the
-- write, it happens. Rather than hunt and edit whichever permissive policy is
-- too broad — and risk missing another one, or a future one — this ANDs a hard
-- ceiling over all of them. A new permissive policy cannot reopen the hole.
--
-- SELECT is deliberately untouched: coaches must still READ the medical board
-- (they see it read-only) and the exercise library. Only writes are constrained.

begin;

-- The two keys a BHBC coach must never write. The PT keeps medical; owner and
-- staff keep everything, since is_trainer()/is_staff() short-circuit the test.
create or replace function public.bhbc_coach_write_blocked(k text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_bhbc_coach()
    and not coalesce(public.is_bhbc_pt(), false)
    and not coalesce(public.is_trainer(), false)
    and not coalesce(public.is_staff(), false)
    and k in ('expo-bhbc-medical', 'expo-exercises')
$$;

drop policy if exists store_bhbc_coach_write_ceiling_update on public.store;
create policy store_bhbc_coach_write_ceiling_update on public.store
  as restrictive
  for update
  to authenticated
  using (not public.bhbc_coach_write_blocked(key))
  with check (not public.bhbc_coach_write_blocked(key));

drop policy if exists store_bhbc_coach_write_ceiling_insert on public.store;
create policy store_bhbc_coach_write_ceiling_insert on public.store
  as restrictive
  for insert
  to authenticated
  with check (not public.bhbc_coach_write_blocked(key));

drop policy if exists store_bhbc_coach_write_ceiling_delete on public.store;
create policy store_bhbc_coach_write_ceiling_delete on public.store
  as restrictive
  for delete
  to authenticated
  using (not public.bhbc_coach_write_blocked(key));

commit;

-- AFTER APPLYING, run:  node scripts/verify-bhbc-write-scope.mjs
-- It asserts the whole matrix, not just the one case: the PT can still write
-- medical, a regular coach cannot, neither can touch the exercise library, and
-- coaches keep the loads/roster/plans writes their job depends on.
