-- 2026-05-13 — Auto-fill tasks.
--
-- WHY: Today, every task on the Dashboard/trainee card has to be written
-- by Ohad manually. That's reactive. The system already knows about
-- block timing, dormancy, overdue payments, and pending form-video
-- reviews — it should be able to drop those tasks into the queue itself.
--
-- Two columns on coach_notes:
--   auto_kind — which rule generated this task (open enum string)
--   auto_ref  — the entity it tracks (plan_id, trainee_id, etc.) so the
--               same condition never double-creates a task.
--
-- Unique partial index gives us cheap idempotency: the rule engine just
-- INSERTs blindly, ON CONFLICT does the deduping.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS auto_kind;
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS auto_ref;

BEGIN;

ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS auto_kind TEXT,
  ADD COLUMN IF NOT EXISTS auto_ref  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS coach_notes_auto_unique_idx
  ON public.coach_notes (auto_kind, auto_ref)
  WHERE auto_kind IS NOT NULL AND auto_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_notes_auto_kind_idx
  ON public.coach_notes (auto_kind)
  WHERE auto_kind IS NOT NULL;

COMMIT;
