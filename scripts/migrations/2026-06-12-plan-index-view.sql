-- 2026-06-12-plan-index-view.sql
-- Lightweight server-side plan index for usePlanIndex().
--
-- Why: the coach app's plan index needs only counts + day names, but the
-- client had to SELECT * and download every plan's full data JSONB
-- (~290KB at 210 plans) on each mount just to count days/exercises.
-- This view computes those in SQL so the index payload is a few KB.
--
-- security_invoker keeps the plans-table RLS in force for whoever queries
-- the view (coach sees all via is_trainer(); athletes see their own rows,
-- same as the direct table read today). No new policies, so the RLS-drift
-- canary baseline is unaffected.
--
-- The client (usePlansStore.js) falls back to the legacy full-row read if
-- this view doesn't exist yet, so the migration can land at any time.

create or replace view public.plan_index
with (security_invoker = true) as
select
  p.id,
  p.name,
  p.trainee_id,
  p.phase,
  p.active,
  p.created_at,
  p.updated_at,
  -- Typed column wins; fall back to the JSONB flag (string-compared so a
  -- malformed value can never abort the whole query with a cast error).
  ((p.is_template_purchase is true)
    or (p.data->>'isTemplatePurchase') = 'true') as is_template_purchase,
  case
    when p.data->>'weeks' ~ '^[0-9]+$' then (p.data->>'weeks')::int
    else 4
  end as weeks,
  coalesce(d.day_count, 0) as day_count,
  coalesce(d.exercise_count, 0) as exercise_count,
  coalesce(d.day_names, '[]'::jsonb) as day_names
from public.plans p
left join lateral (
  select
    count(*)::int as day_count,
    -- Plans carry two shapes: trainer-shape day.exercises and old
    -- drive-import day.ex (see reference_plan_dual_shape). Count both.
    coalesce(sum(
      case
        when jsonb_typeof(day.value->'exercises') = 'array'
          then jsonb_array_length(day.value->'exercises')
        when jsonb_typeof(day.value->'ex') = 'array'
          then jsonb_array_length(day.value->'ex')
        else 0
      end
    ), 0)::int as exercise_count,
    jsonb_agg(coalesce(day.value->>'name', day.value->>'n', '') order by day.ord) as day_names
  from jsonb_array_elements(
    case
      when jsonb_typeof(p.data->'days') = 'array' then p.data->'days'
      else '[]'::jsonb
    end
  ) with ordinality as day(value, ord)
) d on true;

grant select on public.plan_index to anon, authenticated;
