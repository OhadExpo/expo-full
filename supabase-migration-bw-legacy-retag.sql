-- Optional: rename (Legacy) bw_logs rows to a real block name.
-- The main migration tagged all pre-existing rows with '(Legacy)' as a sentinel so
-- the unique constraint on (client_id, block_name, week) could be added without conflicts.
-- Use this file later to retag those rows once you know which block they belonged to.

-- Inspect legacy rows first:
-- select client_id, week, bw, date from bw_logs where block_name = '(Legacy)' order by client_id, date;

-- Retag all legacy rows for one client to a specific block name:
-- update bw_logs set block_name = 'Block #7' where client_id = 'CLIENT_ID_HERE' and block_name = '(Legacy)';

-- Retag a specific row by id:
-- update bw_logs set block_name = 'Block #13', plan_id = 'curated:Ron Yonker:Block #13' where id = 42;

-- If two retags would collide on the unique constraint, dedupe first by deleting the older one:
-- delete from bw_logs where id = <older_id>;
