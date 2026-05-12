-- 2026-05-12 — Task/Note completion + outcome-linking.
--
-- WHY: A task tagged to a trainee (e.g. "build Block #18 for Diego") needs
-- to know when its OUTCOME is shipped. Manual mark-done is fine. But the
-- killer feature is: when you click "→ NEW PROGRAM" on a Diego-tagged task,
-- the plan editor opens pre-bound, and on save the task is auto-marked
-- done with linked_plan_id set. The chain is visible in the trainee's
-- activity feed: "PLAN · STARTED Block #18 · from task: build Block #18".
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS status;
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS completed_at;
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS linked_plan_id;

BEGIN;

ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'done'
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_plan_id TEXT;

CREATE INDEX IF NOT EXISTS coach_notes_status_idx
  ON public.coach_notes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_notes_linked_plan_idx
  ON public.coach_notes (linked_plan_id) WHERE linked_plan_id IS NOT NULL;

COMMIT;
