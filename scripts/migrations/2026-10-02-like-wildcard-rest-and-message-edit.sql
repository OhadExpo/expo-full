-- 2026-10-02  #510-A1 + #510-A5   (security round 1, 2.10)
--
-- A1. THE LIKE-WILDCARD PREFIX LEAK, EVERYWHERE IT IS STILL OPEN.
-- 2026-07-19-fix-plans-like-wildcard.sql explained it and fixed `plans` only:
--     trainee_id LIKE (current_client_id() || '__%')
-- `_` is a single-character WILDCARD in LIKE, so for athlete `tr_abc` the
-- pattern 'tr_abc__%' also matches 'tr_abc_xyz' - every row of any athlete
-- whose id extends his. Ids are semantic (tr_<name>), so this is live the day
-- two names share a prefix. The intended meaning is "my id, or one of my
-- couple's '__N' sub-ids", which is equality after stripping '__<digits>'.
-- Same expression the plans fix and the storage write policies use.
--
-- A5. coach_messages_athlete_mark_read lets an athlete UPDATE any column of any
-- message in his own thread (body_text, sender_role) - rewrite what the coach
-- said. No client code updates coach_messages at all. The policy stays (scoped
-- like the others) but the athlete's UPDATE privilege is narrowed to read_at.
--
-- Every ALTER is guarded: the repo's rls-baseline.json is from June and some
-- objects were created through MCP since, so a missing policy is reported, not
-- an error halfway through. Run in ONE transaction.
--
-- VERIFY: scripts/verify-like-wildcard.sql must return ZERO rows afterwards,
-- and node scripts/security-audit.mjs stays green.
-- ROLLBACK: the previous USING / WITH CHECK text is in each RAISE NOTICE.

BEGIN;

DO $$
DECLARE
  own_t  text := '(trainee_id = current_client_id() OR regexp_replace(trainee_id, ''__[0-9]+$'', '''') = current_client_id())';
  own_c  text := '(client_id = current_client_id() OR regexp_replace(client_id, ''__[0-9]+$'', '''') = current_client_id())';
  r record;
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('athlete_meals',        'meals_athlete_own',                 'trainee', true,  true,  NULL),
      ('bit_payment_requests', 'bit_req_athlete_read',              'trainee', true,  false, NULL),
      ('coach_messages',       'coach_messages_athlete_mark_read',  'trainee', true,  true,  NULL),
      ('coach_messages',       'coach_messages_athlete_read',       'trainee', true,  false, NULL),
      ('coach_messages',       'coach_messages_athlete_reply',      'trainee', false, true,  'sender_role = ''athlete'''),
      ('invoices',             'invoices_athlete_self',             'trainee', true,  false, NULL),
      ('subscriptions',        'subscriptions_athlete_self',        'trainee', true,  false, NULL),
      ('weekly_focus',         'wf_own_read',                       'client',  true,  false, NULL)
    ) AS t(tbl, pol, col, has_using, has_check, extra)
  LOOP
    SELECT * INTO r FROM pg_policies WHERE schemaname = 'public' AND tablename = spec.tbl AND policyname = spec.pol;
    IF NOT FOUND THEN
      RAISE NOTICE 'MISSING policy %.% - not changed', spec.tbl, spec.pol;
      CONTINUE;
    END IF;
    RAISE NOTICE 'BEFORE %.%  using=%  check=%', spec.tbl, spec.pol, r.qual, r.with_check;
    IF spec.has_using THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', spec.pol, spec.tbl,
        CASE WHEN spec.col = 'client' THEN own_c ELSE own_t END);
    END IF;
    IF spec.has_check THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s%s)', spec.pol, spec.tbl,
        CASE WHEN spec.extra IS NOT NULL THEN spec.extra || ' AND ' ELSE '' END,
        CASE WHEN spec.col = 'client' THEN own_c ELSE own_t END);
    END IF;
  END LOOP;

  -- the same leak on any OTHER policy this file does not know by name: report it
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
     WHERE (coalesce(qual, '') || coalesce(with_check, '')) ~ 'current_client_id\(\) \|\| ''__%'''
  LOOP
    RAISE NOTICE 'STILL WILDCARD (not in this file): %.%.%', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;

-- A5: an athlete marks a message read; he does not edit it. Column privilege
-- narrows UPDATE for every role that is not staff-by-RLS anyway (authenticated
-- is the only role athletes have). Staff edits go through their own policies,
-- which still need UPDATE on the columns they write - so grant those back to
-- the service paths explicitly if a staff UPDATE ever exists (none in src/ today).
REVOKE UPDATE ON public.coach_messages FROM authenticated;
GRANT UPDATE (read_at) ON public.coach_messages TO authenticated;

-- the anon rollback probe that #510-A3 had to send (PostgREST ignores
-- Prefer: tx=rollback here, so it committed). Marked, harmless, removed.
DELETE FROM public.chat_logs WHERE visitor_msg = '[security-audit rollback probe - not a visitor]';

COMMIT;
