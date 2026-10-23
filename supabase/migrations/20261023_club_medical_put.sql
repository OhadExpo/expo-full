-- TEAM VERSION PHASE B (#904, 23.10): the WRITE half of club medical.
-- club_medical has no select policy on purpose (every read goes through club_medical_get, which logs it), so a client
-- cannot upsert it (ON CONFLICT must see the row) and an UPDATE ... WHERE finds nothing. Writes go through this function:
-- owner / head / pt of the club only - a coach never writes medical - one row per club, stamped.
create or replace function public.club_medical_put(p_club text, p_value jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_club not in (select public.my_clubs(array['owner', 'head', 'pt'])) then
    raise exception 'not allowed to write this club''s medical board';
  end if;
  insert into public.club_medical (club_id, value, updated_by, updated_at)
  values (p_club, coalesce(p_value, '{}'::jsonb), coalesce(auth.jwt() ->> 'email', '?'), now())
  on conflict (club_id) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke all on function public.club_medical_put(text, jsonb) from public, anon;
grant execute on function public.club_medical_put(text, jsonb) to authenticated;
