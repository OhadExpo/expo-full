-- 2026-05-28 — coach_note_comments — threaded comments inside a task.
--
-- Yuval's MVP spec (2026-05-28) calls comments the primary collab
-- surface inside a task:
--
--   Ohad: "צריך לבדוק איתה אם הכאב מופיע בסקוואט."
--   Yuval: "דיברתי איתה, קבענו אבחון מחדש ליום ראשון."
--
-- WHY: WhatsApp threads scroll away. Comments live on the task row,
-- which means the next person opening it sees the full conversation
-- in chronological order. Mentions (@ohad / @yuval) make it explicit
-- whose answer is being requested.
--
-- HOW TO APPLY:
--   Supabase Studio → SQL Editor → paste → Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.coach_note_comments;

CREATE TABLE IF NOT EXISTS public.coach_note_comments (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES public.coach_notes(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,                           -- 'ohad' | 'yuval'
  body        TEXT NOT NULL,
  mentions    TEXT[],                                   -- ['ohad','yuval'] extracted from @-tokens
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_note_comments
  DROP CONSTRAINT IF EXISTS coach_note_comments_author_chk;
ALTER TABLE public.coach_note_comments
  ADD CONSTRAINT coach_note_comments_author_chk
  CHECK (author IN ('ohad', 'yuval'));

CREATE INDEX IF NOT EXISTS coach_note_comments_note_idx
  ON public.coach_note_comments (note_id, created_at);

ALTER TABLE public.coach_note_comments ENABLE ROW LEVEL SECURITY;

-- Trainer-all for now. Yuval gets his own auth identity when he joins
-- the team (per docs/team-delegation-plan.md); the policy will widen
-- to (email IN ('ohad...','yuval...')) at that point.
DROP POLICY IF EXISTS "coach_note_comments_trainer_all" ON public.coach_note_comments;
CREATE POLICY "coach_note_comments_trainer_all" ON public.coach_note_comments
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_note_comments TO authenticated;

COMMENT ON TABLE public.coach_note_comments IS
  'Threaded comments inside a coach_notes task. Lets Ohad + Yuval collab on a task without WhatsApp drift; supports @-mentions via the mentions[] column.';
