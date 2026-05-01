-- ============================================================
-- Presence-key RLS fix
-- Run in Supabase SQL Editor (Dashboard → SQL Editor) once.
-- ============================================================
--
-- Background:
--   `src/ClientPortal.jsx` runs a 30s heartbeat that upserts
--   store[key='expo-presence'] = { client_id: timestamp, ... }
--   so the coach's online-now panel knows who's actively in the app.
--
--   Existing `store` policy is `is_trainer()`-only (see
--   supabase-rls-auth.sql Step 3). That means non-trainer authenticated
--   users (real clients) are silently rejected with 42501. The
--   ClientPortal heartbeat catches the error in a `/* silent */` block,
--   so this has been failing invisibly — only Ohad himself (logged in as
--   his own trainee row, which counts as trainer for RLS) ever showed up
--   in the presence panel.
--
-- Fix:
--   Add a key-scoped policy that lets any authenticated user read & write
--   store[key='expo-presence'], leaving every other key trainer-only.
--   Trade-off: any signed-in client can overwrite the entire presence
--   object, including other clients' timestamps. Acceptable at our scale
--   (~20 clients, all trusted). When multi-tenant lands, replace this with
--   a dedicated presence table keyed per-client.
-- ============================================================

-- Idempotent: drop and recreate so re-running the file is safe.
DROP POLICY IF EXISTS "auth_presence_rw" ON store;

CREATE POLICY "auth_presence_rw" ON store
  FOR ALL
  USING (key = 'expo-presence' AND auth.uid() IS NOT NULL)
  WITH CHECK (key = 'expo-presence' AND auth.uid() IS NOT NULL);

-- Verification: should list both `trainer_all` and `auth_presence_rw`.
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename='store';
