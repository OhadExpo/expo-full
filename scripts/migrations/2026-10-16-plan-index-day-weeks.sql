-- #850 (16.10): plan_index gains day_weeks - each day's onlyWeek (null = every week), parallel to day_names, so the
-- coach's in-person and group logging can offer only the days of the week being logged. Appended column only; every
-- existing column is unchanged. Rollback: re-run this view without the day_weeks column (2026-06-12-plan-index-view.sql).
create or replace view public.plan_index with (security_invoker = true) as
 SELECT p.id,
    p.name,
    p.trainee_id,
    p.phase,
    p.active,
    p.created_at,
    p.updated_at,
    p.is_template_purchase IS TRUE OR (p.data ->> 'isTemplatePurchase'::text) = 'true'::text AS is_template_purchase,
        CASE
            WHEN (p.data ->> 'weeks'::text) ~ '^[0-9]+$'::text THEN (p.data ->> 'weeks'::text)::integer
            ELSE 4
        END AS weeks,
    COALESCE(d.day_count, 0) AS day_count,
    COALESCE(d.exercise_count, 0) AS exercise_count,
    COALESCE(d.day_names, '[]'::jsonb) AS day_names,
    COALESCE(d.day_weeks, '[]'::jsonb) AS day_weeks
   FROM plans p
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS day_count,
            COALESCE(sum(
                CASE
                    WHEN jsonb_typeof(day.value -> 'exercises'::text) = 'array'::text THEN jsonb_array_length(day.value -> 'exercises'::text)
                    WHEN jsonb_typeof(day.value -> 'ex'::text) = 'array'::text THEN jsonb_array_length(day.value -> 'ex'::text)
                    ELSE 0
                END), 0::bigint)::integer AS exercise_count,
            jsonb_agg(COALESCE(day.value ->> 'name'::text, day.value ->> 'n'::text, ''::text) ORDER BY day.ord) AS day_names,
            jsonb_agg(day.value -> 'onlyWeek' ORDER BY day.ord) AS day_weeks
           FROM jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(p.data -> 'days'::text) = 'array'::text THEN p.data -> 'days'::text
                    ELSE '[]'::jsonb
                END) WITH ORDINALITY day(value, ord)) d ON true;

-- the partner sandbox twin (sbx_plans)
create or replace view public.sbx_plan_index with (security_invoker = true) as
 SELECT p.id,
    p.name,
    p.trainee_id,
    p.phase,
    p.active,
    p.created_at,
    p.updated_at,
    p.is_template_purchase IS TRUE OR (p.data ->> 'isTemplatePurchase'::text) = 'true'::text AS is_template_purchase,
        CASE
            WHEN (p.data ->> 'weeks'::text) ~ '^[0-9]+$'::text THEN (p.data ->> 'weeks'::text)::integer
            ELSE 4
        END AS weeks,
    COALESCE(d.day_count, 0) AS day_count,
    COALESCE(d.exercise_count, 0) AS exercise_count,
    COALESCE(d.day_names, '[]'::jsonb) AS day_names,
    COALESCE(d.day_weeks, '[]'::jsonb) AS day_weeks
   FROM sbx_plans p
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS day_count,
            COALESCE(sum(
                CASE
                    WHEN jsonb_typeof(day.value -> 'exercises'::text) = 'array'::text THEN jsonb_array_length(day.value -> 'exercises'::text)
                    WHEN jsonb_typeof(day.value -> 'ex'::text) = 'array'::text THEN jsonb_array_length(day.value -> 'ex'::text)
                    ELSE 0
                END), 0::bigint)::integer AS exercise_count,
            jsonb_agg(COALESCE(day.value ->> 'name'::text, day.value ->> 'n'::text, ''::text) ORDER BY day.ord) AS day_names,
            jsonb_agg(day.value -> 'onlyWeek' ORDER BY day.ord) AS day_weeks
           FROM jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(p.data -> 'days'::text) = 'array'::text THEN p.data -> 'days'::text
                    ELSE '[]'::jsonb
                END) WITH ORDINALITY day(value, ord)) d ON true;
