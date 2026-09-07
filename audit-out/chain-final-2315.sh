#!/usr/bin/env bash
# Final chain of the hour (23:15): rebuild with waitlist/workouts/review/chat-audit
# in Hebrew, measure, the 14 gates, three more pairs, the host page, reload his tab.
export CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -8; echo "### exit=${PIPESTATUS[0]}"; }
echo "=== BUILD"; npm run build 2>&1 | grep -i "error\|✓ built" | head -4
sleep 25
echo "=== COVERAGE"
ROUTES="/coach/waitlist,/coach/workouts,/coach/review,/coach/chat-audit,/coach/bugs,/coach/tasks" run node audit-out/probe-coach-coverage.mjs
echo "=== GATES"
run node scripts/verify-bhbc-collapse.mjs
run node scripts/verify-pt-no-backend.mjs
SEAT=pt W=390 run node scripts/verify-mobile-overflow.mjs
SEAT=pt run node scripts/verify-no-raw-values.mjs
LANG_APP=he SEAT=pt run node scripts/verify-no-raw-values.mjs
run node scripts/verify-hebrew.mjs
run node scripts/verify-athlete-journey.mjs
run node scripts/verify-athlete-no-backend.mjs
SEAT=owner run node scripts/verify-no-raw-values.mjs
LANG_APP=he SEAT=owner run node scripts/verify-no-raw-values.mjs
SEAT=owner W=390 run node scripts/verify-mobile-overflow.mjs
run node scripts/verify-offline-everywhere.mjs
run node scripts/verify-athlete-offline.mjs
run node scripts/verify-marketing-site.mjs
echo "=== PAIRS"
LANG_APP=he W=1400 MANIFEST=pairs-small2.json JOBS="owner:/coach/waitlist:waitlist-he,owner:/coach/workouts:workouts-he,owner:/coach/review:review-he" run node scripts/shoot-prod-vs-branch.mjs
echo "=== PAGES"
run node scripts/build-tonight.mjs
run node audit-out/verify-pair-scroll.mjs
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4181
echo "=== DONE $(date +%H:%M:%S)"
