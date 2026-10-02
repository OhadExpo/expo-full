-- #510-A1 verifier: every RLS policy that still matches an id by LIKE prefix
-- with an unescaped '_' wildcard. Must return ZERO rows.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '~~ \(?\(?current_client_id\(\)'
    OR (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'current_client_id\(\) \|\| ''__%'''
 ORDER BY 1, 2, 3;
