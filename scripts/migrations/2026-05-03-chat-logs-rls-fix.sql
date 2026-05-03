-- 2026-05-03 — chat_logs RLS fix.
--
-- WHY: The original 2026-05-02-chat-logs.sql had two bugs that made anon
-- INSERTs from /api/chat silently fail with 42501 RLS errors:
--   1. SELECT policy queried auth.users — anon can't read it, and Postgres
--      evaluates all policies during plan-time even for INSERT-only paths,
--      so this caused "permission denied for table users" on every anon
--      write attempt to chat_logs.
--   2. INSERT policy used implicit PUBLIC role — PostgREST doesn't always
--      honor it for anon. Need explicit `TO anon, authenticated`.
--
-- WHAT THIS DOES: Replaces both policies with the correct shape. Idempotent.
-- Already applied directly to prod via the Supabase MCP on 2026-05-03 — this
-- file exists so a fresh DB rebuild applying migrations in order ends up in
-- the same state. (The 2026-05-02 file was also patched in-place to match,
-- so applying just that file from scratch is also correct.)
--
-- HOW TO APPLY: paste in Supabase Studio → SQL Editor → Run. Re-runs are
-- safe (DROP IF EXISTS guards).
--
-- ROLLBACK: not needed — these are the correct policies.

DROP POLICY IF EXISTS "chat_logs_trainer_select" ON public.chat_logs;
CREATE POLICY "chat_logs_trainer_select" ON public.chat_logs
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com');

DROP POLICY IF EXISTS "chat_logs_anon_insert" ON public.chat_logs;
CREATE POLICY "chat_logs_anon_insert" ON public.chat_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
