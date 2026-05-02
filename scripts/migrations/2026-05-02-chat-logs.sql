-- 2026-05-02 — Chat logging + intent tagging.
--
-- WHY: Two reasons to log every chat turn:
--   1. Audit what visitors are actually asking — tune the system prompt
--      based on real misses, not guesses.
--   2. Power intent tagging on lead conversion (interests + pain points
--      extracted from the conversation, surfaced on /coach/waitlist).
--
-- HOW TO APPLY:
--   1. Supabase Studio → SQL Editor → New Query.
--   2. Paste this whole file. Run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.chat_logs;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS interests;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS pain_points;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS programs_mentioned;

-- ─────────────────────────────────────────────────────────────────
-- chat_logs: append-only audit log of every visitor turn + reply.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  site TEXT NOT NULL CHECK (site IN ('expo-app', 'expo-il')),
  session_id TEXT,
  visitor_msg TEXT NOT NULL,
  assistant_msg TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS chat_logs_created_idx ON public.chat_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS chat_logs_site_idx ON public.chat_logs (site, created_at DESC);

-- RLS: visitors must NOT read this table; coaches (is_trainer) can. Inserts
-- happen exclusively server-side via the service role / function path —
-- but we keep RLS on with no anon policy so a misconfigured client still
-- can't peek.
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_logs_trainer_select" ON public.chat_logs;
CREATE POLICY "chat_logs_trainer_select" ON public.chat_logs
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND u.email = 'ohadyproductions@gmail.com'
    )
  );

-- The /api/chat function uses the publishable anon key for inserts. Allow
-- anon INSERT but no SELECT/UPDATE/DELETE — append-only from the visitor
-- side. (If we later move to service-role inserts we can drop this policy.)
DROP POLICY IF EXISTS "chat_logs_anon_insert" ON public.chat_logs;
CREATE POLICY "chat_logs_anon_insert" ON public.chat_logs
  FOR INSERT WITH CHECK (true);

GRANT SELECT ON public.chat_logs TO authenticated;
GRANT INSERT ON public.chat_logs TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.chat_logs_id_seq TO anon;

COMMENT ON TABLE public.chat_logs IS
  'Audit log of every marketing-chat turn. Append-only from anon; readable only by trainer accounts.';

-- ─────────────────────────────────────────────────────────────────
-- leads: structured intent fields populated on chat conversion.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS interests TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS pain_points TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS programs_mentioned TEXT[] NULL;

COMMENT ON COLUMN public.leads.interests IS
  'AI-extracted interests from chat conversation (e.g. {"powerlifting","couples training"}). Used for filtering on /coach/waitlist.';
COMMENT ON COLUMN public.leads.pain_points IS
  'AI-extracted pain points / constraints (e.g. {"bad knees","limited time"}).';
COMMENT ON COLUMN public.leads.programs_mentioned IS
  'Specific program slugs the visitor asked about (e.g. {"powerbuild-12","couples-12"}).';
