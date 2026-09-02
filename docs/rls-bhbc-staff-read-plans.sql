-- BHBC STAFF READ ACCESS TO THEIR ATHLETES' PLANS
--
-- APPLIED 2026-09-02 as migration `bhbc_staff_read_bhbc_plans`, on Ohad's
-- explicit approval: "rls policy ? make sure it doesnt affect the atheles or
-- the expo experience and resume".
--
-- WHY IT CANNOT AFFECT ATHLETES OR EXPO
--
--   * PERMISSIVE. Postgres OR's permissive policies for the same command, so a
--     new one can only ever ADD visibility. Nothing existing is narrowed.
--     Pre-state recorded before applying, and unchanged after:
--       client_read_own_plans   SELECT  PERMISSIVE  (the athlete's own plans)
--       trainer_all_plans       ALL     PERMISSIVE  (is_staff())
--   * SELECT only. No write path is granted anywhere.
--   * Gated on is_bhbc_coach(), the email allowlist already in production,
--     which already includes both PTs. Nobody outside that list is affected.
--   * Scoped to BHBC-team athletes. Measured before applying: 10 BHBC athletes,
--     8 of 231 plans. The other 223 stay invisible.
--
-- MY FIRST DRAFT OF THIS FILE WAS WRONG and would have failed: it joined a
-- `public.trainees` table. There is no such table - the roster lives in
-- store['expo-trainees'] as a JSON array. Checking the real schema before
-- applying is what caught it.
--
-- Because the roster is in `store`, the scoping check is SECURITY DEFINER: a
-- coach cannot necessarily read that store row himself, and whether he can must
-- not decide whether the policy works.
--
-- VERIFIED AFTER APPLYING, from the real seats:
--   BHBC coach (benshemer4@gmail.com): plans 0 -> 8, plan_index 0 -> 8, across
--     6 trainee ids, every one BHBC (tr_bh_*, tr_daeshon). Opens the program
--     popup and sees the block.
--   Athlete (diego@diegoday.com): portal renders, programme present, warm-up +
--     day card + week picker intact.
--   PT: medical board renders, 7 injury rows, write path intact.
--
-- plan_index is a security_invoker view, so it follows this policy with no
-- policy of its own - confirmed by the coach seeing 8 rows through it.

create or replace function public.is_bhbc_athlete(tid text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.store s,
         lateral jsonb_array_elements(s.value) t
    where s.key = 'expo-trainees'
      and t->>'team' = 'BHBC'
      and t->>'id' = split_part(tid, '__', 1)
  );
$$;

create policy "bhbc staff read bhbc plans"
  on public.plans
  for select
  to authenticated
  using (public.is_bhbc_coach() and public.is_bhbc_athlete(trainee_id));

-- ROLLBACK
-- drop policy "bhbc staff read bhbc plans" on public.plans;
-- drop function if exists public.is_bhbc_athlete(text);
