#!/usr/bin/env bash
# The small coach routes on the host page, on the final build (23:03).
export CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -6; echo "### exit=${PIPESTATUS[0]}"; }
sleep 20
ROUTES="/coach/bugs" run node audit-out/probe-coach-coverage.mjs
LANG_APP=he W=1400 MANIFEST=pairs-small.json JOBS="owner:/coach:dashboard-he,owner:/coach/sessions:sessions-he,owner:/coach/bugs:bugs-he,owner:/coach/smart-import:smart-import-he,owner:/coach/calendar:calendar-he,owner:/coach/intake:intake-he" run node scripts/shoot-prod-vs-branch.mjs
run node scripts/build-tonight.mjs
run node audit-out/verify-pair-scroll.mjs
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4181
echo "=== DONE $(date +%H:%M:%S)"
