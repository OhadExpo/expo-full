#!/usr/bin/env bash
# The last chain of the hour: the floor chip + week label rebuilt, the sessions
# pair re-shot on that build and merged into pairs-small.json, the host page,
# his tab reloaded.
export CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1
cd /c/Users/Administrator/Desktop/expo-full || exit 1
run() { echo; echo "### $*  [$(date +%H:%M:%S)]"; "$@" 2>&1 | grep -v -i deprecat | tail -10; echo "### exit=${PIPESTATUS[0]}"; }
echo "=== BUILD"; npm run build 2>&1 | grep -i "error\|✓ built" | head -4
sleep 25
ROUTES="/coach/sessions,/coach/waitlist" run node audit-out/probe-coach-coverage.mjs
LANG_APP=he W=1400 MANIFEST=pairs-small-sessions.json JOBS="owner:/coach/sessions:sessions-he" run node scripts/shoot-prod-vs-branch.mjs
node -e "
const fs=require('fs');const a=JSON.parse(fs.readFileSync('audit-out/pairs/pairs-small.json','utf8'));const b=JSON.parse(fs.readFileSync('audit-out/pairs/pairs-small-sessions.json','utf8'));
const names=new Set(b.map(x=>x.name));const merged=a.map(x=>names.has(x.name)?b.find(y=>y.name===x.name):x);
fs.writeFileSync('audit-out/pairs/pairs-small.json',JSON.stringify(merged,null,2));console.log('merged',merged.length,'pairs; replaced',[...names].join(','));"
run node scripts/build-tonight.mjs
run node audit-out/verify-pair-scroll.mjs
CDP=http://127.0.0.1:9222 run node audit-out/reload-tab.mjs 4181
echo "=== DONE $(date +%H:%M:%S)"
