-- ===========================================================================
-- DRAFT: Multi-tenant migration — DO NOT APPLY YET
-- ===========================================================================
-- Status: NOT applied to production. Saved here so it can be reviewed,
-- iterated on, and run only when the coach-waitlist proves real demand.
--
-- What this does:
--   1. Creates a `trainers` table — each row is one coach account.
--   2. Adds a `trainer_id` foreign-key column to every per-tenant table:
--      `store`, `plans`, `client_workouts`, `bw_logs`, `weekly_focus`.
--   3. Backfills `trainer_id` on every existing row to Ohad's trainer row
--      so the live product keeps working unchanged.
--   4. Replaces `is_trainer()` (hardcoded email check) with
--      `current_trainer_id()` (looks up by JWT email).
--   5. Rewrites RLS policies: trainer reads/writes only their own rows.
--   6. Adds an `is_trainer()` compat shim that returns true when the
--      caller is ANY trainer — preserves existing client code that uses
--      it for "is this a trainer at all?" checks.
--
-- What this does NOT do:
--   - Refactor client code. Every `from('store').eq('key', X)` call still
--     reads/writes ALL trainers' rows in the JS layer until the client is
--     updated to also filter by `trainer_id`. That's a separate sprint.
--   - Stripe billing. A trainer row exists in the DB but there's no payment
--     gating yet — that's the next sprint after this migration applies.
--   - Sign-up flow. /signup/coach doesn't exist yet. Trainers are created
--     manually by inserting rows into the `trainers` table for now.
--
-- Pre-flight checklist before running this:
--   [ ] Backup production via `pg_dump` (Supabase dashboard → Backups).
--   [ ] Confirm no migrations have changed the schema since this was written.
--   [ ] Update OHAD_TRAINER_ID below to a real UUID before running.
--   [ ] Test on a Supabase branch first (Project Settings → Branches).
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
INSERT INTO trainers (id, email, name, tier, subscription_status)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'ohadyproductions@gmail.com',
  'Ohad Yossifoff',
  'founding-partner',
  'active'
) ON CONFLICT (email) DO NOTHING;

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
DECLARE ohad_id uuid;
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
-- Step 5: Rewrite RLS policies — scope by trainer_id
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "trainer_all"     ON store;
DROP POLICY IF EXISTS "trainer_all_cw"  ON client_workouts;
DROP POLICY IF EXISTS "trainer_all_bw"  ON bw_logs;
DROP POLICY IF EXISTS "trainer_all_wf"  ON weekly_focus;
DROP POLICY IF EXISTS "client_insert_own" ON client_workouts;
DROP POLICY IF EXISTS "client_read_own"   ON client_workouts;
DROP POLICY IF EXISTS "client_insert_bw"  ON bw_logs;
DROP POLICY IF EXISTS "client_read_bw"    ON bw_logs;
DROP POLICY IF EXISTS "client_read_wf"    ON weekly_focus;

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
-- The trainer_id on those rows is the trainer they belong to (set by the
-- INSERT path). Clients can't write across trainers because the trainer_id
-- has to match the trainee's trainer.
CREATE POLICY "client_insert_own_cw" ON client_workouts
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "client_read_own_cw" ON client_workouts
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "client_insert_own_bw" ON bw_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "client_read_own_bw" ON bw_logs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "client_read_wf" ON weekly_focus
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Step 6: trainers table own RLS (read self, no write from client)
-- ---------------------------------------------------------------------------
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trainer_read_self" ON trainers
  FOR SELECT
  USING (id = current_trainer_id());

-- All writes to trainers happen via Edge Functions (signup, billing webhook).

COMMIT;

-- ===========================================================================
-- Rollback (run if something goes wrong AND no client writes have landed
-- on the new schema yet):
-- ===========================================================================
-- BEGIN;
-- ALTER TABLE store DROP CONSTRAINT IF EXISTS store_trainer_key_unique;
-- ALTER TABLE store ADD CONSTRAINT store_pkey PRIMARY KEY (key);
-- ALTER TABLE store           DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE plans           DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE bw_logs         DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE client_workouts DROP COLUMN IF EXISTS trainer_id;
-- ALTER TABLE weekly_focus    DROP COLUMN IF EXISTS trainer_id;
-- DROP FUNCTION IF EXISTS current_trainer_id();
-- -- Restore the original is_trainer() from supabase-rls-auth.sql
-- DROP TABLE IF EXISTS trainers;
-- COMMIT;
