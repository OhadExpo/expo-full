-- Migration: add block context to bw_logs and enforce one-row-per-(client, block, week)
-- Run this in the Supabase SQL editor. Safe to run once; the ADD COLUMN / ADD CONSTRAINT
-- statements will error on repeat so re-runs are self-guarded.

-- 1. New columns. block_name is the display/uniqueness key; plan_id is an optional
--    stable reference to the plans table (null for curated/hardcoded plans).
alter table bw_logs add column block_name text;
alter table bw_logs add column plan_id text;

-- 2. Backfill: legacy rows get a sentinel so the unique constraint can treat them as
--    a single bucket per (client_id, week). Trainers can later re-tag via SQL if needed.
update bw_logs set block_name = '(Legacy)' where block_name is null;

-- 3. Dedupe existing rows: keep the newest row per (client_id, block_name, week).
delete from bw_logs where id in (
  select id from (
    select id, row_number() over (
      partition by client_id, block_name, week
      order by date desc, id desc
    ) as rn
    from bw_logs
  ) ranked where rn > 1
);

-- 4. Enforce the invariant going forward.
alter table bw_logs alter column block_name set not null;
alter table bw_logs add constraint bw_logs_client_block_week_uniq
  unique (client_id, block_name, week);
