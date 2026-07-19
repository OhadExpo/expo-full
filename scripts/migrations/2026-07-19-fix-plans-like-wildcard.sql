-- plans RLS: LIKE-wildcard prefix collision. Applied to prod 2026-07-19.
--
-- client_read_own_plans used:
--     trainee_id LIKE (current_client_id() || '__%')
-- intending "my couple sub-plans" (<parent>__0 / __1). But '_' is a LIKE
-- WILDCARD, so '__%' reads as "any two characters, then anything" rather than a
-- literal double underscore. Verified at expression level against the real
-- roster, for caller 'tr_yuval':
--     tr_yuval          old=true   new=true    (own — unchanged)
--     tr_yuval_gotlib   old=TRUE   new=false   (<- the collision: '_g' satisfied '__')
--
-- HONEST IMPACT: the only colliding pair on the live roster is
-- tr_yuval -> tr_yuval_gotlib, and tr_yuval is the STAFF account
-- (yuvalberkovitch@gmail.com), who already reads every plan legitimately via
-- trainer_all_plans / is_staff(). So this was NOT exploitable in practice today.
-- It is fixed as correctness + defence: the day any two athlete ids share a
-- prefix (easy — ids are semantic, e.g. tr_ron / tr_ron_levi), it becomes a
-- live cross-athlete leak of training plans.
--
-- Fixed with equality-after-strip, which has no wildcard semantics at all —
-- the same rule used by the realtime topic predicate and the storage policies.
--
-- Verified from real non-staff seats (scripts/_verify-plans-rls-leak.cjs, 6/6):
--   Diego 10 rows, Moshe 22, Dana 22 — each sees ONLY their own/sub plans, and
--   none lost access.

drop policy if exists client_read_own_plans on public.plans;
create policy client_read_own_plans on public.plans
for select to authenticated
using (
  current_client_id() is not null
  and (
    trainee_id = current_client_id()
    or regexp_replace(trainee_id, '__[0-9]+$', '') = current_client_id()
  )
);
