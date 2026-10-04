-- 2026-10-03  #524 audit (API)  -- APPLIED 3.10 via Supabase MCP
-- 1. push_subscriptions: only a real browser push service, at most 10 per person,
--    enforced in the TABLE (a direct REST insert skipped api/push/subscribe's checks:
--    an athlete could register https://attacker.example and make the server POST to it).
--    Proven: athlete direct insert with an off-list endpoint -> 23514.
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_is_push_service CHECK (
  length(endpoint) <= 1000
  AND endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
  AND length(coalesce(p256dh, '')) <= 200 AND length(coalesce(auth, '')) <= 100);
-- + BEFORE INSERT trigger push_subscriptions_cap (>= 10 others for the email -> 42501; service role passes)
-- 2. bug_reports: the reporter is the token's. Trigger bug_reports_reporter: a signed-in
--    insert gets its own email; anything else is role anon + 'unverified: <claimed>'.
--    api/report-bug.js now writes a verified report WITH the reporter's token.
--    Proven: anon insert claiming the owner -> stored as 'unverified: ...', role anon.
-- 3. api_daily_budget + api_budget_take(bucket): one daily ceiling per paid AI endpoint,
--    shared by every serverless instance; limits live in the function
--    (chat-app 300, chat-il 600, capture-app 200, capture-il 300, meal-macros 400; unknown -> refused).
--    Proven: at the limit -> false, under it -> true.
-- (full SQL as applied: see the MCP migration history, names push_and_bug_report_guards_2026_10_03 and api_daily_budget_2026_10_03)
