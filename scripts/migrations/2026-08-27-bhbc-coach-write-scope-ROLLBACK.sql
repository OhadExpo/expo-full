-- ROLLBACK for 2026-08-26-bhbc-coach-write-scope.sql
--
-- Reversibility is not optional, and the forward migration shipped without
-- this. Run it only if the write ceiling turns out to block something a coach
-- legitimately needs.
--
-- What the forward migration added:
--   * public.bhbc_coach_write_blocked(text)   — a stable SECURITY DEFINER test
--   * three RESTRICTIVE policies on public.store (update / insert / delete)
--
-- RESTRICTIVE policies AND together with everything else, so dropping them
-- restores exactly the previous behaviour: the permissive policies that were
-- already there resume deciding on their own. Nothing else is touched — the
-- forward migration deliberately left SELECT alone, so reads never changed and
-- there is nothing to restore on that side.
--
-- After running this, `node scripts/verify-bhbc-write-scope.mjs` should return
-- to 5 passed / 3 failed. That is the pre-migration state, hole and all.

begin;

drop policy if exists store_bhbc_coach_write_ceiling_update on public.store;
drop policy if exists store_bhbc_coach_write_ceiling_insert on public.store;
drop policy if exists store_bhbc_coach_write_ceiling_delete on public.store;

drop function if exists public.bhbc_coach_write_blocked(text);

commit;

-- Sanity check afterwards — expect zero rows:
--
--   select policyname, permissive, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and tablename  = 'store'
--     and policyname like 'store_bhbc_coach_write_ceiling%';
