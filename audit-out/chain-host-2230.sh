#!/usr/bin/env bash
# Refresh everything he judges on the local host, on the final build of the
# evening (Ohad 09-07 ~22:30: "update the local host chrome for me to judge
# before deploying with the rules we had"). Private Chrome only.
export CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -6; echo "### exit=${PIPESTATUS[0]}"; }

echo "=== LOGIN PAIR (production is English whatever the language key says)"
run node audit-out/shot-login.mjs https://expo-app.co.il
mv -f audit-out/login-en.png audit-out/login-prod-en.png; mv -f audit-out/login-he.png audit-out/login-prod-he.png
run node audit-out/shot-login.mjs http://127.0.0.1:4173

echo; echo "=== PAIRS"
run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he JOBS="pt:/coach/bhbc:pt-zone,athlete:/athlete:portal" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=430 MANIFEST=pairs-he-phone.json JOBS="athlete:/athlete:portal-phone,athlete:/athlete:meal-phone:meal log|יומן אוכל" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-rt.json JOBS="owner:/coach/review-tools:review-tools,owner:/coach/tasks:tasks-he,owner:/coach/billing:billing-he" run node scripts/shoot-prod-vs-branch.mjs

echo; echo "=== PAGES"
run node scripts/build-tonight.mjs
run node scripts/build-bhbc-replan.mjs
run node scripts/build-recap.mjs
run node audit-out/verify-pair-scroll.mjs
echo "=== DONE $(date +%H:%M:%S)"
