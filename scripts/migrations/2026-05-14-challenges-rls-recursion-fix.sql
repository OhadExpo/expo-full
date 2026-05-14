-- Fix infinite-recursion in challenges / challenge_participants RLS.
--
-- Symptom: /coach/challenges shows
--   "CHALLENGES LOAD FAILED: INFINITE RECURSION DETECTED IN POLICY FOR
--    RELATION challenge_participants"
-- Postgres reports this when policies on two tables cross-reference each
-- other via EXISTS subqueries (challenges → participants → challenges).
--
-- Fix: drop all existing policies on both tables, then recreate flat
-- non-recursive ones:
--   * coach (ohadyproductions@gmail.com) — full access on both
--   * authenticated trainees — SELECT-only on both (leaderboard read is
--     not sensitive: trainee_id + progress only)
--   * authenticated trainees — UPDATE own participant row by trainee_id
--
-- No cross-table joins inside any policy → no cycle possible.

-- challenges: clean slate
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid = 'public.challenges'::regclass LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.challenges', p.polname);
  END LOOP;
END $$;

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY challenges_coach_all ON public.challenges
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((SELECT auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

CREATE POLICY challenges_authed_read ON public.challenges
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- challenge_participants: clean slate
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid = 'public.challenge_participants'::regclass LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.challenge_participants', p.polname);
  END LOOP;
END $$;

ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY chp_coach_all ON public.challenge_participants
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((SELECT auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

CREATE POLICY chp_authed_read ON public.challenge_participants
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY chp_athlete_update_own ON public.challenge_participants
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (trainee_id = current_client_id())
  WITH CHECK (trainee_id = current_client_id());
