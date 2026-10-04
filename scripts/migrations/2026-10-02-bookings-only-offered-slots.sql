-- APPLIED 3.10 via Supabase MCP (as below). A16 in security-audit proves it from the anon seat both ways.
-- 2026-10-02  #510-A2   (security round 1, 2.10)
--
-- THE PUBLIC BOOKING PAGE IS AN ANONYMOUS INSERT, BY DESIGN - but the policy
-- only checked contact_name/coach_email non-empty, start_at in the future and
-- source='public'. Status, duration, the slot grid and the horizon were not
-- checked and nothing bounded the rate, so anyone with the publishable key
-- could loop POST /rest/v1/bookings with status 'confirmed' for every future
-- slot: real visitors then hit uq_bookings_confirmed_slot and cannot book, and
-- the coach's list fills with junk.
--
-- Now a public booking must be a slot the page itself would offer
-- (BookingPublic.jsx generateSlots, mirrored here in Asia/Jerusalem civil time):
--   * on a weekday the coach has an availability rule for, inside that rule,
--     on its grid (rule start + k * (duration + buffer)), whole minutes
--   * exactly the coach's duration, at least lead_time_hours ahead, < 90 days out
--   * status 'confirmed', source 'public', bounded text fields
--   * a flood cap that a visitor cannot dodge and an attacker cannot turn into
--     a lock-out (review 2.10: the first draft counted by created_at - which the
--     client can send - and capped per COACH, so ten junk rows an hour locked
--     every real visitor out): a BEFORE INSERT trigger stamps created_at = now()
--     and the caller's IP from the API's request headers; the policy allows 5
--     public bookings per IP per hour and 60 per coach per hour
-- The page needs no change: every slot it offers passes.
--
-- PRE-CHECK below refuses to run if a column this relies on is missing.
-- VERIFY: book a real offered slot from /book/<slug> as anon (must succeed and
-- then be cancelled with its token), and run node scripts/security-audit.mjs -
-- A16 is rewritten to probe an off-grid slot once this is applied.
-- ROLLBACK: the previous WITH CHECK is printed by the RAISE NOTICE; then
-- DROP TRIGGER bookings_public_stamp ON public.bookings (the source_ip column
-- can stay - it is only ever written by the trigger).
-- NOT COVERED (known): a slot overlapping a Google-busy / occupied window is not
-- re-checked server-side (uq_bookings_confirmed_slot stops exact doubles only).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='created_at')
  OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='coach_booking_settings' AND column_name='lead_time_hours')
  OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='availability_rules' AND column_name='day_of_week') THEN
    RAISE EXCEPTION 'schema differs from what this migration assumes - stop and read the live tables';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.booking_slot_is_offered(p_coach text, p_start timestamptz, p_duration int)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT duration_min, greatest(0, coalesce(buffer_min, 0)) AS buffer_min, greatest(0, coalesce(lead_time_hours, 0)) AS lead_h
      FROM coach_booking_settings WHERE coach_email = p_coach LIMIT 1
  ), t AS (
    SELECT (p_start AT TIME ZONE 'Asia/Jerusalem') AS ts
  )
  SELECT
    EXISTS (
      SELECT 1
        FROM s, t, availability_rules r
       WHERE r.coach_email = p_coach
         AND s.duration_min > 0
         AND p_duration = s.duration_min
         AND p_start >= now() + make_interval(hours => s.lead_h)
         AND p_start < now() + interval '90 days'
         AND extract(second FROM t.ts) = 0
         AND r.day_of_week = extract(dow FROM t.ts)::int
         AND (extract(hour FROM t.ts) * 60 + extract(minute FROM t.ts))::int
             >= (extract(hour FROM r.start_time::time) * 60 + extract(minute FROM r.start_time::time))::int
         AND (extract(hour FROM t.ts) * 60 + extract(minute FROM t.ts))::int + p_duration
             <= (extract(hour FROM r.end_time::time) * 60 + extract(minute FROM r.end_time::time))::int
         AND ((extract(hour FROM t.ts) * 60 + extract(minute FROM t.ts))::int
              - (extract(hour FROM r.start_time::time) * 60 + extract(minute FROM r.start_time::time))::int)
             % (s.duration_min + s.buffer_min) = 0
    );
$$;
REVOKE ALL ON FUNCTION public.booking_slot_is_offered(text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_slot_is_offered(text, timestamptz, int) TO anon, authenticated;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS source_ip text;

-- what a public booking says about WHEN and FROM WHERE is the server's, not the
-- client's (RLS WITH CHECK is evaluated after BEFORE triggers, so the policy
-- sees these values)
CREATE OR REPLACE FUNCTION public.bookings_public_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE h json;
BEGIN
  IF NEW.source = 'public' THEN
    NEW.created_at := now();
    BEGIN h := current_setting('request.headers', true)::json; EXCEPTION WHEN others THEN h := NULL; END;
    NEW.source_ip := left(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), 'unknown'), 64);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_public_stamp ON public.bookings;
CREATE TRIGGER bookings_public_stamp BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_public_stamp();

CREATE OR REPLACE FUNCTION public.booking_rate_ok(p_coach text, p_ip text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT count(*) FROM bookings b WHERE b.source = 'public' AND b.source_ip = coalesce(p_ip, 'unknown') AND b.created_at > now() - interval '1 hour') < 5
     AND (SELECT count(*) FROM bookings b WHERE b.source = 'public' AND b.coach_email = p_coach AND b.created_at > now() - interval '1 hour') < 60;
$$;
REVOKE ALL ON FUNCTION public.booking_rate_ok(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_rate_ok(text, text) TO anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='bookings_public_insert';
  IF NOT FOUND THEN RAISE EXCEPTION 'bookings_public_insert not found - read the live policies first'; END IF;
  RAISE NOTICE 'BEFORE bookings_public_insert check=%', r.with_check;
END $$;

ALTER POLICY bookings_public_insert ON public.bookings WITH CHECK (
  source = 'public'
  AND status = 'confirmed'
  AND trainee_id IS NULL   -- kept from the live policy (3.10): a public booking never attaches to an athlete
  AND length(coalesce(contact_name, '')) BETWEEN 1 AND 120
  AND length(coalesce(contact_email, '')) <= 200
  AND length(coalesce(contact_phone, '')) <= 40
  AND length(coalesce(notes, '')) <= 1000
  AND public.booking_slot_is_offered(coach_email, start_at, duration_min)
  AND public.booking_rate_ok(coach_email, source_ip)
);

COMMIT;
