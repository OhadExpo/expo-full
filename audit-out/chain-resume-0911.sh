#!/usr/bin/env bash
# The 09-11 evening chain, resumed after the machine ran out of memory at the
# sixth step: the login pair, the live pairs, the Hebrew pt-zone/portal pair and
# the phone pairs are already re-shot; this picks up from the review-tools batch.
export CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -8; echo "### exit=${PIPESTATUS[0]}"; }

echo "=== PAIRS (resumed)"
LANG_APP=he W=1400 MANIFEST=pairs-rt.json JOBS="owner:/coach/review-tools:review-tools,owner:/coach/tasks:tasks-he,owner:/coach/billing:billing-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-small.json JOBS="owner:/coach:dashboard-he,owner:/coach/sessions:sessions-he,owner:/coach/bugs:bugs-he,owner:/coach/smart-import:smart-import-he,owner:/coach/calendar:calendar-he,owner:/coach/intake:intake-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-small2.json JOBS="owner:/coach/waitlist:waitlist-he,owner:/coach/workouts:workouts-he,owner:/coach/review:review-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=430 MANIFEST=pairs-demo.json JOBS="athlete:/demo/athlete:demo-athlete-he" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=430 MANIFEST=pairs-athlete-more.json JOBS="athlete:/athlete:history-phone:history|היסטוריה,athlete:/athlete:prs-phone:^(prs|שיאים)$,athlete:/athlete:messages-phone:messages|הודעות,athlete:/athlete:bw-phone:^(bw|משקל)$" run node scripts/shoot-prod-vs-branch.mjs
LANG_APP=he W=1400 MANIFEST=pairs-editor.json JOBS="owner:/coach/programs:program-he:^Block #19,owner:/coach/athletes:athlete-form-he:^(EDIT|עריכה)$,owner:/coach/athletes:athlete-detail-he:^אוהד$" run node scripts/shoot-prod-vs-branch.mjs

echo; echo "=== PAGES"
run node scripts/build-tonight.mjs
run node scripts/build-bhbc-replan.mjs
run node scripts/build-recap.mjs
run node scripts/build-athlete-left.mjs
run node audit-out/verify-pair-scroll.mjs
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4182
run node scripts/shoot.mjs http://127.0.0.1:4182/ audit-out/athlete-left-final.png 1400 1000
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4181
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4180
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4179
run node scripts/shoot.mjs http://127.0.0.1:4181/ audit-out/tonight-final.png 1400 1000
run node scripts/shoot.mjs http://127.0.0.1:4180/ audit-out/replan-final.png 1400 1000
run node scripts/shoot.mjs http://127.0.0.1:4179/ audit-out/recap-final.png 1400 1000
echo "=== DONE $(date +%H:%M:%S)"
