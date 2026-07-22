-- The supabase_realtime publication was EMPTY (verified: 0 public tables),
-- so every postgres_changes subscription in the app silently failed
-- ("Unable to subscribe to changes… check Realtime is enabled") and degraded
-- to polling / focus-refetch. Applied to prod 2026-07-19.
--
--   coach_notes           → Tasks page live-sync between Ohad & Yuval
--   coach_messages        → coach⇄athlete messages + dashboard inbox card
--   bit_payment_requests  → BillingView live totals
--
-- The gym-set / gym-session / portal-sync BROADCAST channels use
-- realtime.messages (a separate, populated publication), so they were fine.
--
-- Realtime honours RLS per subscriber; all three tables have policies
-- (coach_notes = is_staff; coach_messages = per-trainee; bit_payment_requests =
-- owner-only), so a row change reaches only sessions already allowed to read
-- it. Default replica identity is enough — the app refetches on any change.
--
-- Verified (scripts/_verify-realtime-tables.cjs): all three subscribe
-- (SUBSCRIBED) where they previously returned CHANNEL_ERROR.
alter publication supabase_realtime add table public.coach_notes;
alter publication supabase_realtime add table public.coach_messages;
alter publication supabase_realtime add table public.bit_payment_requests;
