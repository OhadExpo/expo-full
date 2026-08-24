-- client_workouts.plan_id — 2026-08-25
--
-- WHY. A couple is ONE trainee row whose two members hold SEPARATE plans, and
-- the athlete portal deliberately merges both members' plans into one view.
-- Every workout row, though, is saved under the shared parent client_id with
-- only plan_name + day_name + week. When the two members hold identically-named
-- plans with identical day names — exactly what the Neta+Tom repair produced —
-- one member's log marks the other's day done, advances the other's derived
-- week, and ghosts one member's loads into the other's set rows
-- (platform audit 2026-08-22, finding #31, verified real).
--
-- plan_name cannot tell those two plans apart. plan_id can.
--
-- SAFETY. Purely additive and nullable: nothing reads it as required, every
-- consumer falls back to matching on plan_name when it is null, and the app
-- already writes rows WITHOUT it (it retries without the column if this
-- migration has not run). No RLS change, no data change, no backfill.
--
-- REVERSIBLE:  ALTER TABLE public.client_workouts DROP COLUMN plan_id;

ALTER TABLE public.client_workouts
  ADD COLUMN IF NOT EXISTS plan_id text;

COMMENT ON COLUMN public.client_workouts.plan_id IS
  'Plan this workout belongs to. Disambiguates two couple members'' identically-named plans, which plan_name cannot (audit #31). Nullable: rows written before 2026-08-25 have none and still match by name.';

-- Optional, cheap, and only useful once rows carry it:
CREATE INDEX IF NOT EXISTS client_workouts_plan_id_idx
  ON public.client_workouts (plan_id)
  WHERE plan_id IS NOT NULL;
