-- 2026-05-02 — Add notes column to the public.leads table.
--
-- WHY: When a visitor converts via the marketing chat (CoachChat / Chat),
-- the chat backend now generates a 1-line summary of what they were asking
-- about and stores it on the lead row. Ohad sees "asked about powerlifting
-- transition + couples pricing" on /coach/waitlist instead of an anonymous
-- email. Manually-typed notes (from the WaitlistView textarea) keep flowing
-- through the `store` table — leads.notes is read-only, AI-generated context.
--
-- HOW TO APPLY:
--   1. Open Supabase Studio → SQL Editor → New Query.
--   2. Paste this whole file. Run.
--   3. The chat-capture endpoint will start populating leads.notes on the
--      next conversion. Existing rows stay NULL (correct — pre-AI signups
--      had no chat context).
--
-- ROLLBACK: ALTER TABLE public.leads DROP COLUMN IF EXISTS notes;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- The existing anon-insert policy on `leads` is permissive (any column the
-- caller supplies is accepted) — verified via `\d+ leads` in production.
-- If a future audit tightens the policy, this migration will need a
-- companion policy update to permit the notes column on INSERT.

COMMENT ON COLUMN public.leads.notes IS
  'AI-generated 1-line summary of the chat conversation that produced this lead. Populated by /api/capture on chat conversions; NULL for form-only signups.';
