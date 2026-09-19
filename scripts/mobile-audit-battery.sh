#!/usr/bin/env bash
# THE MOBILE AUDIT, RUN THE SAME WAY EVERY TIME.
#
# Ohad, 19.9: "triple audit everything on mobile before final deployment.
# hunders of design/text/broken/overflow fixes. everywhere anywhere on our
# platforms."
#
# Three passes only mean something if each pass covers the same ground, so the
# ground is written down here instead of retyped. Two rules baked in:
#
#   1. ONE CHROME, ONE GATE AT A TIME. Two sweeps sharing the debug browser
#      produced 12/20 and "27 flips" on 17.9, both of which were contention and
#      neither of which was real. Everything below is sequential on purpose.
#   2. NEVER `npm run build` WHILE THIS RUNS. :5199 is `vite preview` on this
#      repo's dist, so a rebuild swaps the site out from under a running sweep.
#      I did exactly that twice on 19.9 and had to throw both runs away.
#
# WHAT MAKES THE THREE PASSES DIFFERENT.
#
# Running the identical battery three times finds the same thing three times.
# The gates below ARE run identically every pass - that is what catches a
# regression introduced by the previous pass's fixes - but each pass adds its
# own work on top, and that is where the findings come from:
#
#   PASS 1  the gates, cold. Fix what they name.
#   PASS 2  the gates again, THEN LOOK AT THE PHONE SCREEN. Screenshot 360 and
#           390 with the menus OPEN and the sections EXPANDED, and read them.
#           Every complaint he has ever made about a phone - the dropdown off
#           screen, one letter per line, the 3px logo, the money contradicting
#           itself - was one second of looking and passed every rect gate.
#   PASS 3  adversarial. Break each fix and prove the gate still bites; drive
#           the surfaces a route sweep cannot reach (modals, drawers, the ⋮
#           menu, a started workout); and re-run from the OTHER seats.
#
# Usage:  bash scripts/mobile-audit-battery.sh <pass-number>
set -u
PASS="${1:-1}"
OUT="audit-out/mobile-pass$PASS"
APP="${APP:-http://127.0.0.1:5199}"
IL="${IL:-http://127.0.0.1:5174}"
mkdir -p "$OUT"

run () { # run <label> <command...>
  local label="$1"; shift
  echo "=== $label ==="
  "$@" > "$OUT/$label.txt" 2>&1
  local rc=$?
  echo "    exit $rc   $(tail -2 "$OUT/$label.txt" | tr '\n' ' ' | cut -c1-140)"
}

for W in 360 390 414; do
  run "clip-en-$W" node scripts/verify-no-text-clipping.mjs "$APP" "$W"
done

# HEBREW IS THE LONGER TEXT AND THE PRIMARY LANGUAGE. Leaving HE unset measures
# only the English layout, which is how pass 1 started before I caught it: 58
# keys in i18n.js render 1.5-3.7x longer in Hebrew than the English they
# replace, so this is where the clipping actually lives.
for W in 360 390 414; do
  run "clip-he-$W" env HE=1 node scripts/verify-no-text-clipping.mjs "$APP" "$W"
done

run "row-ink-en" env WIDTHS=360,390,414 BASE="$APP" node scripts/verify-row-ink.mjs
run "row-ink-he" env WIDTHS=360,390,414 BASE="$APP" THEME= HE=1 node scripts/verify-row-ink.mjs

run "card-trailing-360" node scripts/verify-card-trailing.mjs "$APP" 360
run "card-trailing-390" node scripts/verify-card-trailing.mjs "$APP" 390

# strip-bleed and column-starts take BASE from the environment and their
# widths differently from the rest - passing a base positionally to them is
# silently ignored, which is how a sweep ends up measuring a width nobody
# asked for. Called the way each one actually reads its input:
run "strip-bleed" env BASE="$APP" WIDTHS=360,390,414 node scripts/verify-strip-bleed.mjs
run "rtl-no-flip"  env BASE="$APP" node scripts/verify-rtl-no-flip.mjs

# 0.5px IS a threshold he can see, when there is a border beside it. The roster
# ACTIVE pill he reported three times was off by 0.60px. So this gate's 207
# findings are not sub-pixel noise to be waved away - they are potentially 207
# copies of that same complaint, and the distribution decides. Run at a phone
# width, where the controls are tightest.
run "text-centring-390" node scripts/verify-text-centring.mjs "$APP" 390
run "column-starts"     env BASE="$APP" node scripts/verify-column-starts.mjs 360 390 414

# The marketing site is the other platform, and 360/414 were never in its list.
run "marketing-site"     env WIDTHS=360,390,414 IL_BASE="$IL" node scripts/verify-marketing-site.mjs
run "marketing-claims"   env WIDTHS=360,390,414 IL_BASE="$IL" node scripts/verify-marketing-claims.mjs
run "marketing-contrast" env WIDTHS=360,390,414 IL_BASE="$IL" node scripts/verify-marketing-contrast.mjs

echo
echo "===== PASS $PASS SUMMARY ====="
for f in "$OUT"/*.txt; do
  printf '%-22s %s\n' "$(basename "$f" .txt)" "$(grep -cE '^(FAIL|BAD|WORST)' "$f" 2>/dev/null) flagged line(s)"
done
echo "full output in $OUT/"
