-- TEAM VERSION, PHASE B1 - club tenancy (#904). PROPOSED, NOT APPLIED. Apply only with Ohad, after the runbook
-- (docs/team-version-phase-b.md): snapshot first, apply, run the checks at the bottom, then dual-read.
--
-- Shape: one row per club; members by email + role (replaces the JS + SQL email lists); the zone's eight store keys
-- become club-scoped rows (club_store) so the zone's code moves from useSupaStore(key) to a club-keyed store with the
-- same JSON shapes; medical data leaves the shared store for its own table, readable only through a function that
-- logs every read.
--
-- Additive only: nothing here touches public.store or any existing table, so Herzliya keeps running on the old keys
-- until the switch.

-- ── clubs ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.clubs (
  id          text primary key,                         -- 'bhbc', 'netanya', ...
  slug        text not null unique,                     -- the URL: /club/<slug>
  name        text not null,
  name_he     text,
  sport       text not null check (sport in ('basketball', 'soccer')),
  config      jsonb not null default '{}'::jsonb,       -- palette, crest url, venue, league source, calendar id
  plan_tier   text not null default 'pilot',
  created_at  timestamptz not null default now()
);

-- ── members: who works in which club, as what ─────────────────────────────────────────────────────────────────────
create table if not exists public.club_members (
  club_id      text not null references public.clubs(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('owner', 'head', 'coach', 'pt', 'analyst', 'viewer')),
  invited_by   text,
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (club_id, email)
);
create index if not exists club_members_email_idx on public.club_members (lower(email));

-- the clubs the signed-in user belongs to (optionally: with one of these roles)
create or replace function public.my_clubs(p_roles text[] default null)
returns setof text
language sql stable security definer
set search_path = public
as $$
  select m.club_id from public.club_members m
  where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and m.accepted_at is not null
    and (p_roles is null or m.role = any (p_roles))
$$;
revoke all on function public.my_clubs(text[]) from public, anon;
grant execute on function public.my_clubs(text[]) to authenticated;

-- ── the club's data: the zone's store keys, scoped by club ─────────────────────────────────────────────────────────
create table if not exists public.club_store (
  club_id     text not null references public.clubs(id) on delete cascade,
  key         text not null check (key in ('roster', 'loads', 'fixtures', 'league', 'gamewarmup', 'activity')),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (club_id, key)
);

-- ── medical: its own table, no direct reads ────────────────────────────────────────────────────────────────────────
create table if not exists public.club_medical (
  club_id     text primary key references public.clubs(id) on delete cascade,
  value       jsonb not null default '{}'::jsonb,       -- { athleteId: { injuries: [...] } } - the zone's shape
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create table if not exists public.club_medical_reads (
  id         bigint generated always as identity primary key,
  club_id    text not null,
  email      text not null,
  read_at    timestamptz not null default now()
);

-- read = logged
create or replace function public.club_medical_get(p_club text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v jsonb;
begin
  if p_club not in (select public.my_clubs(array['owner', 'head', 'pt', 'coach'])) then
    raise exception 'not a member of this club';
  end if;
  insert into public.club_medical_reads (club_id, email) values (p_club, coalesce(auth.jwt() ->> 'email', '?'));
  select value into v from public.club_medical where club_id = p_club;
  -- a coach sees status + dates only; the physio's notes and pain stay with owner / head / pt
  if p_club not in (select public.my_clubs(array['owner', 'head', 'pt'])) then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('injuries',
             (select coalesce(jsonb_agg(i - 'notes' - 'progress' - 'pain'), '[]'::jsonb) from jsonb_array_elements(e -> 'injuries') i))), '{}'::jsonb)
      into v from jsonb_each(coalesce(v, '{}'::jsonb)) as t(k, e);
  end if;
  return coalesce(v, '{}'::jsonb);
end $$;
revoke all on function public.club_medical_get(text) from public, anon;
grant execute on function public.club_medical_get(text) to authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_store enable row level security;
alter table public.club_medical enable row level security;
alter table public.club_medical_reads enable row level security;

create policy clubs_read on public.clubs for select to authenticated using (id in (select public.my_clubs()));
create policy club_members_read on public.club_members for select to authenticated using (club_id in (select public.my_clubs()));
create policy club_members_manage on public.club_members for all to authenticated
  using (club_id in (select public.my_clubs(array['owner', 'head']))) with check (club_id in (select public.my_clubs(array['owner', 'head'])));
create policy club_store_read on public.club_store for select to authenticated using (club_id in (select public.my_clubs()));
create policy club_store_write on public.club_store for insert to authenticated with check (club_id in (select public.my_clubs(array['owner', 'head', 'coach', 'pt'])));
create policy club_store_update on public.club_store for update to authenticated
  using (club_id in (select public.my_clubs(array['owner', 'head', 'coach', 'pt']))) with check (club_id in (select public.my_clubs(array['owner', 'head', 'coach', 'pt'])));
-- medical: no select policy at all (reads go through club_medical_get); writes by owner / head / pt only
create policy club_medical_write on public.club_medical for insert to authenticated with check (club_id in (select public.my_clubs(array['owner', 'head', 'pt'])));
create policy club_medical_update on public.club_medical for update to authenticated
  using (club_id in (select public.my_clubs(array['owner', 'head', 'pt']))) with check (club_id in (select public.my_clubs(array['owner', 'head', 'pt'])));
create policy club_medical_reads_owner on public.club_medical_reads for select to authenticated using (club_id in (select public.my_clubs(array['owner'])));

revoke all on public.clubs, public.club_members, public.club_store, public.club_medical, public.club_medical_reads from anon;

-- ── checks to run after applying (each must return the stated result) ──────────────────────────────────────────────
-- 1. anon sees nothing:                   set role anon; select count(*) from public.club_store;          -> error / 0
-- 2. a member of club A cannot read B:    (signed in as A's coach) select count(*) from club_store where club_id = 'B';  -> 0
-- 3. a coach's medical read has no notes: select club_medical_get('A') -> no 'notes' / 'progress' / 'pain' keys
-- 4. every medical read is logged:        select count(*) from club_medical_reads where read_at > now() - interval '5 min';
