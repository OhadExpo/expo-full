-- SECURITY FIX — push-subscription RPCs were unguarded. Applied to prod
-- 2026-07-19. Found by the Supabase security advisor, then CONFIRMED
-- exploitable from a real athlete seat before fixing.
--
-- THE HOLE
--   Both functions were SECURITY DEFINER with EXECUTE granted to every
--   `authenticated` user and no internal ownership check. From
--   diego@diegoday.com (is_staff() = false):
--     lookup_push_subscriptions('ohadyproductions@gmail.com')
--       -> 2 rows incl. endpoint / p256dh / auth
--     cleanup_push_subscription(<id>)  -> EXECUTE permitted
--   `sub_id` is a bigint sequence, so any athlete could iterate ids 1..N and
--   silently delete every push subscription in the system — the coach simply
--   stops receiving notifications, with nothing to indicate why.
--
--   api/push/send.js does enforce a 403 rule, but it calls these RPCs with the
--   CALLER's token (deliberately, to avoid shipping a service-role key), so the
--   RPCs are reachable directly and that endpoint guard is bypassed.
--
-- THE FIX
--   DELETE  -> caller's own subscription, or staff.
--   LOOKUP  -> staff, own email, or the OWNER's (required: an athlete's
--              workout-complete / message push resolves the coach's
--              subscriptions using the athlete's own token).
--
-- RESIDUAL, accepted and flagged: an athlete can still READ the owner's
-- endpoint/keys. Sending push requires the VAPID PRIVATE key, which is
-- server-only, so this is disclosure, not forgery. Closing it fully means
-- giving api/push/send.js a service-role key or shared secret — an env-var
-- decision for Ohad.
--
-- Verified after applying (scripts/_verify-push-rpc-guards.cjs, 5/5):
--   athlete -> other athlete   : 0 rows (blocked)
--   athlete -> coach lookup    : 2/2 rows (feature intact)
--   athlete deletes coach sub  : refused, row survived
--   staff lookup               : still works

create or replace function public.cleanup_push_subscription(sub_id bigint)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.push_subscriptions
  where id = sub_id
    and (
      public.is_staff()
      or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.lookup_push_subscriptions(target_email text)
returns table(id bigint, endpoint text, p256dh text, auth text)
language sql
security definer
set search_path to 'public'
as $$
  select s.id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.user_email = lower(target_email)
    and (
      public.is_staff()
      or lower(target_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(target_email) = 'ohadyproductions@gmail.com'
    );
$$;

revoke execute on function public.cleanup_push_subscription(bigint) from anon;
revoke execute on function public.lookup_push_subscriptions(text) from anon;
