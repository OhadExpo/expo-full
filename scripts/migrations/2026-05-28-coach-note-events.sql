-- 2026-05-28 — coach_note_events — append-only change history per task.
--
-- Yuval's MVP spec (2026-05-28) calls for "מי פתח · מי שינה אחראי · מי
-- סימן כבוצע · מתי השתנה הסטטוס · מה נכתב בדרך". The point isn't
-- forensic auditing — it's letting the next person opening the task
-- understand HOW it got to its current state without scrolling the
-- whole comment thread.
--
-- WHY: same-task amnesia is the main collab failure mode. "I thought
-- you were doing this" / "why is it open again?" / "who reopened it?"
-- An append-only event log replays the journey in one glance.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.coach_note_events;

CREATE TABLE IF NOT EXISTS public.coach_note_events (
  id          BIGSERIAL PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES public.coach_notes(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,                       -- 'ohad' | 'yuval'
  kind        TEXT NOT NULL,                       -- 'created' | 'status_changed' | 'assigned' | 'due_changed' | 'body_edited' | 'priority_changed' | 'linked' | 'reopened'
  from_value  TEXT,
  to_value    TEXT,
  detail      TEXT,                                -- optional extra context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_note_events_note_idx
  ON public.coach_note_events (note_id, created_at);

ALTER TABLE public.coach_note_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_note_events_trainer_all" ON public.coach_note_events;
CREATE POLICY "coach_note_events_trainer_all" ON public.coach_note_events
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT ON public.coach_note_events TO authenticated;
GRANT USAGE ON SEQUENCE public.coach_note_events_id_seq TO authenticated;

COMMENT ON TABLE public.coach_note_events IS
  'Append-only audit log per task — who did what, when. Surfaces as a timeline in the v8 task expanded view so the next person opening a task can replay the journey at a glance.';
