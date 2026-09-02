-- BHBC STAFF READ ACCESS TO THEIR ATHLETES' PLANS
--
-- NOT APPLIED. This is a change to the PRODUCTION database and Ohad's standing
-- order on 2026-09-02 is "never ever deploy it", so it waits for his yes.
--
-- WHY. He asked for the athlete's EXPO block to open in a popup inside BHBC and
-- said "make sure the pt's and the coaches can view it as well". The popup is
-- built and works from the owner seat. From a real coach seat
-- (benshemer4@gmail.com) it renders "no program", because:
--
--     select from plan_index -> 0 rows, no error
--     select from plans      -> 0 rows, no error
--
-- RLS is hiding them. Silent zero rows, not a permission error, which is why
-- nothing in the UI could report it.
--
-- SCOPE. Read only, and only for plans belonging to a trainee on the BHBC team.
-- Staff get no write path here and no access to any other athlete's programme.
-- plan_index is security_invoker, so it follows this policy automatically and
-- needs no policy of its own.
--
-- BEFORE APPLYING
--   1. Record the pre-change state:  select policyname, cmd, qual from pg_policies where tablename = 'plans';
--   2. Apply.
--   3. Verify from BOTH seats: a coach sees ONLY BHBC athletes' plans, and an
--      ordinary trainee still sees only their own.
--   4. Rollback is the drop at the bottom.

-- Which accounts count as BHBC staff. Mirrors how the zone already gates the
-- medical board; adjust the source table/column names to whatever
-- is_bhbc_staff() already uses if that helper exists.
create or replace function public.is_bhbc_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainees t
    where t.team = 'BHBC'
      and t.is_staff is true
      and lower(t.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- The read policy itself.
create policy "bhbc staff read bhbc plans"
  on public.plans
  for select
  to authenticated
  using (
    public.is_bhbc_staff()
    and exists (
      select 1
      from public.trainees t
      where t.id = split_part(plans.trainee_id, '__', 1)
        and t.team = 'BHBC'
    )
  );

-- ROLLBACK
-- drop policy "bhbc staff read bhbc plans" on public.plans;
-- drop function if exists public.is_bhbc_staff();
