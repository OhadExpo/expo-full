#!/usr/bin/env bash
# Every gate against a SHIP TREE's own build, one at a time (they share the
# debug Chrome and its CPU). Do not build or checkout while this runs.
#   PORT=5240 DIST=dist-d6b LOG=audit-out/REGRESS-D6b-0929.log bash audit-out/regress-cut.sh
cd "$(dirname "$0")/.."
: "${PORT:?PORT}" "${DIST:?DIST}" "${LOG:?LOG}"
# HEADLESS, never his Chrome (29.9 #466: he watched the battery's tabs sign in
# and out of EXPO in the debug Chrome he uses). Override with CDP=... if needed.
export CDP="${CDP:-http://[::1]:9444}"
export BASE=http://127.0.0.1:$PORT MSYS_NO_PATHCONV=1 DIST
: > "$LOG"
run() {
  echo "=== $* ===" >> "$LOG"
  timeout 3000 "$@" >> "$LOG" 2>&1
  echo "--- exit=$? ($*)" >> "$LOG"
}
run node scripts/verify-tool-parity.mjs
run node scripts/verify-revenue-private.mjs
run node scripts/verify-bhbc-write-scope.mjs
run node scripts/verify-no-text-overflow.mjs
run node scripts/verify-demo-pages.mjs
run node scripts/verify-control-heights.mjs
run node scripts/verify-bidi-order.mjs
run node scripts/verify-demo-numbers.mjs
run node scripts/verify-demo.mjs
run node scripts/verify-rule-rhythm.mjs
run node scripts/verify-workout-durability.mjs
run node scripts/verify-shared-device.mjs
run node scripts/verify-athlete-no-backend.mjs
run node scripts/verify-pt-no-backend.mjs
run node scripts/_portal-lang.tmp.mjs
run node audit-out/_oauthret.mjs
# 29.9 evening gates: strip titles one line (#452), every box centred (#447)
run node scripts/verify-strip-title-fit.mjs
run node scripts/verify-box-centring.mjs
run node scripts/verify-submenu-click.mjs
run node scripts/verify-demo-box-heights.mjs
run node scripts/verify-inline-centre.mjs
# #471 / #472: a weigh-in is queued before the network answers; EXIT mid-upload asks (fixture seat, writes held, nothing sent)
run node scripts/verify-bw-durable.mjs
run node scripts/verify-exit-midupload.mjs
# #473: every BHBC popup opened and measured inside (panel, spill, clip, title wrap, control centring)
run node scripts/verify-popups.mjs
# #330: one start x per column
run node scripts/verify-column-starts.mjs
# #476: Elad's seat is a sandbox - DB as him, every coach route as him (0 raw hits) and as the owner (0 sandbox hits), his actions stay in his copy
run node scripts/verify-partner-sandbox.mjs
EXPO_EMAIL=eladeluz24@gmail.com run node scripts/verify-partner-seat-walk.mjs
EXPO_EMAIL=ohadyproductions@gmail.com run node scripts/verify-partner-seat-walk.mjs
run node scripts/verify-partner-sandbox-actions.mjs
# #478: the whole athlete lifecycle and a program edit through the screens as him; every media file he is shown loads
run node scripts/verify-partner-athlete-lifecycle.mjs
run node scripts/verify-partner-program-edit.mjs
run node scripts/verify-partner-media.mjs
# the sandbox changed supabase.js: the athlete journey must still run clean (lock trap)
run node scripts/verify-athlete-journey.mjs
# 1.10 triple audit: an INDEPENDENT money scan of every sbx_ text/json column + one multiplier per athlete
run node scripts/verify-partner-money-leaks.mjs
run node scripts/verify-partner-links.mjs
run node scripts/verify-partner-cross-tab.mjs
run node scripts/verify-partner-realtime.mjs
# #499: no BOX past the screen or its card - every page AND tab, 360/390/414, en+he, app + demo + marketing
run node scripts/verify-box-fit.mjs
# #479: an athlete writes only his own presence row
run node scripts/verify-presence-own-row.mjs
echo "=== DONE ===" >> "$LOG"
