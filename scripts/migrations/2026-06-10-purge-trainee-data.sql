-- 2026-06-10 — owner-only hard purge of a trainee's full history.
-- Applied to prod via Studio SQL editor and verified same day.
--
-- Powers the opt-in "Also erase all their history" checkbox on the
-- permanent-delete dialogs (TraineesView + TraineeDetail). Plain delete
-- still only removes the roster blob row; this RPC wipes every table
-- keyed to the trainee id. Couple-aware: also matches sub-ids
-- tr_x__0 / tr_x__1 via the LIKE pattern.
--
-- Table list derived from information_schema (every public table with a
-- trainee_id / client_id / target_id / related_id column). push_subscriptions
-- is intentionally EXCLUDED — keyed by email, not trainee id (shared-email
-- risk + device tokens aren't athlete history). chat_logs is session-based
-- (no trainee ref).
--
-- VERIFIED (rollback transactions):
--   owner purge of tr_purgetest reported plans:2 (trainee + couple sub-id),
--   weekly_focus:1; a follow-up count confirmed 0 rows remained; a non-owner
--   (diego@diegoday.com) call raised 'not authorized' (P0001).

create or replace function public.purge_trainee_data(p_trainee_id text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  like_pat text := p_trainee_id || '\_\_%';
  out jsonb := '{}'::jsonb;
  n int;
begin
  if (select auth.jwt()->>'email') <> 'ohadyproductions@gmail.com' then
    raise exception 'not authorized';
  end if;
  if p_trainee_id is null or p_trainee_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'bad trainee id';
  end if;

  delete from athlete_meals          where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('athlete_meals', n);
  delete from bit_payment_requests   where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('bit_payment_requests', n);
  delete from bookings               where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('bookings', n);
  delete from bw_logs                where client_id  = p_trainee_id or client_id  like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('bw_logs', n);
  delete from challenge_participants where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('challenge_participants', n);
  delete from client_workouts        where client_id  = p_trainee_id or client_id  like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('client_workouts', n);
  delete from coach_messages         where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('coach_messages', n);
  delete from coach_notes            where target_id  = p_trainee_id or target_id  like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('coach_notes', n);
  delete from coach_tasks            where related_id = p_trainee_id or related_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('coach_tasks', n);
  delete from coaching_contracts     where client_id  = p_trainee_id or client_id  like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('coaching_contracts', n);
  delete from intake_submissions     where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('intake_submissions', n);
  delete from intake_tokens          where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('intake_tokens', n);
  delete from invoices               where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('invoices', n);
  delete from plans                  where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('plans', n);
  delete from subscriptions          where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('subscriptions', n);
  delete from trainee_activity       where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('trainee_activity', n);
  delete from trainee_evaluations    where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('trainee_evaluations', n);
  delete from trainee_next_actions   where trainee_id = p_trainee_id or trainee_id like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('trainee_next_actions', n);
  delete from weekly_focus           where client_id  = p_trainee_id or client_id  like like_pat;   get diagnostics n = row_count; out := out || jsonb_build_object('weekly_focus', n);

  return out;
end $fn$;

revoke all on function public.purge_trainee_data(text) from public, anon;
grant execute on function public.purge_trainee_data(text) to authenticated;
