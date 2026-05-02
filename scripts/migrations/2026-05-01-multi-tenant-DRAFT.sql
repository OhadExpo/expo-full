-- ===========================================================================
-- DRAFT: Multi-tenant migration — DO NOT APPLY YET
-- ===========================================================================
-- Status: NOT applied to production. Saved here so it can be reviewed,
-- iterated on, and run only when the coach-waitlist proves real demand.
--
-- What this does:
--   1. Creates a `trainers` table — each row is one coach account.
--   2. Creates a `trainee_trainer` lookup table — maps client_id (e.g.
--      'tr_amit') → trainer_id. Lets BEFORE-INSERT triggers on
--      client_workouts / bw_logs derive trainer_id when the writer is a
--      trainee (current_trainer_id() returns NULL for them).
--   3. Adds a `trainer_id` foreign-key column to every per-tenant table:
--      `store`, `plans`, `client_workouts`, `bw_logs`, `weekly_focus`.
--   4. Backfills `trainer_id` on every existing row to Ohad's trainer row
--      so the live product keeps working unchanged.
--   5. Backfills `trainee_trainer` from Ohad's `expo-trainees` store row
--      so trainee writes can resolve their trainer immediately.
--   6. Replaces `is_trainer()` (hardcoded email check) with
--      `current_trainer_id()` (looks up by JWT email).
--   7. Adds BEFORE-INSERT triggers on every per-tenant table that
--      auto-fill trainer_id. Without these, every JS write would have to
--      pass trainer_id explicitly and would fail NOT-NULL when forgotten.
--   8. Adds an AFTER INSERT/UPDATE trigger on `store` that keeps
--      `trainee_trainer` in sync when a trainer saves their trainees list.
--      No client refactor needed — the existing `expo-trainees` save path
--      auto-populates the lookup table.
--   9. Rewrites RLS policies: trainer reads/writes only their own rows.
--  10. Adds an `is_trainer()` compat shim that returns true when the
--      caller is ANY trainer — preserves existing client code that uses
--      it for "is this a trainer at all?" checks.
--
-- What this does NOT do:
--   - Refactor client code. Every `from('store').eq('key', X)` call still
--     reads/writes ALL trainers' rows in the JS layer until the client is
--     updated to also filter by `trainer_id`. That's a separate sprint.
--     (Mitigated post-migration by RLS — clients only see their own rows.)
--   - Stripe billing. A trainer row exists in the DB but there's no payment
--     gating yet — that's the next sprint after this migration applies.
--   - Sign-up flow. /signup/coach doesn't exist yet. Trainers are created
--     manually by inserting rows into the `trainers` table for now.
--
-- Pre-flight checklist before running this:
--   [ ] Backup production via `pg_dump` (Supabase dashboard → Backups).
--   [ ] Confirm no migrations have changed the schema since this was written.
--   [ ] Confirm production policies (some are authed_all not is_trainer() —
--       see memory `reference_production_rls.md`) — Step 9 must DROP every
--       actually-existing policy, not the ones in the canonical SQL doc.
--   [ ] Run `scripts/test-multi-tenant.mjs` on a Supabase branch first.
--   [ ] Test on a Supabase branch (Project Settings → Branches), not prod.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: trainers table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  parent_trainer_id uuid REFERENCES trainers(id) ON DELETE SET NULL,
  -- 'starter' / 'growth' / 'founding-partner' / 'free'
  tier text NOT NULL DEFAULT 'free',
  -- Active subscription state. Drives gating in client + Edge Functions.
  -- 'active' | 'past_due' | 'cancelled' | 'trial'
  subscription_status text NOT NULL DEFAULT 'active',
  -- Stripe / Lemon Squeezy customer + subscription IDs (nullable until paid).
  billing_customer_id text,
  billing_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainers_email ON trainers (email);
CREATE INDEX IF NOT EXISTS idx_trainers_parent ON trainers (parent_trainer_id);

-- Seed Ohad's trainer row so the backfill below has a target.
-- NOTE: regenerate this UUID with `gen_random_uuid()` before applying to
-- prod and update memory references.
INSERT INTO trainers (id, email, name, tier, subscription_status)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'ohadyproductions@gmail.com',
  'Ohad Yossifoff',
  'founding-partner',
  'active'
) ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Step 1b: trainee_trainer lookup table
-- ---------------------------------------------------------------------------
-- Maps each trainee row id (e.g. 'tr_amit', 'tr_ylc4i7edmnxqyj3j') to the
-- trainer that owns them. Used by BEFORE-INSERT triggers on
-- client_workouts and bw_logs — those rows can be written by either a
-- trainer (current_trainer_id() works) OR a trainee (returns NULL, need
-- to look up via this table).
--
-- Stays in sync automatically via the AFTER-INSERT/UPDATE trigger on
-- `store` (Step 6) — whenever the trainer's `expo-trainees` blob is
-- saved, every trainee in that array is upserted here.
CREATE TABLE IF NOT EXISTS trainee_trainer (
  client_id text PRIMARY KEY,
  trainer_id uuid NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trainee_trainer_trainer ON trainee_trainer (trainer_id);

-- ---------------------------------------------------------------------------
-- Step 2: trainer_id columns on per-tenant tables
-- ---------------------------------------------------------------------------
-- store is a kv table; the (trainer_id, key) pair becomes unique.
ALTER TABLE store     ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE;
ALTER TABLE plans     ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE;
ALTER TABLE bw_logs   ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE;
ALTER TABLE client_workouts ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE;
ALTER TABLE weekly_focus    ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES trainers(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Step 3: Backfill — assign every existing row to Ohad's trainer
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ohad_id uuid;
  trainees_blob jsonb;
  rec jsonb;
BEGIN
  SELECT id INTO ohad_id FROM trainers WHERE email = 'ohadyproductions@gmail.com';
  IF ohad_id IS NULL THEN
    RAISE EXCEPTION 'Ohad trainer row missing — seed it first';
  END IF;
  UPDATE store           SET trainer_id = ohad_id WHERE trainer_id IS NULL;
  UPDATE plans           SET trainer_id = ohad_id WHERE trainer_id IS NULL;
  UPDATE bw_logs         SET trainer_id = ohad_id WHERE trainer_id IS NULL;
  UPDATE client_workouts SET trainer_id = ohad_id WHERE trainer_id IS NULL;
  UPDATE weekly_focus    SET trainer_id = ohad_id WHERE trainer_id IS NULL;

  -- Populate trainee_trainer from Ohad's expo-trainees blob so trainee
  -- writes can resolve their trainer immediately after the migration.
  SELECT value INTO trainees_blob
    FROM store
    WHERE key = 'expo-trainees' AND trainer_id = ohad_id
    LIMIT 1;
  IF trainees_blob IS NOT NULL AND jsonb_typeof(trainees_blob) = 'array' THEN
    FOR rec IN SELECT * FROM jsonb_array_elements(trainees_blob) LOOP
      IF rec ? 'id' THEN
        INSERT INTO trainee_trainer (client_id, trainer_id)
        VALUES (rec->>'id', ohad_id)
        ON CONFLICT (client_id) DO UPDATE
          SET trainer_id = EXCLUDED.trainer_id, updated_at = now();
      END IF;
    END LOOP;
  END IF;
END $$;

-- After backfill, lock down the column.
ALTER TABLE store           ALTER COLUMN trainer_id SET NOT NULL;
ALTER TABLE plans           ALTER COLUMN trainer_id SET NOT NULL;
ALTER TABLE bw_logs         ALTER COLUMN trainer_id SET NOT NULL;
ALTER TABLE client_workouts ALTER COLUMN trainer_id SET NOT NULL;
ALTER TABLE weekly_focus    ALTER COLUMN trainer_id SET NOT NULL;

-- store: drop the old key-only unique, add (trainer_id, key) unique.
-- (Index name varies — check actual production name before running.)
ALTER TABLE store DROP CONSTRAINT IF EXISTS store_pkey;
ALTER TABLE store DROP CONSTRAINT IF EXISTS store_key_key;
ALTER TABLE store ADD CONSTRAINT store_trainer_key_unique UNIQUE (trainer_id, key);

CREATE INDEX IF NOT EXISTS idx_plans_trainer ON plans (trainer_id);
CREATE INDEX IF NOT EXISTS idx_bw_logs_trainer ON bw_logs (trainer_id);
CREATE INDEX IF NOT EXISTS idx_client_workouts_trainer ON client_workouts (trainer_id);
CREATE INDEX IF NOT EXISTS idx_weekly_focus_trainer ON weekly_focus (trainer_id);

-- ---------------------------------------------------------------------------
-- Step 4: New helper functions
-- ---------------------------------------------------------------------------
-- current_trainer_id: returns the trainer.id for the JWT email, or NULL.
CREATE OR REPLACE FUNCTION current_trainer_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM trainers WHERE email = (auth.jwt() ->> 'email') LIMIT 1;
$$;

-- is_trainer (compat): true when the caller is ANY trainer. Used by client
-- code that previously asked "is this Ohad?" — now means "is this a coach?".
CREATE OR REPLACE FUNCTION is_trainer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT current_trainer_id() IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- Step 4b: BEFORE-INSERT trigger functions — auto-fill trainer_id
-- ---------------------------------------------------------------------------
-- Without these triggers every JS write would have to pass trainer_id
-- explicitly. The existing app code doesn't, so the NOT NULL constraint
-- on trainer_id (Step 3) would break every write the moment this migration
-- applies. The triggers backstop that.
--
-- Two flavors:
--   - fill_trainer_id_session: trainer-only writes. Pulls from the JWT.
--     Used for `store`, `plans`, `weekly_focus`.
--   - fill_trainer_id_with_client: trainee-or-trainer writes. Tries the
--     JWT first; falls back to trainee_trainer lookup keyed by the row's
--     client_id. Used for `client_workouts`, `bw_logs`.

CREATE OR REPLACE FUNCTION fill_trainer_id_session()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trainer_id IS NULL THEN
    NEW.trainer_id := current_trainer_id();
  END IF;
  IF NEW.trainer_id IS NULL THEN
    RAISE EXCEPTION 'fill_trainer_id_session: caller is not a trainer (jwt email=%)', auth.jwt() ->> 'email';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fill_trainer_id_with_client()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trainer_id IS NULL THEN
    -- Trainer write path: JWT email maps to a trainer row.
    NEW.trainer_id := current_trainer_id();
  END IF;
  IF NEW.trainer_id IS NULL AND NEW.client_id IS NOT NULL THEN
    -- Trainee write path: derive from the lookup table.
    SELECT trainer_id INTO NEW.trainer_id
      FROM trainee_trainer
      WHERE client_id = NEW.client_id
      LIMIT 1;
  END IF;
  IF NEW.trainer_id IS NULL THEN
    RAISE EXCEPTION 'fill_trainer_id_with_client: cannot resolve trainer for client_id=% (trainee_trainer mapping missing?)', NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach.
DROP TRIGGER IF EXISTS tr_fill_trainer_id_store ON store;
CREATE TRIGGER tr_fill_trainer_id_store
  BEFORE INSERT ON store
  FOR EACH ROW EXECUTE FUNCTION fill_trainer_id_session();

DROP TRIGGER IF EXISTS tr_fill_trainer_id_plans ON plans;
CREATE TRIGGER tr_fill_trainer_id_plans
  BEFORE INSERT ON plans
  FOR EACH ROW EXECUTE FUNCTION fill_trainer_id_session();

DROP TRIGGER IF EXISTS tr_fill_trainer_id_wf ON weekly_focus;
CREATE TRIGGER tr_fill_trainer_id_wf
  BEFORE INSERT ON weekly_focus
  FOR EACH ROW EXECUTE FUNCTION fill_trainer_id_session();

DROP TRIGGER IF EXISTS tr_fill_trainer_id_cw ON client_workouts;
CREATE TRIGGER tr_fill_trainer_id_cw
  BEFORE INSERT ON client_workouts
  FOR EACH ROW EXECUTE FUNCTION fill_trainer_id_with_client();

DROP TRIGGER IF EXISTS tr_fill_trainer_id_bw ON bw_logs;
CREATE TRIGGER tr_fill_trainer_id_bw
  BEFORE INSERT ON bw_logs
  FOR EACH ROW EXECUTE FUNCTION fill_trainer_id_with_client();

-- ---------------------------------------------------------------------------
-- Step 4c: AFTER-trigger that keeps trainee_trainer in sync with `store`
-- ---------------------------------------------------------------------------
-- Whenever the trainer's `expo-trainees` blob changes (which is how trainees
-- are created/edited in the app today), upsert every trainee in the new
-- array into trainee_trainer. No client-side refactor needed.
--
-- We intentionally do NOT delete trainees that disappear from the array —
-- the lookup is harmless if stale, and races with optimistic updates would
-- nuke real mappings briefly during the next save.

CREATE OR REPLACE FUNCTION sync_trainee_trainer_from_store()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  rec jsonb;
BEGIN
  IF NEW.key <> 'expo-trainees' THEN
    RETURN NEW;
  END IF;
  IF NEW.value IS NULL OR jsonb_typeof(NEW.value) <> 'array' THEN
    RETURN NEW;
  END IF;
  FOR rec IN SELECT * FROM jsonb_array_elements(NEW.value) LOOP
    IF rec ? 'id' THEN
      INSERT INTO trainee_trainer (client_id, trainer_id)
      VALUES (rec->>'id', NEW.trainer_id)
      ON CONFLICT (client_id) DO UPDATE
        SET trainer_id = EXCLUDED.trainer_id, updated_at = now();
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_trainee_trainer ON store;
CREATE TRIGGER tr_sync_trainee_trainer
  AFTER INSERT OR UPDATE ON store
  FOR EACH ROW EXECUTE FUNCTION sync_trainee_trainer_from_store();

-- ---------------------------------------------------------------------------
-- Step 5: Rewrite RLS policies — scope by trainer_id
-- ---------------------------------------------------------------------------
-- Drops every policy name that has actually existed in production at any
-- point — both the canonical `supabase-rls-auth.sql` set and the looser
-- `authed_all` / `auth_presence_rw` / `trainer_or_own` set verified in
-- prod on 2026-05-02 (see memory `reference_production_rls.md`). Run
-- `SELECT policyname FROM pg_policies WHERE schemaname='public'` before
-- applying to be sure nothing new has slipped in.
DROP POLICY IF EXISTS "trainer_all"        ON store;
DROP POLICY IF EXISTS "authed_all"         ON store;
DROP POLICY IF EXISTS "auth_presence_rw"   ON store;
DROP POLICY IF EXISTS "trainer_all_cw"     ON client_workouts;
DROP POLICY IF EXISTS "trainer_or_own"     ON client_workouts;
DROP POLICY IF EXISTS "client_insert_own"  ON client_workouts;
DROP POLICY IF EXISTS "client_read_own"    ON client_workouts;
DROP POLICY IF EXISTS "trainer_all_bw"     ON bw_logs;
DROP POLICY IF EXISTS "trainer_or_own"     ON bw_logs;
DROP POLICY IF EXISTS "client_insert_bw"   ON bw_logs;
DROP POLICY IF EXISTS "client_read_bw"     ON bw_logs;
DROP POLICY IF EXISTS "trainer_all_wf"     ON weekly_focus;
DROP POLICY IF EXISTS "authed_all"         ON weekly_focus;
DROP POLICY IF EXISTS "client_read_wf"     ON weekly_focus;
DROP POLICY IF EXISTS "trainer_all_plans"  ON plans;
DROP POLICY IF EXISTS "client_read_own_plans" ON plans;

-- Trainer reads / writes their own rows only.
CREATE POLICY "trainer_own_store" ON store
  FOR ALL
  USING (trainer_id = current_trainer_id())
  WITH CHECK (trainer_id = current_trainer_id());

CREATE POLICY "trainer_own_plans" ON plans
  FOR ALL
  USING (trainer_id = current_trainer_id())
  WITH CHECK (trainer_id = current_trainer_id());

CREATE POLICY "trainer_own_cw" ON client_workouts
  FOR ALL
  USING (trainer_id = current_trainer_id())
  WITH CHECK (trainer_id = current_trainer_id());

CREATE POLICY "trainer_own_bw" ON bw_logs
  FOR ALL
  USING (trainer_id = current_trainer_id())
  WITH CHECK (trainer_id = current_trainer_id());

CREATE POLICY "trainer_own_wf" ON weekly_focus
  FOR ALL
  USING (trainer_id = current_trainer_id())
  WITH CHECK (trainer_id = current_trainer_id());

-- Clients still need to insert / read their OWN workouts + bw logs.
-- Scoped by `client_id = current_client_id()` so a trainee from coach A
-- cannot read coach B's rows even if `auth.uid()` is set. The
-- BEFORE-INSERT trigger will populate trainer_id from the lookup table,
-- so the trainer scoping happens automatically without the trainee having
-- to know their trainer_id.
CREATE POLICY "client_insert_own_cw" ON client_workouts
  FOR INSERT
  WITH CHECK (client_id = current_client_id());

CREATE POLICY "client_read_own_cw" ON client_workouts
  FOR SELECT
  USING (client_id = current_client_id());

CREATE POLICY "client_insert_own_bw" ON bw_logs
  FOR INSERT
  WITH CHECK (client_id = current_client_id());

CREATE POLICY "client_read_own_bw" ON bw_logs
  FOR SELECT
  USING (client_id = current_client_id());

-- Weekly focus has no client_id column — scope reads through the lookup
-- table: a trainee can read focus rows belonging to their own trainer.
CREATE POLICY "client_read_wf" ON weekly_focus
  FOR SELECT
  USING (
    trainer_id = (
      SELECT trainer_id FROM trainee_trainer
      WHERE client_id = current_client_id()
      LIMIT 1
    )
  );

-- ---------------------------------------------------------------------------
-- Step 6: trainers + trainee_trainer own RLS
-- ---------------------------------------------------------------------------
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainee_trainer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_read_self" ON trainers
  FOR SELECT
  USING (id = current_trainer_id());

-- All writes to trainers happen via Edge Functions (signup, billing webhook).

-- trainee_trainer: trainers see their own mappings; the AFTER-trigger on
-- store SECURITY DEFINER inserts on their behalf. Trainees themselves
-- never need to read this table (the BEFORE-INSERT trigger uses
-- SECURITY DEFINER to bypass RLS for the lookup).
CREATE POLICY "trainer_own_trainee_trainer" ON trainee_trainer
  FOR ALL
  USING (trainer_id = current_trainer_id())
  WITH CHECK (trainer_id = current_trainer_id());

-- The trigger functions need DEFINER privilege so trainees (who don't
-- own the row they're about to insert into client_workouts) can still
-- look up their trainer. Mark them definer-secured.
ALTER FUNCTION fill_trainer_id_session()        SECURITY DEFINER;
ALTER FUNCTION fill_trainer_id_with_client()    SECURITY DEFINER;
ALTER FUNCTION sync_trainee_trainer_from_store() SECURITY DEFINER;

COMMIT;

-- ===========================================================================
-- Rollback (run if something goes wrong AND no client writes have landed
-- on the new schema yet):
-- ===========================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS tr_fill_trainer_id_store ON store;
-- DROP TRIGGER IF EXISTS tr_fill_trainer_id_plans ON plans;
-- DROP TRIGGER IF EXISTS tr_fill_trainer_id_wf ON weekly_focus;
-- DROP TRIGGER IF EXISTS tr_fill_trainer_id_cw ON client_workouts;
-- DROP TRIGGER IF EXISTS tr_fill_trainer_id_bw ON bw_logs;
-- DROP TRIGGER IF EXISTS tr_sync_trainee_trainer ON store;
-- DROP FUNCTION IF EXISTS fill_trainer_id_session();
-- DROP FUNCTION IF EXISTS fill_trainer_id_with_client();
-- DROP FUNCTION IF EXISTS sync_trainee_trainer_from_store();
-- ALTER TABLE store DROP CONSTRAINT IF EXISTS store_trainer_key_unique;
-- ALTER TABLE store ADD CONSTRAINT store_pkey PRIMARY KEY (key);
-- ALTER TABLE store           DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE plans           DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE bw_logs         DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE client_workouts DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE weekly_focus    DROP COLUMN IF EXISTS trainer_id;
-- DROP FUNCTION IF EXISTS current_trainer_id();
-- -- Restore the original is_trainer() from supabase-rls-auth.sql
-- DROP TABLE IF EXISTS trainee_trainer;
-- DROP TABLE IF EXISTS trainers;
-- COMMIT;
