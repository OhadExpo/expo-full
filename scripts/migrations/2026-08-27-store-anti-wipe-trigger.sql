-- Anti-wipe guard for the shared `store` table.
--
-- 2026-08-27: the exercise library went from 1,326 rows to TWO because a client
-- saved before it had loaded. The client-side guard (src/storeWriteGuard.js)
-- fixes that path, but a client guard only protects clients running the new
-- bundle. This one lives in the database, so it holds for EVERY client, every
-- bundle, every script, forever — including the stale production bundle.
--
-- Rule: an UPDATE may not collapse a large JSON array store. Growing, editing,
-- and ordinary deletion all pass. Only a catastrophic loss is refused.

begin;

create or replace function public.store_block_catastrophic_shrink()
returns trigger
language plpgsql
as $$
declare
  old_len int;
  new_len int;
begin
  -- Only array values are protected; config blobs are replaced wholesale.
  if jsonb_typeof(to_jsonb(OLD.value)) <> 'array'
     or jsonb_typeof(to_jsonb(NEW.value)) <> 'array' then
    return NEW;
  end if;

  old_len := jsonb_array_length(to_jsonb(OLD.value));
  new_len := jsonb_array_length(to_jsonb(NEW.value));

  -- Small stores may legitimately be cleared; the rule needs a real baseline.
  if old_len < 25 then
    return NEW;
  end if;

  -- Keep at least half. A genuine edit adds or removes some rows; it does not
  -- delete most of the store.
  if new_len < ceil(old_len * 0.5) then
    raise exception
      'store."%" refused: this write would delete % of % rows. If it is intentional, do it in two steps or drop the trigger deliberately.',
      NEW.key, old_len - new_len, old_len
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists store_anti_wipe on public.store;
create trigger store_anti_wipe
  before update on public.store
  for each row
  execute function public.store_block_catastrophic_shrink();

commit;

-- VERIFY (should raise, and must NOT change the row):
--   update public.store set value = '[]'::jsonb where key = 'expo-exercises';
-- Then confirm the library is untouched:
--   select jsonb_array_length(to_jsonb(value)) from public.store where key = 'expo-exercises';
--
-- ROLLBACK:
--   drop trigger if exists store_anti_wipe on public.store;
--   drop function if exists public.store_block_catastrophic_shrink();
