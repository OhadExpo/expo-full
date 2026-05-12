-- 2026-05-12 — In-app task manager v1 for trainee-operators.
--
-- WHY: Operational work for the business (importing blocks, following up
-- with trainees, rehosting videos, chasing payments) currently lives in
-- WhatsApp messages that get lost. Need an auditable, persistent queue
-- inside the platform that can be assigned to a helper ("trainee-operator")
-- so Ohad can delegate without context-switching to another tool.
--
-- DESIGN NOTES:
-- - Single table, denormalized for fast list reads (no joins on render).
-- - assignee is free-text for v1; operator auth deferred to multi-tenant pass.
-- - related_kind + related_id + related_label point a task at a trainee /
--   plan / exercise without a foreign-key join — denormalized label so the
--   list view doesn't need to fetch the trainees blob.
-- - notes_log is append-only JSONB so the audit history (started / blocked /
--   handed off / done) lives with the task, not in a separate table.
-- - Distinct from trainee_next_actions (CRM v1): next-actions are Ohad's
--   per-trainee personal queue; coach_tasks is a delegation system.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.coach_tasks;

CREATE TABLE IF NOT EXISTS public.coach_tasks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  assignee        TEXT,                                      -- operator handle/name; null = unassigned
  status          TEXT NOT NULL DEFAULT 'todo',              -- todo | in_progress | done
  priority        TEXT NOT NULL DEFAULT 'normal',            -- normal | high
  due_date        DATE,
  related_kind    TEXT,                                      -- 'trainee' | 'plan' | 'exercise' | null
  related_id      TEXT,
  related_label   TEXT,                                      -- denormalized display ("Roey HaTzvi" / "Block #25")
  notes_log       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coach_tasks_status_priority_idx
  ON public.coach_tasks (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_tasks_assignee_idx
  ON public.coach_tasks (assignee, status);
CREATE INDEX IF NOT EXISTS coach_tasks_related_idx
  ON public.coach_tasks (related_kind, related_id);
CREATE INDEX IF NOT EXISTS coach_tasks_due_date_idx
  ON public.coach_tasks (due_date) WHERE due_date IS NOT NULL AND status <> 'done';

ALTER TABLE public.coach_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_tasks_trainer_all" ON public.coach_tasks;
CREATE POLICY "coach_tasks_trainer_all" ON public.coach_tasks
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_tasks TO authenticated;

COMMENT ON TABLE public.coach_tasks IS
  'In-app task manager for trainee-operator delegation. Distinct from trainee_next_actions (which is per-trainee personal queue).';
