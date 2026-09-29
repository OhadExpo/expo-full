#!/usr/bin/env bash
# Every gate against a SHIP TREE's own build, one at a time (they share the
# debug Chrome and its CPU). Do not build or checkout while this runs.
#   PORT=5240 DIST=dist-d6b LOG=audit-out/REGRESS-D6b-0929.log bash audit-out/regress-cut.sh
cd "$(dirname "$0")/.."
: "${PORT:?PORT}" "${DIST:?DIST}" "${LOG:?LOG}"
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
echo "=== DONE ===" >> "$LOG"
