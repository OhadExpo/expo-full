-- 2026-06-06 — Close production RLS drift (found by audit pass 3).
--
-- INCIDENT: prod RLS had drifted from the committed hardened design.
--   * public.store      → policy `authed_all` USING(true) WITH CHECK(true) {authenticated}
--   * public.weekly_focus → same
-- Effect: ANY logged-in athlete (23 live clients) could read AND overwrite the
-- entire `store` table — expo-trainees (all athlete PII: names/ages/emails/
-- billing), expo-exercises, expo-workouts, expo-portal-vis — and all weekly
-- focus notes. Confirmed live via pg_policies on project gtcbfglttoiyfsnfbhdy.
--
-- FIX (applied via Supabase MCP as migration harden_rls_drift_2026_06_06):
--   store: staff (is_staff = Ohad+Yuval) full access; everyone else may only
--   upsert their own `expo-presence-<id>` heartbeat row (the ONLY store key
--   ClientPortal writes — verified). current_client_id()/current_trainee_id()
--   are SECURITY DEFINER so identity resolution is unaffected by the lock.
--   weekly_focus: staff write/modify; any authenticated user may read (athletes
--   view their focus) but cannot write.
--   push RPCs: revoked anon EXECUTE (the /api/push/send route always sends an
--   authenticated Bearer token, so anon was never needed — it just let anyone
--   with the bundled publishable key pull push keys / delete subscriptions).
--
-- VERIFIED: coach dashboard still loads all 21 athletes after the lock.
--
-- STILL OPEN (architectural — Ohad's call, NOT changed here): the public
-- storage buckets form-videos / meal-photos / coach-voice / coaching-contracts
-- have broad SELECT policies that allow LISTING the whole bucket. Object URLs
-- (getPublicUrl) do NOT need listing, so listing can be removed — but the
-- buckets are served as public URLs without auth headers, so fully privating
-- them requires a signed-URL refactor of the readers (blobQueue, ClientPortal,
-- DashboardView storage probe, CoachMessages, MealLogger). Tracked separately.

-- ---- store ----
drop policy if exists authed_all on public.store;
create policy store_staff_all on public.store
  for all to authenticated
  using (is_staff()) with check (is_staff());
create policy store_presence_rw on public.store
  for all to authenticated
  using (key like 'expo-presence-%')
  with check (key like 'expo-presence-%');

-- ---- weekly_focus ----
drop policy if exists authed_all on public.weekly_focus;
create policy wf_staff_all on public.weekly_focus
  for all to authenticated
  using (is_staff()) with check (is_staff());
create policy wf_authed_read on public.weekly_focus
  for select to authenticated
  using (true);

-- ---- push RPCs ----
revoke execute on function public.lookup_push_subscriptions(text) from anon;
revoke execute on function public.cleanup_push_subscription(bigint) from anon;
