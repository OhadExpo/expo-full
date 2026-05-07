-- 2026-05-07 — chat_logs INSERT policy: tighten WITH CHECK.
-- Audit Item #2.
--
-- WHY: The 2026-05-03 fix landed `WITH CHECK (true)` so anon visitors could
-- insert their chat turns. That policy now lets anyone with the project URL
-- (which is hardcoded in api/smart-import.js:32-33 and discoverable via the
-- public client anyway) flood the table at PostgREST line speed.
--
-- WHAT THIS DOES: Replaces the open-write policy with one that enforces
-- per-row sanity checks — visitor_msg / assistant_msg length, session_id
-- format, optional ip_hash format. Real /api/chat traffic always satisfies
-- these (the handler caps message content at 1500 chars, sessionId at 64).
-- A bot trying to spam the table either has to mimic legitimate shape
-- (bounded payload size, costing them more) or gets rejected per-row.
--
-- This is a defense-in-depth fix; pair with /api/chat's existing in-memory
-- per-IP rate limit and the 2026-05-07 smart-import rate limit. When real
-- KV-based rate limiting lands, this stays as the schema-level guard.
--
-- HOW TO APPLY: paste in Supabase Studio → SQL Editor → Run. Re-runs safe.
-- HOW TO ROLLBACK: re-apply 2026-05-03-chat-logs-rls-fix.sql to restore the
-- open-write policy. (The data inserted under the new policy is a strict
-- subset of what the old one allowed; no migration needed.)

DROP POLICY IF EXISTS "chat_logs_anon_insert" ON public.chat_logs;
CREATE POLICY "chat_logs_anon_insert" ON public.chat_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Visitor message: bounded by /api/chat's 1500-char cap with headroom.
    (visitor_msg IS NULL OR length(visitor_msg) <= 4000)
    -- Assistant reply: 800-token cap on Sonnet 4.6 ~ ~3000-4000 chars max.
    AND (assistant_msg IS NULL OR length(assistant_msg) <= 8000)
    -- session_id: handler caps to 64 chars and uses random ids; reject
    -- empty / too short / too long to make spam-shape less convenient.
    AND (
      session_id IS NULL
      OR (char_length(session_id) BETWEEN 8 AND 64
          AND session_id ~ '^[A-Za-z0-9_.:-]+$')
    )
    -- Site tag: only the two real values we ever pass.
    AND (site IS NULL OR site IN ('expo-app', 'expo-il'))
    -- Error column: bounded so an attacker can't pad with junk.
    AND (error IS NULL OR length(error) <= 2000)
    -- user_agent + ip_hash: bounded length, no shape constraint.
    AND (user_agent IS NULL OR length(user_agent) <= 1000)
    AND (ip_hash IS NULL OR length(ip_hash) <= 128)
  );

-- Verify after applying:
--   SELECT polname, qual, with_check FROM pg_policies
--   WHERE tablename = 'chat_logs' AND polname = 'chat_logs_anon_insert';
-- A 100KB visitor_msg insert should now 400, where it used to 200.
