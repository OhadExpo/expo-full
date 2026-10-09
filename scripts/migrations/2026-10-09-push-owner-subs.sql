-- #490 residual (9.10). lookup_push_subscriptions lets ANY signed-in user read the
-- owner's push endpoint + keys, because an athlete's workout-complete / message
-- push resolves the coach's devices with the athlete's own token (2026-07-19,
-- "accepted and flagged": disclosure, not forgery - sending needs the VAPID
-- private key).
--
-- Step 1 (this file, additive): push_owner_subs(p_secret) - the owner's devices,
-- only for a caller holding the server secret. api/push/send.js uses it for every
-- push TO the owner. The secret is COPIED from health_owner_subs at apply time,
-- so it never appears in this public repo; ROTATE BOTH FUNCTIONS TOGETHER
-- (scripts/set-health-secret.cjs).
-- Step 2 (only after the api change is live and an athlete->coach push is seen
-- arriving): drop the owner clause from lookup_push_subscriptions.
do $$
declare d text; sec text;
begin
  select pg_get_functiondef('public.health_owner_subs(text)'::regprocedure) into d;
  sec := substring(d from 'p_secret = ''([^'']+)''');
  if sec is null or length(sec) < 20 then raise exception 'health secret not found in health_owner_subs'; end if;
  execute format($f$
    create or replace function public.push_owner_subs(p_secret text)
    returns table(id bigint, endpoint text, p256dh text, auth text)
    language sql security definer set search_path to 'public'
    as $b$
      select s.id, s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
      where p_secret = %L and lower(s.user_email) = 'ohadyproductions@gmail.com'
    $b$ $f$, sec);
end $$;
revoke all on function public.push_owner_subs(text) from public;
grant execute on function public.push_owner_subs(text) to anon, authenticated;
