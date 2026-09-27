-- PROPOSED — NOT APPLIED. The owner reviews and applies this by hand.
-- Workout durability, database side (2026-09-27). Pairs with the client change
-- on branch workout-durability (durable-before-network save, one row per
-- plan/day/week, 0-set refusal).
--
-- Live state read on 2026-09-27 (read-only): client_workouts has ONE policy,
--   trainer_or_own  FOR ALL TO authenticated
--     USING      (is_staff() OR client_id = current_client_id())
--     WITH CHECK (is_staff() OR client_id = current_client_id())
-- and no triggers. So an athlete seat can INSERT, UPDATE and DELETE its own
-- rows, and any overwrite or delete is gone for good.
--
-- WHY NOT "INSERT-ONLY" FOR THE ATHLETE. The athlete seat legitimately UPDATEs:
--   1. the re-save of an existing log (AGAIN → Complete re-upserts the same id —
--      that is how duplicates are prevented, and an upsert on an existing id is
--      an UPDATE);
--   2. the offline-queue replay (client_workouts.upsert, idempotent upsert);
--   3. blobQueue attaching an uploaded form video (client_workouts.update →
--      upsert {id, form_videos}) and the athlete's reply to a coach comment
--      (updateFormVideos → upsert {id, form_videos}).
-- An INSERT-only athlete would turn every one of those into a 42501. What the
-- athlete never needs is DELETE (the portal has no delete; deleteClientWorkout
-- is wired to the coach views only). So: INSERT + UPDATE own rows, no DELETE,
-- and every UPDATE/DELETE by anyone leaves the old row in an owner-only history.

begin;

-- ── 1. Policies: split the FOR ALL policy so the athlete loses DELETE ─────────
drop policy if exists trainer_or_own on public.client_workouts;

create policy cw_staff_all on public.client_workouts
  for all to authenticated
  using (is_staff()) with check (is_staff());

create policy cw_own_select on public.client_workouts
  for select to authenticated
  using (client_id = current_client_id());

create policy cw_own_insert on public.client_workouts
  for insert to authenticated
  with check (client_id = current_client_id());

-- UPDATE of his own row, and the row must stay his (client_id can not be moved).
create policy cw_own_update on public.client_workouts
  for update to authenticated
  using (client_id = current_client_id())
  with check (client_id = current_client_id());
-- (no athlete DELETE policy — RLS denies it)

-- ── 2. Owner-only history: the previous version of every overwritten/deleted row
create table if not exists public.client_workouts_history (
  hist_id     bigserial primary key,
  op          text not null,                  -- 'UPDATE' | 'DELETE'
  changed_at  timestamptz not null default now(),
  changed_by  text,                           -- email from the JWT that made the change
  row_id      text not null,                  -- client_workouts.id
  old_row     jsonb not null                  -- the full row BEFORE the change
);
create index if not exists client_workouts_history_row_id on public.client_workouts_history (row_id);
alter table public.client_workouts_history enable row level security;
-- Owner reads it. Nobody writes it through the API: the trigger below runs as
-- the function owner (SECURITY DEFINER), which is how an athlete's UPDATE can
-- still record its history without the athlete being able to read or edit it.
create policy cwh_owner_read on public.client_workouts_history
  for select to authenticated using (is_trainer());

create or replace function public.client_workouts_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip no-op updates (the queue replay re-sends identical rows).
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;
  insert into public.client_workouts_history (op, changed_by, row_id, old_row)
  values (tg_op, lower(coalesce(auth.jwt() ->> 'email', '')), old.id, to_jsonb(old));
  return coalesce(new, old);
end;
$$;
revoke all on function public.client_workouts_keep_history() from public, anon, authenticated;

drop trigger if exists client_workouts_history_trg on public.client_workouts;
create trigger client_workouts_history_trg
  after update or delete on public.client_workouts
  for each row execute function public.client_workouts_keep_history();

-- ── 3. No empty workouts from the athlete seat ───────────────────────────────
-- Rejects an athlete-seat INSERT/UPDATE whose exercises carry ZERO done sets —
-- the 0/20 and 0/14 rows. Staff are exempt (coach-side logging and repairs).
-- A row whose exercises array is EMPTY is allowed: blobQueue can race ahead of
-- the workout upsert and create a stub {id, form_videos} that the queued
-- workout row then fills in; rejecting the stub would bounce a form-video
-- upload. The client refuses 0-set Complete first; this is the second line.
-- Raised as SQLSTATE 23514 (check_violation) so the client classifies it as a
-- permanent error — and since 27.9 a permanent error on a workout PARKS it in
-- the queue with a visible "not saved yet" banner instead of dropping it.
create or replace function public.client_workouts_reject_empty()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  done_sets int;
begin
  if is_staff() then
    return new;
  end if;
  if jsonb_typeof(new.exercises) = 'array' and jsonb_array_length(new.exercises) > 0 then
    select count(*) into done_sets
      from jsonb_array_elements(new.exercises) e,
           jsonb_array_elements(case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end) s
     where (s->>'done') = 'true';
    if done_sets = 0 then
      raise exception 'a workout needs at least one completed set'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists client_workouts_reject_empty_trg on public.client_workouts;
create trigger client_workouts_reject_empty_trg
  before insert or update on public.client_workouts
  for each row execute function public.client_workouts_reject_empty();

commit;

-- ── Verify after applying (as the owner, read-only) ──────────────────────────
-- select policyname, cmd from pg_policies where tablename = 'client_workouts';
--   → cw_own_insert INSERT, cw_own_select SELECT, cw_own_update UPDATE, cw_staff_all ALL
-- Then from the fixture athlete seat: node scripts/verify-workout-durability.mjs
-- (its cleanup falls back to the owner seat when the athlete can no longer DELETE)
-- and node scripts/verify-portal-rls.mjs — NOTE: that gate's own cleanup deletes
-- its marker row as the athlete and inserts a row with no exercises; after this
-- migration its "delete" clause will report 42501 and needs the same owner-seat
-- fallback.
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
-- begin;
-- drop trigger if exists client_workouts_reject_empty_trg on public.client_workouts;
-- drop trigger if exists client_workouts_history_trg on public.client_workouts;
-- drop policy if exists cw_staff_all on public.client_workouts;
-- drop policy if exists cw_own_select on public.client_workouts;
-- drop policy if exists cw_own_insert on public.client_workouts;
-- drop policy if exists cw_own_update on public.client_workouts;
-- create policy trainer_or_own on public.client_workouts for all to authenticated
--   using (is_staff() or client_id = current_client_id())
--   with check (is_staff() or client_id = current_client_id());
-- commit;
-- (client_workouts_history is kept on rollback — it only holds old versions.)
