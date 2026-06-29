-- ============================================================
-- ⛔ OBSOLETE — DO NOT RUN / DO NOT USE AS A ROLLBACK TARGET.
-- (flagged by the 2026-06-29 security audit)
-- These policies are STALE and weaker than what is live in production:
-- client_workouts/bw_logs use `auth.uid() IS NOT NULL` (ANY authenticated
-- trainee could read/write EVERY trainee's logs), and store/weekly_focus lack
-- the presence / exercise / portal-vis carve-outs prod now has. Re-applying
-- this (or the rollback note in 2026-05-07-form-videos) would DOWNGRADE prod
-- security. The authoritative live set is scripts/rls-baseline.json
-- (trainer_or_own = is_staff() OR client_id = current_client_id()). Historical only.
-- ============================================================
-- EXPO RLS Migration: Replace public_all with role-based policies
-- (historical — superseded by the live prod policies in rls-baseline.json)
-- ============================================================

-- Step 1: Drop all existing public_all policies
DROP POLICY IF EXISTS "public_all" ON store;
DROP POLICY IF EXISTS "public_all" ON client_workouts;
DROP POLICY IF EXISTS "public_all" ON bw_logs;
DROP POLICY IF EXISTS "public_all" ON weekly_focus;

-- Step 2: Create a helper function to check if user is the trainer
CREATE OR REPLACE FUNCTION is_trainer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT auth.jwt() ->> 'email') = 'ohadyproductions@gmail.com',
    false
  );
$$;

-- Step 3: STORE table — trainer only (full read/write)
-- This holds all trainer-side data: trainees, exercises, plans, workouts, payments
CREATE POLICY "trainer_all" ON store
  FOR ALL
  USING (is_trainer())
  WITH CHECK (is_trainer());

-- Step 3b: Presence-key carve-out (added 2026-05-02 via
-- scripts/migrations/2026-05-02-presence-rls.sql).
-- ClientPortal writes store[key='expo-presence'] every 30s as a heartbeat.
-- Non-trainer clients hit RLS without this; the carve-out is scoped to a
-- single key, every other store row stays trainer-only.
CREATE POLICY "auth_presence_rw" ON store
  FOR ALL
  USING (key = 'expo-presence' AND auth.uid() IS NOT NULL)
  WITH CHECK (key = 'expo-presence' AND auth.uid() IS NOT NULL);

-- Step 4: CLIENT_WORKOUTS — clients write their own, trainer reads all
-- Clients can insert and read their own workouts
CREATE POLICY "client_insert_own" ON client_workouts
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "client_read_own" ON client_workouts
  FOR SELECT
  USING (
    is_trainer()
    OR auth.uid() IS NOT NULL
  );

-- Trainer can do anything
CREATE POLICY "trainer_all_cw" ON client_workouts
  FOR ALL
  USING (is_trainer())
  WITH CHECK (is_trainer());

-- Step 5: BW_LOGS — same pattern as client_workouts
CREATE POLICY "client_insert_bw" ON bw_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "client_read_bw" ON bw_logs
  FOR SELECT
  USING (
    is_trainer()
    OR auth.uid() IS NOT NULL
  );

CREATE POLICY "trainer_all_bw" ON bw_logs
  FOR ALL
  USING (is_trainer())
  WITH CHECK (is_trainer());

-- Step 6: WEEKLY_FOCUS — trainer read/write, clients read only
CREATE POLICY "trainer_all_wf" ON weekly_focus
  FOR ALL
  USING (is_trainer())
  WITH CHECK (is_trainer());

CREATE POLICY "client_read_wf" ON weekly_focus
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Step 7: Storage bucket policy for form-videos
-- Run this only if you haven't already set up storage policies
-- (If the bucket doesn't exist yet, this will be skipped)
DO $$
BEGIN
  -- Allow authenticated users to upload to form-videos bucket
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'form-videos') THEN
    -- Drop existing policies if any
    DROP POLICY IF EXISTS "public_upload" ON storage.objects;
    DROP POLICY IF EXISTS "public_read" ON storage.objects;
    
    -- Authenticated users can upload
    CREATE POLICY "auth_upload_form_videos" ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'form-videos'
        AND auth.uid() IS NOT NULL
      );
    
    -- Trainer can read all, clients can read their own folder
    CREATE POLICY "auth_read_form_videos" ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'form-videos'
        AND (is_trainer() OR auth.uid() IS NOT NULL)
      );
    
    -- Trainer can delete
    CREATE POLICY "trainer_delete_form_videos" ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'form-videos'
        AND is_trainer()
      );
  END IF;
END $$;

-- ============================================================
-- VERIFICATION: Run these queries to confirm policies are set
-- ============================================================
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';
