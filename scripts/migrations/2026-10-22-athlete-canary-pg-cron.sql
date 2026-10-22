-- The 10-minute athlete canary (api/cron/athlete-health.js).
--
-- vercel.json runs it once a day (30 6 * * * — the Hobby plan's limit); the
-- 10-minute cadence was a pg_cron job created by hand in the dashboard and
-- never written down. On 22.10 it was not running: the canary's presence
-- heartbeat (written only after a successful sign-in) had not moved since
-- 21.10, and both "monitor is BLIND" pages came at the daily slot. This file
-- is the job, on record, so it can be re-created exactly.
--
-- Run in the Supabase SQL editor after replacing <HEALTH_SECRET> with the
-- value of HEALTH_SECRET in Vercel (Project -> Settings -> Environment
-- Variables). Do NOT commit the real secret. Re-running is safe: the old job
-- of the same name is removed first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'athlete-health-10min';

select cron.schedule(
  'athlete-health-10min',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://expo-app.co.il/api/cron/athlete-health',
    headers := jsonb_build_object('Authorization', 'Bearer <HEALTH_SECRET>'),
    timeout_milliseconds := 60000
  );
  $$
);

-- Check (should list the job, then show a 200 within ~10 minutes):
--   select jobid, jobname, schedule, active from cron.job where jobname = 'athlete-health-10min';
--   select status_code, created from net._http_response order by created desc limit 3;
