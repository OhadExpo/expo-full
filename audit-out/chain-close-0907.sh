#!/usr/bin/env bash
# Close-of-shift chain, 2026-09-07: the gate sets from handoff §13 for what was
# touched (club zone, shared files, the service worker), then fresh
# live-vs-branch pairs, then the three local pages. Everything on the PRIVATE
# Chrome - the shared 9222 profile is another Claude's.
export CDP=http://127.0.0.1:9223
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -8; echo "### exit=${PIPESTATUS[0]}"; }

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

echo; echo "=== PAIRS"
run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he JOBS="pt:/coach/bhbc:pt-zone,athlete:/athlete:portal" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=430 MANIFEST=pairs-he-phone.json JOBS="athlete:/athlete:portal-phone,athlete:/athlete:meal-phone:meal log|יומן אוכל" run node scripts/shoot-prod-vs-branch.mjs

echo; echo "=== PAGES"
run node scripts/build-tonight.mjs
run node scripts/build-bhbc-replan.mjs
run node scripts/build-recap.mjs
echo "=== DONE $(date +%H:%M:%S)"
