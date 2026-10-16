-- #815 (16.10, Ohad: "make sure people save the workout ... show the workout is not complete meaning incomplete but
-- started" + "everything needs to be [auto] saved on every single screen while a workout is being done").
--
-- workout_drafts: ONE row per workout an athlete has started and not finished - the logger's own draft (the same object
-- it keeps in localStorage), written to the server on every change, deleted when the workout is finished. Kept apart
-- from client_workouts on purpose: every reader of client_workouts (history, the analysis, PRs, the week index, the
-- session count) treats a row as a finished workout, so a half-logged one must never land there.
--
-- id = the logger's draft key (client | plan | day | day index | week). The athlete reads and writes his own (a couple
-- member's id carries a __N suffix); staff read all (the coach's 'started, not finished' list) and clear them.
-- nudged_at: set once the abandoned-workout push went out (the daemon's 20-minute step), so it nudges once.
-- Applied to prod via the Supabase MCP (apply_migration). Rollback: drop table public.workout_drafts, public.sbx_workout_drafts.

create table if not exists public.workout_drafts (
  id text primary key,
  client_id text not null,
  plan_name text not null,
  day_name text not null,
  week integer,
  payload jsonb not null default '{}'::jsonb,
  done_sets integer not null default 0,
  total_sets integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nudged_at timestamptz
);
create index if not exists workout_drafts_client_idx on public.workout_drafts (client_id);
create index if not exists workout_drafts_updated_idx on public.workout_drafts (updated_at);
alter table public.workout_drafts enable row level security;

drop policy if exists wd_own on public.workout_drafts;
create policy wd_own on public.workout_drafts for all to authenticated
  using ((client_id = current_client_id()) or (regexp_replace(client_id, '__[0-9]+$', '') = current_client_id()))
  with check ((client_id = current_client_id()) or (regexp_replace(client_id, '__[0-9]+$', '') = current_client_id()));
drop policy if exists wd_staff_all on public.workout_drafts;
create policy wd_staff_all on public.workout_drafts for all to authenticated using (is_staff()) with check (is_staff());

-- the partner sandbox twin (src/supabase.js SBX_TABLES)
create table if not exists public.sbx_workout_drafts (like public.workout_drafts including all);
alter table public.sbx_workout_drafts enable row level security;
drop policy if exists sbx_rw on public.sbx_workout_drafts;
create policy sbx_rw on public.sbx_workout_drafts for all to authenticated
  using ((select (is_partner() or is_trainer()))) with check ((select (is_partner() or is_trainer())));

-- REVIEW FIXES (16.10 22:55, applied via execute_sql)
-- by_email: the signed-in person who logged it (a couple shares one client_id; the nudge goes to the one who left).
-- edited_at: the device's last real edit (the payload's editedAt) - which copy is newer is read from this, never from
-- updated_at, which is now the SERVER's clock (trigger), so a device clock hours off can not trigger or block a nudge.
alter table public.workout_drafts add column if not exists by_email text;
alter table public.workout_drafts add column if not exists edited_at timestamptz;
alter table public.sbx_workout_drafts add column if not exists by_email text;
alter table public.sbx_workout_drafts add column if not exists edited_at timestamptz;

create or replace function public.workout_drafts_touch() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.updated_at := now(); new.started_at := now();
  elsif new.payload is distinct from old.payload then new.updated_at := now();
  else new.updated_at := old.updated_at; end if;   -- stamping nudged_at is not activity
  return new;
end $$;
create trigger workout_drafts_touch before insert or update on public.workout_drafts for each row execute function public.workout_drafts_touch();
create trigger workout_drafts_touch before insert or update on public.sbx_workout_drafts for each row execute function public.workout_drafts_touch();

-- a workout saved (from any device, online or later from the offline queue) takes its draft with it. SECURITY DEFINER
-- so the athlete's own insert can clear it; any error is swallowed - this must NEVER fail a workout save.
create or replace function public.workout_drafts_clear_on_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_table_name = 'sbx_client_workouts' then
      delete from public.sbx_workout_drafts where client_id = new.client_id and plan_name = new.plan_name and day_name = new.day_name and week is not distinct from new.week;
    else
      delete from public.workout_drafts where client_id = new.client_id and plan_name = new.plan_name and day_name = new.day_name and week is not distinct from new.week;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke execute on function public.workout_drafts_clear_on_log() from public, anon, authenticated;
create trigger workout_drafts_clear_on_log after insert or update on public.client_workouts for each row execute function public.workout_drafts_clear_on_log();
create trigger workout_drafts_clear_on_log after insert or update on public.sbx_client_workouts for each row execute function public.workout_drafts_clear_on_log();

-- a draft's id must be this athlete's own key (no squatting another athlete's id under one's own client_id)
alter policy wd_own on public.workout_drafts
  using ((client_id = current_client_id()) or (regexp_replace(client_id, '__[0-9]+$', '') = current_client_id()))
  with check (((client_id = current_client_id()) or (regexp_replace(client_id, '__[0-9]+$', '') = current_client_id())) and starts_with(id, 'expo-stepLogger-' || client_id || '-'));
-- RE-REVIEW (16.10 23:15, applied): by_email is set by the SERVER from the signed-in token (a phone could otherwise
-- name any email and have the nudge push its own text there, sent as the owner); the owner stamping nudged_at keeps
-- it. And only a NEW workout clears a draft: an update to an older row (a coach review, a video patch) is not a finish.
create or replace function public.workout_drafts_touch() returns trigger language plpgsql set search_path = public as $$
declare jwt_email text := lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''));
begin
  if tg_op = 'INSERT' then new.updated_at := now(); new.started_at := now(); new.by_email := jwt_email;
  elsif new.payload is distinct from old.payload then new.updated_at := now(); new.by_email := coalesce(jwt_email, old.by_email);
  else new.updated_at := old.updated_at; new.by_email := old.by_email; end if;
  return new;
end $$;
drop trigger if exists workout_drafts_clear_on_log on public.client_workouts;
drop trigger if exists workout_drafts_clear_on_log on public.sbx_client_workouts;
create trigger workout_drafts_clear_on_log after insert on public.client_workouts for each row execute function public.workout_drafts_clear_on_log();
create trigger workout_drafts_clear_on_log after insert on public.sbx_client_workouts for each row execute function public.workout_drafts_clear_on_log();
-- Rollback of this part: drop trigger workout_drafts_clear_on_log on public.client_workouts / public.sbx_client_workouts;
-- drop trigger workout_drafts_touch on both draft tables; the two columns are additive.
