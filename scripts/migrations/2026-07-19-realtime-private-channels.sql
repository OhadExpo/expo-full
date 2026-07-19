-- #35 — Realtime Authorization for the live-sync channels.
--
-- WHY: 'gym-set:<traineeId>' and 'gym-session' are currently PUBLIC broadcast
-- channels. Anyone holding the publishable (anon) key — which ships in the
-- browser bundle to every visitor — can subscribe to any athlete's topic and
-- read their live set data, or inject fake 'athlete-set' messages into a
-- coach's screen mid-session. The client already ignores messages not
-- addressed to it (ClientPortal `mine` guard), but that is a client-side
-- courtesy, not access control.
--
-- WHAT: policies on realtime.messages so a PRIVATE channel join is authorized
-- only for (a) staff, or (b) the athlete who owns that topic.
--
-- SAFETY / ORDERING (important):
--   Public channels DO NOT consult these policies at all, and realtime.messages
--   currently has RLS enabled with ZERO policies (verified 2026-07-19), i.e.
--   private channels deny by default today. Applying this migration alone
--   therefore changes NOTHING at runtime — it cannot break live-sync. Live-sync
--   only starts honoring it once the client passes `config: { private: true }`,
--   which ships separately and is verified on a preview URL first. That
--   ordering is deliberate: policy first, client second, so there is never a
--   window where channels are private but unauthorized (which would silently
--   kill live-sync for real athletes mid-workout).
--
-- Idempotent: safe to re-run.

-- Authorization predicate, shared by both policies so read and write can never
-- drift apart.
--
--   'gym-session'         → staff only (coach devices mirroring group state)
--   'gym-set:<traineeId>' → staff, or the athlete who owns that trainee id
--
-- Couples note: a couple is ONE trainee row whose members log under sub-ids
-- '<parentId>__0' / '<parentId>__1'. my_trainee() returns the PARENT row, so we
-- strip a trailing '__N' off the topic before comparing. That authorizes a
-- couple member for their parent topic and both sub-topics — which matches how
-- couples already train together and mirrors current behaviour. Stripping is
-- used instead of a LIKE prefix match specifically because trainee ids contain
-- '_' (a LIKE wildcard), so a prefix match would need escaping and could let
-- 'tr_abc' match 'tr_abcX__0'. Equality after stripping cannot.
--
-- my_trainee() returns jsonb (a single object) and is NULL for a caller with no
-- trainee row; '= NULL' yields NULL, which a policy treats as deny.
create or replace function public.expo_can_use_live_topic(topic text)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
-- coalesce: a caller with no trainee row compares '= NULL' → NULL. RLS treats
-- NULL as deny so behaviour is identical, but an explicit false keeps the
-- predicate safe to reuse outside a policy context.
as $$
  select coalesce(
    case
      when topic = 'gym-session' then public.is_staff()
      when topic like 'gym-set:%' then
        public.is_staff()
        or regexp_replace(substring(topic from 9), '__[0-9]+$', '')
           = (public.my_trainee() ->> 'id')
      else false
    end,
    false
  );
$$;

-- realtime.messages already has RLS enabled by Supabase; it denies by default,
-- which is why private channels need these explicit grants.

drop policy if exists "expo: read live-sync channels"  on realtime.messages;
drop policy if exists "expo: write live-sync channels" on realtime.messages;

create policy "expo: read live-sync channels"
on realtime.messages
for select
to authenticated
using ( public.expo_can_use_live_topic(realtime.topic()) );

create policy "expo: write live-sync channels"
on realtime.messages
for insert
to authenticated
with check ( public.expo_can_use_live_topic(realtime.topic()) );
