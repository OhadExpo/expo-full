-- THE RLS BASELINE LIVES IN THE DATABASE (#963, 23.10, Ohad: "Why is this not automatically fixed?").
-- The drift watch (api/cron/athlete-health.js) compared the live policy/function manifest with a baseline BUNDLED into
-- the deploy, so even an intended migration paged him until someone regenerated the file AND shipped it. Now:
--   - the baseline is one row here; the cron reads it with its secret, the owner writes it (regen script / the daemon's
--     healer when a drift is exactly a committed migration);
--   - a drift is recorded when first seen, and the cron pages only after it has lasted 15 minutes - long enough for the
--     healer (every 5 minutes) to accept an explained one; an unexplained one still pages.
-- No secret appears in this file: the secret check is health_rls_manifest(p_secret) itself (null for a wrong secret).
create table if not exists public.health_rls_baseline (
  id               int primary key default 1 check (id = 1),
  hash             text not null,
  manifest         jsonb not null,
  updated_at       timestamptz not null default now(),
  updated_by       text,
  reason           text,
  drift_hash       text,
  drift_first_seen timestamptz
);
alter table public.health_rls_baseline enable row level security;   -- no policies: only the functions below touch it
grant select, insert, update, delete on public.health_rls_baseline to authenticated;
grant select, insert, update, delete on public.health_rls_baseline to service_role;

-- the cron: is the live hash the baseline? if not, since when (minutes) and what the baseline was
create or replace function public.health_rls_baseline_check(p_secret text, p_live_hash text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare b public.health_rls_baseline;
begin
  if public.health_rls_manifest(p_secret) is null then return null; end if;
  select * into b from public.health_rls_baseline where id = 1;
  if not found then return jsonb_build_object('missing', true); end if;
  if b.hash = p_live_hash then
    if b.drift_hash is not null then update public.health_rls_baseline set drift_hash = null, drift_first_seen = null where id = 1; end if;
    return jsonb_build_object('ok', true);
  end if;
  if b.drift_hash is distinct from p_live_hash then
    update public.health_rls_baseline set drift_hash = p_live_hash, drift_first_seen = now() where id = 1;
    b.drift_first_seen := now();
  end if;
  return jsonb_build_object('ok', false, 'hash', b.hash, 'manifest', b.manifest,
    'minutes', round(extract(epoch from (now() - b.drift_first_seen)) / 60.0, 1));
end $$;
revoke all on function public.health_rls_baseline_check(text, text) from public;
grant execute on function public.health_rls_baseline_check(text, text) to anon, authenticated;

-- the owner (regen script, the daemon's healer): read and write the baseline
create or replace function public.health_rls_baseline_owner()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.is_trainer() then (select jsonb_build_object('hash', hash, 'manifest', manifest, 'updated_at', updated_at, 'reason', reason, 'drift_hash', drift_hash, 'drift_first_seen', drift_first_seen) from public.health_rls_baseline where id = 1) end
$$;
revoke all on function public.health_rls_baseline_owner() from public, anon;
grant execute on function public.health_rls_baseline_owner() to authenticated;

create or replace function public.health_rls_baseline_set(p_hash text, p_manifest jsonb, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'owner only'; end if;
  insert into public.health_rls_baseline (id, hash, manifest, updated_at, updated_by, reason, drift_hash, drift_first_seen)
  values (1, p_hash, p_manifest, now(), coalesce(auth.jwt() ->> 'email', '?'), p_reason, null, null)
  on conflict (id) do update set hash = excluded.hash, manifest = excluded.manifest, updated_at = now(),
    updated_by = excluded.updated_by, reason = excluded.reason, drift_hash = null, drift_first_seen = null;
end $$;
revoke all on function public.health_rls_baseline_set(text, jsonb, text) from public, anon;
grant execute on function public.health_rls_baseline_set(text, jsonb, text) to authenticated;
