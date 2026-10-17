-- #873 (17.10): a renamed DAY keeps its logs - BY ID, in the database, in the same transaction as the plan save.
-- A logged workout names its day (day_name). Renaming a day in the editor left its logs on the old name. The name
-- carry done in the browser (f2685b8b, reverted) compared names against a remembered version and moved logs by
-- name: stale versions, interrupted swaps and same-named one-week days moved the WRONG logs. Here nothing is
-- compared and nothing is moved by name:
--   1. every stored day has a stable id, unique in its plan (plans_stamp_day_ids, on any write - imports, scripts);
--      a writer that dropped the ids (a restore, a re-import) gets back the old id of the one old day with the same
--      name and week, so its logs stay linked;
--   2. a log carries its day's id (client_workouts.day_id, written by the loggers);
--   3. after every plan save, every log OF THAT PLAN'S ATHLETE whose day_id is one of the plan's days takes that
--      day's CURRENT name (plan_days_carry_log_names). A function of (day id -> name): the same however often it
--      runs, in whatever order the saves came, from whichever device. It runs on every save, not only when the
--      days changed, so a log that raced a rename is set right by the next save;
--   4. a log written with a day_id takes its day's current name (workout_day_name_from_plan) - a late offline
--      write from a phone that still had the old name lands on the new one.
-- A blank day name never overwrites a log's name. A log without plan_id / day_id keeps today's name behaviour.
-- Neither trigger can fail the write it rides on. Every function is SECURITY INVOKER: the writer's own RLS decides
-- what it can see and change. The sbx_ twins (Elad's sandbox seat) get the same, each told its partner by TG_ARGV.

alter table public.client_workouts add column if not exists day_id text;
alter table public.sbx_client_workouts add column if not exists day_id text;
create index if not exists client_workouts_plan_day_idx on public.client_workouts (plan_id, day_id);
create index if not exists sbx_client_workouts_plan_day_idx on public.sbx_client_workouts (plan_id, day_id);

create or replace function public.plans_stamp_day_ids() returns trigger
language plpgsql set search_path = public as $$
declare
  arr jsonb; out_days jsonb := '[]'::jsonb; x jsonb; did text; seen text[] := '{}'; nm text; ow text; heir text; changed boolean := false;
  keeper jsonb := '{}'::jsonb; i int; m boolean;
begin
  if jsonb_typeof(NEW.data -> 'days') <> 'array' then return NEW; end if;
  arr := NEW.data -> 'days';
  -- An id on two days (a copied day): the one that IS the old day with that id (same name and week) keeps it,
  -- else the first; the other is treated as a day without an id below, so it gets back ITS old id. (The editor
  -- never learns ids stamped here, so it sends the duplicate again on every save - the copy must not take the id,
  -- nor get a fresh one each time.)
  for x, i in select e, n from jsonb_array_elements(arr) with ordinality t(e, n) loop
    did := case when jsonb_typeof(x) = 'object' then nullif(x ->> 'id', '') end;
    if did is null then continue; end if;
    m := TG_OP = 'UPDATE' and jsonb_typeof(OLD.data -> 'days') = 'array' and exists (
      select 1 from jsonb_array_elements(OLD.data -> 'days') o
      where jsonb_typeof(o) = 'object' and o ->> 'id' = did
        and coalesce(nullif(o ->> 'name', ''), o ->> 'n') is not distinct from coalesce(nullif(x ->> 'name', ''), x ->> 'n')
        and coalesce(o ->> 'onlyWeek', '') = coalesce(x ->> 'onlyWeek', ''));
    if not (keeper ? did) or (m and not (keeper -> did ->> 'm')::boolean) then
      keeper := keeper || jsonb_build_object(did, jsonb_build_object('i', i, 'm', m));
    end if;
  end loop;
  for x, i in select e, n from jsonb_array_elements(arr) with ordinality t(e, n) loop
    if jsonb_typeof(x) = 'object' then
      did := nullif(x ->> 'id', '');
      if did is not null and (keeper -> did ->> 'i')::int <> i then did := null; end if;   -- the duplicate's turn
      if did is null then
        heir := null;
        if TG_OP = 'UPDATE' and jsonb_typeof(OLD.data -> 'days') = 'array' then
          nm := coalesce(nullif(x ->> 'name', ''), x ->> 'n'); ow := coalesce(x ->> 'onlyWeek', '');
          -- the old id of the ONE old day with this name and week, if it is not taken in the new array
          select min(o ->> 'id') into heir from jsonb_array_elements(OLD.data -> 'days') o
          where jsonb_typeof(o) = 'object' and coalesce(nullif(o ->> 'name', ''), o ->> 'n') = nm and coalesce(o ->> 'onlyWeek', '') = ow
            and nullif(o ->> 'id', '') is not null
          having count(*) = 1;
          if heir is not null and (heir = any(seen) or keeper ? heir) then heir := null; end if;   -- kept by another day
        end if;
        did := coalesce(heir, 'day_' || substr(md5(random()::text || clock_timestamp()::text || coalesce(array_length(seen, 1), 0)::text), 1, 14));
        x := x || jsonb_build_object('id', did);
        changed := true;
      end if;
      seen := seen || did;
    end if;
    out_days := out_days || jsonb_build_array(x);
  end loop;
  if changed then NEW.data := jsonb_set(NEW.data, '{days}', out_days); end if;
  return NEW;
end $$;

create or replace function public.plan_days_carry_log_names() returns trigger
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(NEW.data -> 'days') <> 'array' or coalesce(NEW.trainee_id, '') = '' then return null; end if;
  -- a plan save must never fail here (the editor would show a save error for a rename): a failed carry leaves the
  -- logs on their names, and the next save carries them
  begin
    execute format($q$
      update public.%I w set day_name = d.name
      from (select x ->> 'id' as id, coalesce(nullif(x ->> 'name', ''), x ->> 'n') as name
            from jsonb_array_elements($1) x where jsonb_typeof(x) = 'object') d
      where w.plan_id = $2 and w.day_id = d.id
        and w.client_id in ($3, regexp_replace($3, '__[0-9]+$', ''))   -- this plan's athlete only (a re-assigned plan)
        and coalesce(btrim(d.name), '') <> '' and w.day_name is distinct from d.name
    $q$, TG_ARGV[0]) using NEW.data -> 'days', NEW.id, NEW.trainee_id;
  exception when others then
    raise warning 'plan_days_carry_log_names %: %', NEW.id, SQLERRM;
  end;
  return null;
end $$;

create or replace function public.workout_day_name_from_plan() returns trigger
language plpgsql set search_path = public as $$
declare nm text;
begin
  if NEW.day_id is null or NEW.plan_id is null then return NEW; end if;
  if TG_OP = 'UPDATE' and NEW.day_id is not distinct from OLD.day_id and NEW.plan_id is not distinct from OLD.plan_id
     and NEW.day_name is not distinct from OLD.day_name then return NEW; end if;
  -- a log write must never fail here: any error leaves the row exactly as sent
  begin
    execute format($q$
      select coalesce(nullif(x ->> 'name', ''), x ->> 'n')
      from public.%I p, jsonb_array_elements(case when jsonb_typeof(p.data -> 'days') = 'array' then p.data -> 'days' else '[]'::jsonb end) x
      where p.id = $1 and jsonb_typeof(x) = 'object' and x ->> 'id' = $2
      order by coalesce(nullif(x ->> 'name', ''), x ->> 'n') limit 1
    $q$, TG_ARGV[0]) into nm using NEW.plan_id, NEW.day_id;
  exception when others then nm := null;
  end;
  -- (the phone that sent an old name clears its own draft by id when it finishes - ClientPortal - so the draft left
  -- under the old name is not this trigger's to remove)
  if coalesce(btrim(nm), '') <> '' then NEW.day_name := nm; end if;
  return NEW;
end $$;

create or replace trigger plans_stamp_day_ids before insert or update of data on public.plans
  for each row execute function public.plans_stamp_day_ids();
create or replace trigger plans_stamp_day_ids before insert or update of data on public.sbx_plans
  for each row execute function public.plans_stamp_day_ids();

create or replace trigger plan_days_carry_log_names after update of data on public.plans
  for each row execute function public.plan_days_carry_log_names('client_workouts');
create or replace trigger plan_days_carry_log_names after update of data on public.sbx_plans
  for each row execute function public.plan_days_carry_log_names('sbx_client_workouts');

create or replace trigger workout_day_name_from_plan before insert or update on public.client_workouts
  for each row execute function public.workout_day_name_from_plan('plans');
create or replace trigger workout_day_name_from_plan before insert or update on public.sbx_client_workouts
  for each row execute function public.workout_day_name_from_plan('sbx_plans');

-- One-time, after this file: scripts/migrations/2026-10-17-workout-day-id-backfill.sql
