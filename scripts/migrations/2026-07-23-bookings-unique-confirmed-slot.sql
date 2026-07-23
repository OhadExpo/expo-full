-- 2026-07-23 — Prevent public-booking double-booking.
--
-- Bug (audit, agent a20a871): BookingPublic.submit inserts a confirmed booking
-- against a stale `occupied` snapshot with no re-check and no DB backstop, so
-- two visitors could both confirm the same (coach_email, start_at). Verified
-- live before applying: bookings had ONLY a non-unique idx_bookings_coach_start,
-- and zero existing duplicate confirmed (coach_email, start_at) rows — so the
-- unique index creation could not fail.
--
-- The invariant matches get_occupied_slots(), which returns every confirmed
-- booking as fully occupying its slot (strictly 1-on-1, no capacity/group
-- concept). Partial so canceled/completed rows never block re-booking a slot.
--
-- App-layer pair (shipped, commit b5222f5): BookingPublic.submit detects the
-- 23505 this index raises and shows "That time was just booked — pick another".
--
-- APPLIED to prod via Supabase MCP apply_migration on 2026-07-23.
-- Reversible: DROP INDEX IF EXISTS uq_bookings_confirmed_slot;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_confirmed_slot
ON public.bookings (coach_email, start_at)
WHERE status = 'confirmed';
