-- 2026-10-02  #510-A4   (security round 1, 2.10)   APPLY TOGETHER WITH THE CLIENT CHANGE BELOW
--
-- 'plans-live' (the program editor -> open previews) and 'bhbc-live' (the club
-- zone's "something changed, re-read") are PUBLIC realtime channels: public
-- channels skip realtime.messages RLS, so anyone holding the publishable key
-- could listen (planId / traineeId - semantic ids, i.e. athlete names - and when
-- programs are edited), send 'plan-changed' to raise a false "remote edit -
-- reload" banner in the owner's editor, or flood 'change' on bhbc-live so every
-- open club zone re-reads five store keys per message.
--
-- Made private: realtime.messages gains a read and a write policy for exactly
-- these topics and the partner sandbox's renamed copies (src/supabase.js
-- SBX_CHANNELS -> 'sbx:<name>'). Separate policies, OR-ed with the existing
-- "expo: read/write live-sync channels" ones - the topic functions from
-- 2026-07-19 are NOT replaced, so whatever topics they gained since stay.
--
--   plans-live       staff (owner, Yuval)
--   bhbc-live        staff + club coaches (is_bhbc_coach)
--   sbx:plans-live   the partner seat
--   sbx:bhbc-live    the partner seat
--
-- CLIENT (same deploy, AFTER this is applied - a private channel with no policy
-- is a channel nobody can join): add `private: true` to the channel config in
--   src/PlansView.jsx          supabase.channel('plans-live', { config: { private: true, broadcast: { self: false } } })
--   src/CoachPreviewPortal.jsx supabase.channel('plans-live', { config: { private: true, broadcast: { self: false } } })
--   src/App.jsx                supabase.channel('bhbc-live', { config: { private: true } })
--   scripts/bhbc-sync-league.mjs supabase.channel('bhbc-live', { config: { private: true } })   (signed in as the owner)
--
-- VERIFY: an anon socket joining 'plans-live' with private:true is refused; the
-- owner's editor + preview still exchange plan-changed; a club coach's zone
-- still re-reads on 'change'. ROLLBACK: drop the two policies (and revert the
-- three client lines).

BEGIN;

DROP POLICY IF EXISTS "expo: read plans/bhbc live" ON realtime.messages;
DROP POLICY IF EXISTS "expo: write plans/bhbc live" ON realtime.messages;

CREATE POLICY "expo: read plans/bhbc live" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (realtime.topic() = 'plans-live' AND public.is_staff())
    OR (realtime.topic() = 'bhbc-live' AND (public.is_staff() OR public.is_bhbc_coach()))
    OR (realtime.topic() IN ('sbx:plans-live', 'sbx:bhbc-live') AND public.is_partner())
  );

CREATE POLICY "expo: write plans/bhbc live" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (realtime.topic() = 'plans-live' AND public.is_staff())
    OR (realtime.topic() = 'bhbc-live' AND (public.is_staff() OR public.is_bhbc_coach()))
    OR (realtime.topic() IN ('sbx:plans-live', 'sbx:bhbc-live') AND public.is_partner())
  );

COMMIT;
