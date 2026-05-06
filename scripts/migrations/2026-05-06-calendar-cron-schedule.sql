-- Cron schedule for the sync-calendar edge function. Runs every 10 min.
-- Already applied to prod via Supabase MCP — this file is for replay /
-- discovery only.
--
-- Prerequisites:
--   - pg_cron + pg_net extensions (this file enables them)
--   - sync-calendar edge function deployed at functions/v1/sync-calendar
--     (verify_jwt=false). Source: supabase/functions/sync-calendar/index.ts
--   - expo_calendar_events table (2026-05-06-calendar-events-cache.sql)
--   - store row key=expo-calendar-ics-url with the user's iCal URL
--     (set via the EXPO Dashboard "Connect Calendar" form — not via SQL)
--
-- Status check:
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'sync-calendar-every-10-min';
--   SELECT * FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-calendar-every-10-min')
--    ORDER BY start_time DESC LIMIT 5;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Drop any prior schedule with the same job-name so re-applying is safe.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-calendar-every-10-min';

SELECT cron.schedule(
  'sync-calendar-every-10-min',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://gtcbfglttoiyfsnfbhdy.supabase.co/functions/v1/sync-calendar',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $$
);
