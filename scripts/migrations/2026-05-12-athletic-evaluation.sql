-- 2026-05-12 — Athletic Evaluation (real one).
--
-- WHY: The Athletic Evaluation in ATH EVAL.xlsx is a coach-administered,
-- multi-section, longitudinal protocol — NOT the self-administered health
-- screen I shipped earlier under intake_submissions.form_type='assessment'.
-- This migration adds the right home: one row per (trainee, eval_date)
-- with a scores JSONB keyed by test_id. The xlsx has 3 "Best Score"
-- columns side-by-side per athlete — same schema supports unlimited
-- evaluations over time; the UI renders side-by-side comparison.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.trainee_evaluations;

CREATE TABLE IF NOT EXISTS public.trainee_evaluations (
  id              TEXT PRIMARY KEY,
  trainee_id      TEXT NOT NULL,
  eval_date       DATE NOT NULL,
  eval_time       TIME,
  age             INTEGER,
  height_cm       INTEGER,
  weight_kg       NUMERIC(5,2),
  -- scores keyed by test_id from EVAL_SCHEMA in src/evaluationSchema.js.
  -- Values can be a string (single value, accepts "R-4" / "SLDL: 4" /
  -- "3/4" patterns), a number, or an object for composite tests like
  -- {"height_cm":"35","ssc_ms":"180","rsi":"1.94"} for drop-jump, or
  -- {"L":"5","R":"4"} for tests with sides.
  scores          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ROM (passive range of motion) is its own block since it has its own
  -- per-joint/per-axis shape. Keyed "<joint>_<axis>" e.g. "neck_flexion".
  rom             JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trainee_evaluations_trainee_date_idx
  ON public.trainee_evaluations (trainee_id, eval_date DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_trainee_evaluations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trainee_evaluations_updated_at ON public.trainee_evaluations;
CREATE TRIGGER trainee_evaluations_updated_at
  BEFORE UPDATE ON public.trainee_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_trainee_evaluations();

ALTER TABLE public.trainee_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainee_evaluations_trainer_all" ON public.trainee_evaluations;
CREATE POLICY "trainee_evaluations_trainer_all" ON public.trainee_evaluations
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainee_evaluations TO authenticated;

COMMENT ON TABLE public.trainee_evaluations IS
  'Athletic evaluation — coach-administered, longitudinal. Mirrors the ATH EVAL.xlsx protocol (Stability/Isometric + Jumping/Landing + Accel-Decel + Movements + Passive ROM).';
