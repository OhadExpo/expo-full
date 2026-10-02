-- 2026-10-02  #510-R2 H2   (bulletproofing round 2)   APPLY FIRST of the 2.10 set
--
-- The app's store writes are compare-and-swap on store.updated_at (#510-B1,
-- src/useSupaStore.js storeWriteMerged): a write names the version it was built
-- on and is refused if the row moved. That only works if EVERY write moves the
-- version. Measured 2.10: there is no trigger - an upsert or update that does
-- not set updated_at leaves it unchanged (a probe row kept 2020-01-01 through
-- both), so a script or daemon write that omits it is invisible, and a phone's
-- queued edit lands on top of it. The daemon writers were patched to stamp it
-- (9c86030c); this makes it true for every writer, present and future.
--
-- now() is the transaction start - two updates in one transaction get the same
-- stamp, which is fine: CAS compares against what was READ, and a reader sees
-- either the before or the after of a committed transaction.
-- clock_timestamp() would also do; now() keeps a multi-row transaction coherent.
--
-- The sandbox copy (sbx_store) gets the same trigger: the partner seat's writes
-- go through the same CAS code.
--
-- VERIFY: node audit-out/_trigger-probe.mjs -> the two writes without
-- updated_at now report a NEW timestamp, not 2020-01-01.
-- ROLLBACK: DROP TRIGGER store_touch_updated_at ON public.store (and sbx_store).

BEGIN;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS store_touch_updated_at ON public.store;
CREATE TRIGGER store_touch_updated_at BEFORE INSERT OR UPDATE ON public.store
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
BEGIN
  IF to_regclass('public.sbx_store') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS store_touch_updated_at ON public.sbx_store';
    EXECUTE 'CREATE TRIGGER store_touch_updated_at BEFORE INSERT OR UPDATE ON public.sbx_store FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()';
  END IF;
END $$;

COMMIT;
