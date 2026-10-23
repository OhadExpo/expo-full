-- #932 (23.10, found in the #930 audit). APPLIED via the Supabase MCP.
--
-- 1. The 10-minute health check (pg_cron 'athlete-health-canary') still sent the OLD health token after the secret was
--    rotated in Vercel (HEALTH_SECRET) and in the secret-gated health_* functions: every run came back 401 and only the
--    daily Vercel run checked anything. The job's token is now taken from the functions' own literal, never typed out:
--      select cron.alter_job(jobid, command := replace(command, 'Bearer <old>', 'Bearer ' ||
--        (select substring(prosrc from '''([A-Za-z0-9_-]{12,})''') from pg_proc where proname = 'health_storage_usage')))
--      from cron.job where jobname = 'athlete-health-canary';
--    And pg_net's default 5 s timeout cut every run off before the answer (the check takes ~20-40 s), so pg_net never
--    saw a result even with the right token: the job's call now carries timeout_milliseconds := 60000.
-- 2. The RLS baseline (scripts/rls-baseline.json) was last written 12.6. Regenerating it needs the manifest, and the
--    manifest needs the secret; the owner's seat can now read it without the secret ever leaving the database
--    (scripts/regen-rls-baseline.cjs falls back to it when no HEALTH_SECRET is at hand).
do $$
declare lit text := (select substring(prosrc from '''([A-Za-z0-9_-]{12,})''') from pg_proc where proname = 'health_storage_usage');
begin
  execute format($f$
    create or replace function public.health_rls_manifest_owner() returns jsonb
    language sql stable security definer set search_path = public as $b$
      select case when public.is_trainer() then public.health_rls_manifest(%L) end
    $b$;$f$, lit);
  revoke all on function public.health_rls_manifest_owner() from public, anon;
  grant execute on function public.health_rls_manifest_owner() to authenticated;
end $$;

-- 3. A dead-man check, so a locked-out 10-minute watch cannot go silent again: the DAILY Vercel run (step 10 in
--    api/cron/athlete-health.js) reads the last 3 hours of pg_net responses through this secret-gated function.
do $$
declare lit text := (select substring(prosrc from '''([A-Za-z0-9_-]{12,})''') from pg_proc where proname = 'health_storage_usage');
begin
  execute format($f$
    create or replace function public.health_cron_refusals(p_secret text) returns jsonb
    language sql stable security definer set search_path = public, net as $b$
      select case when p_secret is distinct from %L then null else jsonb_build_object(
        'refused', (select count(*) from net._http_response where created > now() - interval '3 hours' and status_code = 401),
        'ok', (select count(*) from net._http_response where created > now() - interval '3 hours' and status_code between 200 and 299),
        'last_ok', (select max(created) from net._http_response where status_code between 200 and 299)) end
    $b$;$f$, lit);
  revoke all on function public.health_cron_refusals(text) from public;
  grant execute on function public.health_cron_refusals(text) to anon, authenticated;
end $$;
