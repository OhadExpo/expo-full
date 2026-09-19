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

run "strip-bleed" node scripts/verify-strip-bleed.mjs "$APP" 390
run "rtl-no-flip"  node scripts/verify-rtl-no-flip.mjs

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
