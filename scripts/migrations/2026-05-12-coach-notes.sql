-- 2026-05-12 — Global Notes feature, surfaced as a Dashboard widget and
-- inline on the trainee CRM strip / intake submission detail / workout
-- review card.
--
-- WHY: Coach needs a single place to drop a note about anything (a
-- trainee observation, an intake follow-up, a comment about a specific
-- session) — see them all collected on the Dashboard, and have each one
-- linked back to its context. Different from coach_tasks (which is
-- delegated work) and from trainee_activity (per-trainee event log) —
-- a Note is a cross-cutting observation surface.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.coach_notes;

CREATE TABLE IF NOT EXISTS public.coach_notes (
  id            TEXT PRIMARY KEY,
  body          TEXT NOT NULL,
  target_kind   TEXT,                                    -- 'trainee' | 'intake' | 'review' | 'general' | null
  target_id     TEXT,
  target_label  TEXT,                                    -- denormalized display ("Roey HaTzvi" / "Block #18 · Day A" / "Intake from Yuval")
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_notes_target_idx
  ON public.coach_notes (target_kind, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_notes_pinned_idx
  ON public.coach_notes (pinned, created_at DESC) WHERE pinned;
CREATE INDEX IF NOT EXISTS coach_notes_recent_idx
  ON public.coach_notes (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_coach_notes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS coach_notes_updated_at ON public.coach_notes;
CREATE TRIGGER coach_notes_updated_at
  BEFORE UPDATE ON public.coach_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_coach_notes();

ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_notes_trainer_all" ON public.coach_notes;
CREATE POLICY "coach_notes_trainer_all" ON public.coach_notes
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_notes TO authenticated;

COMMENT ON TABLE public.coach_notes IS
  'Global notes — coach drops observations from any surface (trainee card / intake detail / review card); Dashboard widget surfaces recent + pinned with click-to-route.';
