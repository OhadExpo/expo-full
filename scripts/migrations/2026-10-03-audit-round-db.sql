-- 2026-10-03  #524 audit round 1 (database)  -- APPLIED 3.10 via Supabase MCP
--
-- 1. presence policies: the own-row match was LIKE ('expo-presence-' || id || '\_\_%');
--    the id itself carries '_' (a LIKE wildcard), so tr_abc matched trXabc's rows.
--    Now equality after stripping a couple's '__N' (same as every other own-row policy).
ALTER POLICY store_presence_delete_own ON public.store USING ((current_client_id() IS NOT NULL) AND ((key = ('expo-presence-' || current_client_id())) OR (regexp_replace(key, '__[0-9]+$', '') = ('expo-presence-' || current_client_id()))));
ALTER POLICY store_presence_insert_own ON public.store WITH CHECK ((current_client_id() IS NOT NULL) AND ((key = ('expo-presence-' || current_client_id())) OR (regexp_replace(key, '__[0-9]+$', '') = ('expo-presence-' || current_client_id()))));
ALTER POLICY store_presence_update_own ON public.store USING ((current_client_id() IS NOT NULL) AND ((key = ('expo-presence-' || current_client_id())) OR (regexp_replace(key, '__[0-9]+$', '') = ('expo-presence-' || current_client_id())))) WITH CHECK ((current_client_id() IS NOT NULL) AND ((key = ('expo-presence-' || current_client_id())) OR (regexp_replace(key, '__[0-9]+$', '') = ('expo-presence-' || current_client_id()))));

-- 2. purge_trainee_data / sbx_purge_trainee_data (delete a client everywhere):
--    - the sub-id pattern p_trainee_id || '\_\_%' left the id's own '_' a wildcard:
--      purging tr_abc ALSO deleted trXabc__1's rows in 19 tables. Proven live:
--      'trXabc__1' LIKE 'tr_abc\_\_%' = true before, false after.
--    - the owner guard `jwt email <> owner` is NULL (not true) for a session with
--      no email, so it did not raise. Now coalesce(..., '').
DO $$
DECLARE d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.purge_trainee_data(text)', 'public.sbx_purge_trainee_data(text)'] LOOP
    d := pg_get_functiondef(f::regprocedure);
    d := replace(d, $q$like_pat text := p_trainee_id || '\_\_%';$q$, $q$like_pat text := replace(p_trainee_id, '_', '\_') || '\_\_%';$q$);
    d := replace(d, $q$if (select auth.jwt()->>'email') <> 'ohadyproductions@gmail.com' then$q$, $q$if coalesce((select auth.jwt()->>'email'), '') <> 'ohadyproductions@gmail.com' then$q$);
    EXECUTE d;
  END LOOP;
END $$;

-- 3. Supabase lint 0011: pin search_path on the sandbox fakers + the anti-wipe trigger fn
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('sbx_fake','sbx_fake_text','sbx_factor','sbx_fake_json','sbx_fake2','sbx_fake_price_text','sbx_fake_json2','sbx_fake_total','sbx_fake_money_text','store_block_catastrophic_shrink')
  LOOP EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig); END LOOP;
END $$;
