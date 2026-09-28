-- OWED, per client, as the roster sheet (רשימת מתאמנים) says it right now (#386).
-- One row per sheet row, REPLACED on every sync (scripts/sync-owed.mjs). OWNER-ONLY,
-- exactly like revenue_sheet_event / revenue_month_total: never athlete-readable.
-- amount is NULL whenever the sheet does not state enough to price it (online rows,
-- a split price next to a session kind the rule does not cover) - never a guess.
-- Revert: drop table public.revenue_owed;
create table if not exists public.revenue_owed (
  id text primary key,                 -- section + sheet row
  section text not null,               -- 'in_person' | 'online'
  client_name text not null,
  trainee_id text,
  last_payment date,
  sessions_text text,
  sessions_by jsonb,                   -- {"personal":4,"couple":6,"other":0}
  price_text text,
  prices jsonb,                        -- {"personal":175,"couple":200} or {"all":250}
  amount numeric,                      -- owed per the owner's rule, or null
  method text,                         -- how amount was reached, in words
  sheet_updated text,                  -- the sheet's own "עודכן לאחרונה" line
  synced_at timestamptz not null default now()
);
alter table public.revenue_owed enable row level security;
drop policy if exists revenue_owed_owner on public.revenue_owed;
create policy revenue_owed_owner on public.revenue_owed for all to authenticated
  using ((select auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');
revoke all on public.revenue_owed from anon;
