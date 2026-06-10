-- 2026-06-10 — coaching_contracts rebuild + immutable token signing.
-- Applied to prod via Studio SQL editor and verified same day.
--
-- WHY A REBUILD: the prod table (0 rows) had a body_html/signature_png
-- shape that matched NO live code — the composer inserted token/
-- monthly_rate/status columns that didn't exist, so contract creation
-- AND /sign/<token> were dead end-to-end. New table matches the code.
--
-- ACCESS MODEL:
--   * Direct table access: owner only (money surface — not staff).
--   * Athletes + LOGGED-OUT recipients: token-capability SECURITY DEFINER
--     functions only. No anon/athlete table policies at all, so the table
--     can't be enumerated; the token is the capability.
--   * sign_contract updates ONLY signature/signed_at/status and ONLY while
--     athlete_signed_at IS NULL — a signed contract is immutable, and the
--     terms columns are unreachable from the client, period.
--
-- VERIFIED (rollback transaction, role=anon):
--   read-by-token 1 row · direct table read 0 rows · first sign true ·
--   persisted · re-sign false (original signature kept) · wrong token false.
--
-- Client pairing: ContractSign.jsx uses the two RPCs; CoachContractComposer
-- mints ct_ tokens via crypto.getRandomValues (128-bit).

drop table if exists public.coaching_contracts;
create table public.coaching_contracts (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  coach_email text not null,
  client_id text not null,
  client_name text,
  monthly_rate numeric,
  currency text default 'ils',
  sessions_per_week int,
  package_length_months int,
  custom_clauses text,
  status text not null default 'pending',
  athlete_signature text,
  athlete_signed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.coaching_contracts enable row level security;

create policy contracts_owner_all on public.coaching_contracts
  for all to authenticated
  using ((select auth.jwt()->>'email') = 'ohadyproductions@gmail.com')
  with check ((select auth.jwt()->>'email') = 'ohadyproductions@gmail.com');

create or replace function public.get_contract_by_token(p_token text)
returns setof public.coaching_contracts
language sql security definer set search_path = public, pg_temp as $fn$
  select * from public.coaching_contracts where token = p_token;
$fn$;

create or replace function public.sign_contract(p_token text, p_signature text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_signature is null or length(p_signature) < 100 or length(p_signature) > 400000 then
    return false;
  end if;
  update public.coaching_contracts
     set athlete_signature = p_signature,
         athlete_signed_at = now(),
         status = 'signed'
   where token = p_token
     and athlete_signed_at is null;
  return found;
end $fn$;

revoke all on function public.get_contract_by_token(text) from public;
revoke all on function public.sign_contract(text, text) from public;
grant execute on function public.get_contract_by_token(text) to anon, authenticated;
grant execute on function public.sign_contract(text, text) to anon, authenticated;
