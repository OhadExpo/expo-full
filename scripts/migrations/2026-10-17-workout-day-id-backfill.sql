-- #873 one-time backfill, after 2026-10-17-workout-day-id.sql. Re-runnable: it only fills what is still empty (a log
-- whose day was deleted keeps its dangling id - a later day of the same name is a different day, re-review N3).
-- 1. every stored day gets an id: touching data fires plans_stamp_day_ids. updated_at moves by 1 ms (the plans keep
--    their "updated" order), so an editor open on one of these plans (holding random per-load ids) gets a save
--    conflict and reloads the stamped ids instead of writing its own over them.
-- 2. a log gets its day's id only where its plan, its day name and its week (a one-week day counts only for its own
--    week) pick EXACTLY ONE day. Anything else stays as it is - name only, never a guess.
-- Measured before the run (17.10 06:40): prod 185 logs, 10 without plan_id, 173 unique matches, 0 ambiguous,
-- 0 duplicate day ids in any plan; 163 of 252 plans had days without ids.

update public.plans set data = data, updated_at = updated_at + interval '1 millisecond'
where jsonb_typeof(data -> 'days') = 'array'
  and exists (select 1 from jsonb_array_elements(data -> 'days') x where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') = '');
update public.sbx_plans set data = data, updated_at = updated_at + interval '1 millisecond'
where jsonb_typeof(data -> 'days') = 'array'
  and exists (select 1 from jsonb_array_elements(data -> 'days') x where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') = '');

with days as (
  select p.id pid, x ->> 'id' did, coalesce(nullif(x ->> 'name', ''), x ->> 'n') nm,
         case when x ->> 'onlyWeek' ~ '^\d+$' then (x ->> 'onlyWeek')::int end ow
  from public.plans p, jsonb_array_elements(case when jsonb_typeof(p.data -> 'days') = 'array' then p.data -> 'days' else '[]'::jsonb end) x
  where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') <> ''
), uniq as (
  select w.id wid, min(d.did) did
  from public.client_workouts w join days d on d.pid = w.plan_id and d.nm = w.day_name and (d.ow is null or d.ow = w.week)
  where w.day_id is null
  group by w.id having count(distinct d.did) = 1
)
update public.client_workouts w set day_id = u.did from uniq u where w.id = u.wid and w.day_id is distinct from u.did;

with days as (
  select p.id pid, x ->> 'id' did, coalesce(nullif(x ->> 'name', ''), x ->> 'n') nm,
         case when x ->> 'onlyWeek' ~ '^\d+$' then (x ->> 'onlyWeek')::int end ow
  from public.sbx_plans p, jsonb_array_elements(case when jsonb_typeof(p.data -> 'days') = 'array' then p.data -> 'days' else '[]'::jsonb end) x
  where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') <> ''
), uniq as (
  select w.id wid, min(d.did) did
  from public.sbx_client_workouts w join days d on d.pid = w.plan_id and d.nm = w.day_name and (d.ow is null or d.ow = w.week)
  where w.day_id is null
  group by w.id having count(distinct d.did) = 1
)
update public.sbx_client_workouts w set day_id = u.did from uniq u where w.id = u.wid and w.day_id is distinct from u.did;
