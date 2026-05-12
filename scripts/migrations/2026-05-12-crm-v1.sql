-- 2026-05-12 — CRM v1: per-trainee activity feed + next-action queue.
--
-- WHY: TraineeDetail today shows status/payments/workouts but no operational
-- CRM surface. Coaches juggle 20+ active trainees and need: (1) a unified
-- activity timeline that pulls workouts/payments/notes into one feed, and
-- (2) a small per-trainee todo queue so "send Block #8 tomorrow" / "check
-- shoulder Friday" don't get lost. Lifecycle stages (lead/trial/active/
-- churned) reuse the existing trainees.status field — no schema change
-- there. "at-risk" is derived in JS from cadence (expected sessions/week vs
-- actual gap), not a manual stage.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste this whole file → Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.trainee_next_actions;
--   DROP TABLE IF EXISTS public.trainee_activity;

-- ─────────────────────────────────────────────────────────────────
-- trainee_activity: append-only timeline of manual coach interactions.
-- Auto-events (workouts, payments, plan-assignments) are derived in JS
-- from existing tables — NOT mirrored here, to avoid double-bookkeeping.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trainee_activity (
  id            TEXT PRIMARY KEY,
  trainee_id    TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind          TEXT NOT NULL,        -- whatsapp | call | meeting | note | email | instagram | sms
  summary       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trainee_activity_trainee_occurred_idx
  ON public.trainee_activity (trainee_id, occurred_at DESC);

ALTER TABLE public.trainee_activity ENABLE ROW LEVEL SECURITY;

-- Same anon-gotcha rules as chat_logs: explicit `TO authenticated`, never
-- reference auth.users. Trainer-only read/write. Trainees never touch this.
DROP POLICY IF EXISTS "trainee_activity_trainer_all" ON public.trainee_activity;
CREATE POLICY "trainee_activity_trainer_all" ON public.trainee_activity
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainee_activity TO authenticated;

COMMENT ON TABLE public.trainee_activity IS
  'CRM v1: manual coach interaction log per trainee. Auto-events from workouts/payments/plans are derived in JS, not mirrored here.';

-- ─────────────────────────────────────────────────────────────────
-- trainee_next_actions: per-trainee todo queue. status flips done → row
-- stays (gives the coach a record), but list view filters to pending.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trainee_next_actions (
  id            TEXT PRIMARY KEY,
  trainee_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | done
  order_idx     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS trainee_next_actions_trainee_status_idx
  ON public.trainee_next_actions (trainee_id, status, order_idx);

ALTER TABLE public.trainee_next_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainee_next_actions_trainer_all" ON public.trainee_next_actions;
CREATE POLICY "trainee_next_actions_trainer_all" ON public.trainee_next_actions
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainee_next_actions TO authenticated;

COMMENT ON TABLE public.trainee_next_actions IS
  'CRM v1: per-trainee todo queue. Done items kept as a record; UI filters to pending.';
