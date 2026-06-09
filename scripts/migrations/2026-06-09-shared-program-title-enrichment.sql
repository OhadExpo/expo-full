-- 2026-06-09 — get_shared_program enriches old-shape exercises with names.
--
-- The 174 old-shape plans store exercises as {eid, s, r, n} — no inline
-- title. /p/<token> is anonymous and cannot read the exercise library, so
-- shared old-shape plans rendered as empty/nameless. This version resolves
-- eid -> title (and exerciseId -> title for new-shape items missing a name)
-- inside the SECURITY DEFINER function. Titles only; no PII leaves the
-- server. Applied to prod via Studio SQL editor 2026-06-09 and verified:
-- old-shape ex {r:"8",s:4,eid:"ex_nsbfggpdmnxqyj3e"} returned with
-- name:"BB Back Squat"; new-shape plans pass through unchanged.

CREATE OR REPLACE FUNCTION public.get_shared_program(p_token text)
 RETURNS TABLE(id text, name text, phase text, weeks integer, data jsonb, share_view_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan_id text;
  v_expires timestamptz;
  v_lib jsonb;
BEGIN
  SELECT s.plan_id, s.expires_at INTO v_plan_id, v_expires
  FROM public.program_shares s
  WHERE s.token = p_token;
  IF v_plan_id IS NULL THEN RETURN; END IF;
  IF v_expires IS NOT NULL AND v_expires < now() THEN RETURN; END IF;
  UPDATE public.program_shares SET view_count = view_count + 1 WHERE token = p_token;

  -- eid -> title map from the exercise library blob, so anon share pages can
  -- render old-shape plans (whose exercises store only library ids). Titles
  -- only; no PII leaves the server.
  SELECT coalesce(jsonb_object_agg(e->>'id', e->>'title'), '{}'::jsonb) INTO v_lib
  FROM public.store st, jsonb_array_elements(st.value::jsonb) e
  WHERE st.key = 'expo-exercises';

  RETURN QUERY
    SELECT p.id::text, p.name, p.phase, (p.data->>'weeks')::int,
      CASE WHEN p.data ? 'days' THEN jsonb_set(p.data, '{days}', (
        SELECT coalesce(jsonb_agg(
          CASE
            WHEN d ? 'ex' THEN jsonb_set(d, '{ex}', (
              SELECT coalesce(jsonb_agg(
                CASE WHEN (x ? 'eid') AND NOT (x ? 'name')
                  THEN x || jsonb_build_object('name', coalesce(v_lib->>(x->>'eid'), 'Exercise'))
                  ELSE x END), '[]'::jsonb)
              FROM jsonb_array_elements(coalesce(d->'ex','[]'::jsonb)) x))
            WHEN d ? 'exercises' THEN jsonb_set(d, '{exercises}', (
              SELECT coalesce(jsonb_agg(
                CASE WHEN (x ? 'exerciseId') AND NOT (x ? 'name') AND NOT (x ? 'title')
                  THEN x || jsonb_build_object('name', coalesce(v_lib->>(x->>'exerciseId'), 'Exercise'))
                  ELSE x END), '[]'::jsonb)
              FROM jsonb_array_elements(coalesce(d->'exercises','[]'::jsonb)) x))
            ELSE d
          END), '[]'::jsonb)
        FROM jsonb_array_elements(p.data->'days') d
      )) ELSE p.data END,
      (SELECT view_count FROM public.program_shares WHERE token = p_token)
    FROM public.plans p
    WHERE p.id = v_plan_id;
END;
$function$;
