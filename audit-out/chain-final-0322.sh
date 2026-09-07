#!/usr/bin/env bash
# The last 30 minutes (Ohad 09-08 00:22: "finish like how i asked with the last
# 30 minutes"): every pair re-shot on the final build, the three pages rebuilt,
# the mirror verified, his three tabs reloaded, and a screenshot of each page.
# Private Chrome for the shooting; the 9222 debug Chrome only for the reloads.
export CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -8; echo "### exit=${PIPESTATUS[0]}"; }

echo "=== LOGIN PAIR"
run node audit-out/shot-login.mjs https://expo-app.co.il
mv -f audit-out/login-en.png audit-out/login-prod-en.png; mv -f audit-out/login-he.png audit-out/login-prod-he.png
run node audit-out/shot-login.mjs http://127.0.0.1:4173

echo; echo "=== PAIRS"
run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he JOBS="pt:/coach/bhbc:pt-zone,athlete:/athlete:portal" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=430 MANIFEST=pairs-he-phone.json JOBS="athlete:/athlete:portal-phone,athlete:/athlete:meal-phone:meal log|יומן אוכל" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-rt.json JOBS="owner:/coach/review-tools:review-tools,owner:/coach/tasks:tasks-he,owner:/coach/billing:billing-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-small.json JOBS="owner:/coach:dashboard-he,owner:/coach/sessions:sessions-he,owner:/coach/bugs:bugs-he,owner:/coach/smart-import:smart-import-he,owner:/coach/calendar:calendar-he,owner:/coach/intake:intake-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-small2.json JOBS="owner:/coach/waitlist:waitlist-he,owner:/coach/workouts:workouts-he,owner:/coach/review:review-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=430 MANIFEST=pairs-demo.json JOBS="athlete:/demo/athlete:demo-athlete-he" run node scripts/shoot-prod-vs-branch.mjs

echo; echo "=== PAGES"
run node scripts/build-tonight.mjs
run node scripts/build-bhbc-replan.mjs
run node scripts/build-recap.mjs
run node audit-out/verify-pair-scroll.mjs
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4181
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4180
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4179
run node scripts/shoot.mjs http://127.0.0.1:4181/ audit-out/tonight-final.png 1400 1000
run node scripts/shoot.mjs http://127.0.0.1:4180/ audit-out/replan-final.png 1400 1000
run node scripts/shoot.mjs http://127.0.0.1:4179/ audit-out/recap-final.png 1400 1000
echo "=== DONE $(date +%H:%M:%S)"
