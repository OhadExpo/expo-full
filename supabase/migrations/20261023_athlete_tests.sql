-- ATHLETE TESTS (#897, 23.10, from the TrackJump reel: "apply to our systems and tools") - an athlete measures his own
-- vertical jump from a phone clip in the portal (Progress -> Jump test) and the result reaches his coach. Until now a
-- jump lived only in one coach device's localStorage ('expo-jump-metrics').
--   kind   'cmj' (countermovement jump); more kinds later without a migration
--   value  centimetres (the flight-time height, poseLab.jumpMetrics)
--   detail flight ms, peak rise, frame rate, the model - never the clip itself
-- Who: the athlete reads and writes his own rows (a couple's '__N' seat included, as athlete_meals); staff read and
-- write all. Elad's partner seat reads its sandbox twin (sbx_athlete_tests), as every coach table.
create table if not exists public.athlete_tests (
  id          uuid primary key default gen_random_uuid(),
  trainee_id  text not null,
  kind        text not null default 'cmj' check (kind in ('cmj', 'squat_jump', 'broad_jump')),
  value       numeric not null check (value > 0 and value < 400),
  detail      jsonb not null default '{}'::jsonb,
  tested_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists athlete_tests_trainee_idx on public.athlete_tests (trainee_id, tested_at desc);
alter table public.athlete_tests enable row level security;
create policy athlete_tests_own on public.athlete_tests for all to authenticated
  using (trainee_id = public.current_client_id() or regexp_replace(trainee_id, '__[0-9]+$', '') = public.current_client_id())
  with check (trainee_id = public.current_client_id() or regexp_replace(trainee_id, '__[0-9]+$', '') = public.current_client_id());
create policy athlete_tests_staff on public.athlete_tests for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.athlete_tests to authenticated;
grant select, insert, update, delete on public.athlete_tests to service_role;

-- the partner seat's copy
create table if not exists public.sbx_athlete_tests (like public.athlete_tests including all);
alter table public.sbx_athlete_tests enable row level security;
create policy sbx_rw on public.sbx_athlete_tests for all to authenticated
  using ((select public.is_partner() or public.is_trainer())) with check ((select public.is_partner() or public.is_trainer()));
grant select, insert, update, delete on public.sbx_athlete_tests to authenticated;
grant select, insert, update, delete on public.sbx_athlete_tests to service_role;
