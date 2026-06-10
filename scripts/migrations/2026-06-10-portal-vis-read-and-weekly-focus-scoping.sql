-- 2026-06-10 — applied to prod via Studio SQL editor (verified same day).
--
-- 1. portal-vis: the 2026-06-06 store lockdown left NO policy matching
--    key 'expo-portal-vis' for non-staff, so every athlete loaded an empty
--    portalVis map and the coach's per-program show/hide overrides were
--    silently ignored on the live portal. Read-only, single-key policy,
--    same shape as store_exercises_read.
--
-- 2. weekly_focus: wf_authed_read was SELECT true for all authenticated —
--    any athlete could read every trainee's focus notes. Scoped to own
--    rows via a new client_id column. Focus keys are now written as
--    `clientId|planName|dayName|eid|Wn` (see useSupaStore.focusClientId +
--    WorkoutReview setFocus); this also fixes the cross-athlete KEY
--    COLLISION where two athletes on identically-named plans shared (and
--    overwrote) the same focus row. Legacy rows (client_id IS NULL,
--    52/54 of which sat on plan names owned by >1 trainee and were
--    unattributable) become staff-only via the surviving wf_staff_all;
--    the coach UI keeps a legacy-key read fallback.
--
-- Verified with an RLS simulation as diego@diegoday.com:
--   current_client_id() = tr_diego, weekly_focus visible = 0,
--   store rows for key 'expo-portal-vis' visible = 1.

create policy store_portal_vis_read on public.store
  for select to authenticated
  using (key = 'expo-portal-vis');

alter table public.weekly_focus add column if not exists client_id text;

drop policy if exists wf_authed_read on public.weekly_focus;

-- Couples: rows log under sub-member ids (tr_x__0) while current_client_id()
-- resolves the parent row — same LIKE pattern as the coaching_contracts
-- athlete policies.
create policy wf_own_read on public.weekly_focus
  for select to authenticated
  using (client_id = current_client_id() or client_id like current_client_id() || '__%');
