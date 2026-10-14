-- VISITS NEVER PUSH CHANGES OUT (12.10 B7). The club trail keeps 400 lines; 384 of them were 'opened the club zone',
-- so the changes the trail exists for fell off after 16. Same rule as src/bhbcActivity.js capActivity(): at the cap the
-- OLDEST visit lines ('open') go first, a change line only when no visit is left; the trail never shrinks on one append
-- (the owner's client write path refuses a halving - 12.10 review C1). NOT APPLIED - waits for Ohad's yes together with
-- the deploy that carries the client half.
create or replace function public.bhbc_activity_append(p_kind text, p_what text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  who text := lower(coalesce(auth.jwt() ->> 'email', ''));
  k text := left(coalesce(nullif(p_kind, ''), 'edit'), 20);
  w text := left(coalesce(p_what, ''), 160);
  cur jsonb;
  entry jsonb;
begin
  if who = '' or not coalesce(public.is_bhbc_coach(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  entry := jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'by', who, 'kind', k, 'what', w);
  select value into cur from public.store where key = 'expo-bhbc-activity' for update;
  if cur is null or jsonb_typeof(cur) <> 'array' then
    if cur is null then
      insert into public.store (key, value, updated_at) values ('expo-bhbc-activity', jsonb_build_array(entry), now());
    end if;
    return;
  end if;
  if exists (
    select 1 from jsonb_array_elements(cur) x
    where x ->> 'by' = who and x ->> 'kind' = k and x ->> 'what' = w
      and (x ->> 'at') ~ '^\d{4}-\d{2}-\d{2}T'
      and abs(extract(epoch from (now() - (x ->> 'at')::timestamptz))) < 60
  ) then
    return;
  end if;
  update public.store
     set value = (
       with t as (
         select v, o from jsonb_array_elements(jsonb_build_array(entry) || cur) with ordinality x(v, o)
       ), r as (
         select v, o,
                case when v ->> 'kind' = 'open' then row_number() over (partition by (v ->> 'kind' = 'open') order by o desc) end as open_from_oldest
           from t
       )
       select coalesce(jsonb_agg(v order by o), '[]'::jsonb) from (
         select v, o from r
          where open_from_oldest is null or open_from_oldest > greatest(0, (select count(*) from t) - 400)
          order by o limit 400
       ) k),
         updated_at = now()
   where key = 'expo-bhbc-activity';
end;
$function$;
