-- Add Tomer as a BHBC coach WITH PT rights (same as Yoel).
--
-- The app-side lists in src/authRoles.js are only half the job: these two
-- Postgres helpers hardcode the emails, and every BHBC RLS policy calls them.
-- Without this, Tomer signs in, sees the zone, and reads nothing — the UI would
-- say he is a PT while the database disagreed.
--
-- is_bhbc_coach() → what he may READ (roster, loads, fixtures, league,
--                   medical, plans)
-- is_bhbc_pt()    → what only a PT may WRITE (the medical board)

begin;

create or replace function public.is_bhbc_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce((auth.jwt() ->> 'email'), '')) in (
    'benshemer4@gmail.com','elishai115@gmail.com','yehuorland@gmail.com',
    'yoel23919@gmail.com','tomerlich11@gmail.com'
  );
$$;

-- Two PTs now, so this is an IN list rather than an equality.
create or replace function public.is_bhbc_pt()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce((auth.jwt() ->> 'email'), '')) in (
    'yoel23919@gmail.com','tomerlich11@gmail.com'
  );
$$;

commit;

-- VERIFY (should list both PTs and all five coaches):
--   select proname, prosrc from pg_proc
--   where proname in ('is_bhbc_coach','is_bhbc_pt');
--
-- Then, from the app side:
--   node scripts/verify-auth-roles.mjs        -- 26 assertions, no network
--   node scripts/verify-bhbc-write-scope.mjs  -- asserts the real matrix
--
-- ROLLBACK: re-run scripts/migrations/2026-08-24-bhbc-coach-rls-v2.sql, which
-- holds the previous four-coach / one-PT definitions verbatim.
