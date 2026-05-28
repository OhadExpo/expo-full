-- 2026-05-28 — coach_notes Phase 1: real task fields.
--
-- Adds first-class columns for the three pieces of metadata v8 currently
-- encodes inline in the body string:
--
--   assigned_to   — 'ohad' | 'yuval' | 'shared'   (parsed from `Owner:` prefix)
--   due_at        — TIMESTAMPTZ                   (parsed from `· due …` suffix)
--   priority      — 'low'|'normal'|'high'|'urgent' (parsed from `[URGENT]` prefix)
--
-- v8 is already shipping these fields via body parsing, so the migration
-- is non-blocking — it just promotes them from "parsed every render" to
-- "stored once, indexed, queryable". Once applied, v8 will read columns
-- first and fall back to parsing for rows that haven't been backfilled.
--
-- Yuval's MVP spec (2026-05-28) calls for these fields explicitly. See
-- docs/team-delegation-plan.md for context.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- BACKFILL (separate script, idempotent):
--   node scripts/backfill-coach-notes-task-fields.mjs
--
-- ROLLBACK:
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS assigned_to;
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS due_at;
--   ALTER TABLE coach_notes DROP COLUMN IF EXISTS priority;

BEGIN;

ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS due_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority    TEXT NOT NULL DEFAULT 'normal';

-- Loose check constraints — keep them permissive so legacy/imported rows
-- don't break inserts; v8 normalizes values before write.
ALTER TABLE public.coach_notes
  DROP CONSTRAINT IF EXISTS coach_notes_assigned_to_chk;
ALTER TABLE public.coach_notes
  ADD CONSTRAINT coach_notes_assigned_to_chk
  CHECK (assigned_to IS NULL OR assigned_to IN ('ohad', 'yuval', 'shared'));

ALTER TABLE public.coach_notes
  DROP CONSTRAINT IF EXISTS coach_notes_priority_chk;
ALTER TABLE public.coach_notes
  ADD CONSTRAINT coach_notes_priority_chk
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

CREATE INDEX IF NOT EXISTS coach_notes_assigned_to_idx
  ON public.coach_notes (assigned_to, status, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_notes_due_at_idx
  ON public.coach_notes (due_at) WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_notes_priority_open_idx
  ON public.coach_notes (priority, due_at) WHERE status = 'open';

COMMIT;
