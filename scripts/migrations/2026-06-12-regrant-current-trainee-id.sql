-- 2026-06-12 — re-grant EXECUTE on current_trainee_id() (drift incident #2).
--
-- INCIDENT: every ATHLETE form-video upload failed with
--   "permission denied for function current_trainee_id"
-- (reported live by a client mid-workout; trainer uploads kept working
-- because is_trainer() short-circuits the policy OR before the broken call).
--
-- ROOT CAUSE: prod ACL on public.current_trainee_id() had drifted to
--   {postgres=X/postgres,service_role=X/postgres}
-- i.e. the GRANT EXECUTE ... TO anon, authenticated from
-- 2026-05-07-form-videos-path-scoped.sql was gone (most likely a later
-- DROP/recreate of the function without re-granting). The storage policy
-- auth_read_form_videos calls current_trainee_id(); athlete uploads are
-- upserts (INSERT ... ON CONFLICT DO UPDATE), which evaluate that SELECT
-- policy — so the function error killed the whole statement.
--
-- The 10-minute athlete canary (api/cron/athlete-health.js) did NOT catch
-- this because it never wrote to storage — fixed in the same commit by
-- adding an upsert probe to the canary.
--
-- APPLIED to prod 2026-06-12 via Supabase Studio SQL editor. Verified:
--   * has_function_privilege('authenticated', ..., 'execute') = true
--   * simulated athlete JWT (omersadehbi@gmail.com) resolves tr_omer
--   * live upsert into form-videos succeeds

grant execute on function public.current_trainee_id() to anon, authenticated;

-- Verify:
--   select has_function_privilege('authenticated','public.current_trainee_id()','execute'),
--          has_function_privilege('anon','public.current_trainee_id()','execute');
