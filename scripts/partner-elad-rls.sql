-- ============================================================================
-- Partner "view-only" account for Elad Eluz (eladeluz24@gmail.com)  — #232
-- ----------------------------------------------------------------------------
-- SAFE by construction:
--   * ADDITIVE — only CREATEs new SELECT policies; never touches Ohad's existing
--     policies, so it cannot break the owner's access.
--   * SELECT-only + NO write policy for Elad  ->  the DATABASE enforces read-only
--     (his INSERT/UPDATE/DELETE are denied by RLS regardless of the client).
--   * Fully reversible — see the DROP block at the bottom.
--   * Every table is IF-EXISTS guarded — a name that doesn't exist is skipped, no error.
--
-- Table list is the AUTHORITATIVE set the coach app SELECTs from, enumerated from
-- the codebase (grep of .from('<table>') across src/, 2026-08-13). Corrected two
-- wrong names that were in the earlier draft: `payments`->`bit_payment_requests`,
-- `bw_log`->`bw_logs` (Elad would otherwise have been blind to billing + bodyweight).
--
-- Run in the Supabase SQL editor, as the owner. After running, verify:
--   select tablename, policyname from pg_policies where policyname = 'partner_elad_read' order by 1;
--   -- and confirm Ohad can still read/write everything (his policies are untouched).
-- ============================================================================

DO $$
DECLARE
  t text;
  partner_tables text[] := ARRAY[
    -- core training data
    'store', 'plans', 'plan_index', 'client_workouts', 'weekly_focus', 'bw_logs',
    -- CRM / coach ops
    'coach_notes', 'coach_note_comments', 'coach_note_events', 'coach_tasks',
    'trainee_activity', 'trainee_evaluations', 'trainee_next_actions',
    'coach_messages', 'chat_logs',
    -- billing / contracts
    'bit_payment_requests', 'coaching_contracts',
    -- intake / leads / booking
    'intake_submissions', 'intake_tokens', 'leads',
    'coach_booking_settings', 'availability_rules', 'bookings',
    -- challenges / meals / sharing / bugs
    'challenges', 'challenge_participants', 'athlete_meals',
    'program_shares', 'bug_reports'
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
-- ROLLBACK (fully removes Elad's read access — paste + Run to undo everything):
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['store','plans','plan_index','client_workouts','weekly_focus','bw_logs',
--       'coach_notes','coach_note_comments','coach_note_events','coach_tasks','trainee_activity',
--       'trainee_evaluations','trainee_next_actions','coach_messages','chat_logs','bit_payment_requests',
--       'coaching_contracts','intake_submissions','intake_tokens','leads','coach_booking_settings',
--       'availability_rules','bookings','challenges','challenge_participants','athlete_meals',
--       'program_shares','bug_reports'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS partner_elad_read ON public.%I;', t);
--     END LOOP; END $$;
-- ---------------------------------------------------------------------------

-- CLIENT side (src/auth.jsx + App.jsx) — ALREADY LIVE on prod (deploy 731b04d), inert until this SQL + Elad's login:
--   auth.jsx:  PARTNER_EMAILS=['eladeluz24@gmail.com']; isPartnerEmail; TRAINER_EMAILS includes PARTNER_EMAILS.
--   App.jsx:   isPartner -> isOwner=true (full owner UI) + "PARTNER PREVIEW" banner.
--              RLS denies his writes -> isTransient treats 42501 as permanent -> clean error toast, not queued.
-- Then create Elad's Supabase auth user (Dashboard -> Authentication -> Users -> Add user,
--   email eladeluz24@gmail.com, a password, Auto Confirm ON).
