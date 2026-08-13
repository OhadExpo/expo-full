-- ============================================================================
-- Partner "view-only" account for Elad Eluz (eladeluz24@gmail.com)  — #232
-- ----------------------------------------------------------------------------
-- SAFE by construction:
--   * ADDITIVE — only CREATEs new SELECT policies; never touches Ohad's existing
--     policies, so it cannot break the owner's access.
--   * SELECT-only + NO write policy for Elad  ->  the DATABASE enforces read-only
--     (his INSERT/UPDATE/DELETE are denied by RLS regardless of the client).
--   * Fully reversible — see the DROP block at the bottom.
--
-- BEFORE running: confirm the real table list. Run this first and cover every
-- coach-read table the query returns:
--   select tablename from pg_tables where schemaname='public' order by tablename;
--
-- Run in the Supabase SQL editor (or via MCP once available), as the owner.
-- After running, verify:
--   select tablename, policyname from pg_policies where policyname like 'partner_elad_%';
--   -- and confirm Ohad can still read/write everything (his policies are untouched).
-- ============================================================================

DO $$
DECLARE
  t text;
  partner_tables text[] := ARRAY[
    'store', 'plans', 'client_workouts',
    'coach_notes', 'coach_tasks',
    'trainee_activity', 'trainee_evaluations', 'trainee_next_actions',
    'chat_logs', 'bw_log', 'payments', 'weekly_focus'
    -- add any other table the coach app SELECTs from (see pg_tables query above)
  ];
BEGIN
  FOREACH t IN ARRAY partner_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS partner_elad_read ON public.%I;', t);
      EXECUTE format(
        'CREATE POLICY partner_elad_read ON public.%I FOR SELECT TO authenticated '
        || 'USING ((select auth.jwt() ->> ''email'') = ''eladeluz24@gmail.com'');', t);
      RAISE NOTICE 'partner_elad_read created on %', t;
    ELSE
      RAISE NOTICE 'skip (no such table): %', t;
    END IF;
  END LOOP;
END $$;

-- Storage (form-videos / meal-photos are already public-URL per the known backlog,
-- so Elad can view media without extra grants). If any bucket is private, add a
-- SELECT storage.objects policy for his email the same way.

-- ---------------------------------------------------------------------------
-- ROLLBACK (fully removes Elad's read access):
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['store','plans','client_workouts','coach_notes','coach_tasks',
--       'trainee_activity','trainee_evaluations','trainee_next_actions','chat_logs','bw_log',
--       'payments','weekly_focus'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS partner_elad_read ON public.%I;', t);
--     END LOOP; END $$;
-- ---------------------------------------------------------------------------

-- CLIENT side (src/auth.jsx + App.jsx), pair with this SQL:
--   auth.jsx:  export const PARTNER_EMAILS = ['eladeluz24@gmail.com'];
--              export const isPartnerEmail = (e) => !!e && PARTNER_EMAILS.includes(e.toLowerCase());
--              export const TRAINER_EMAILS = [...OWNER_EMAILS, ...STAFF_EMAILS, ...PARTNER_EMAILS];
--   App.jsx:   const isPartner = isPartnerEmail(email);
--              const isOwner = OWNER_EMAILS.includes(email) || isPartner;  // partner gets full owner UI
--              + a persistent "PARTNER PREVIEW — viewing Ohad's real data; changes aren't saved" banner
--              (RLS denies his writes -> isTransient treats 42501 as permanent -> clean error toast, not queued).
--   Then set Elad's Supabase auth password so he can log in.
