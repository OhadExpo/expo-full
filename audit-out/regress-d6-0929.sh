#!/usr/bin/env bash
# D6 (29.9): every gate against the SHIP TREE's own build (dist-d6 on :5239),
# one at a time (they share the debug Chrome and its CPU). Do not build or
# checkout while this runs.
cd "$(dirname "$0")/.."
export BASE=http://127.0.0.1:5239 MSYS_NO_PATHCONV=1
LOG=audit-out/REGRESS-D6-0929.log
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
