#!/usr/bin/env bash
# CUT THE DEPLOY TREE: everything on the branch EXCEPT the athlete-portal files
# that production does not run yet — and a commit that FAST-FORWARDS production.
#
# Ohad: "update and deploy everything anywhere except athlete portal".
#
# The hold is NOT a state of the branch. bhbc-hebrew carries the athlete work
# in full and always should; the tree is a separate cut. It is RE-CUT every
# time the branch moves — a stale tree deploys yesterday's work.
#
# WHAT IS HELD IS MEASURED, NOT ASSUMED (26.9). The hold used to be "four
# files, always": three views reset to production + three <LangCtx.Provider>
# wraps removed from App.jsx. By 26.9 production ALREADY ran the portal and
# sandbox wraps (a3f2813 reached master) and two of the views already equalled
# production — so the old script would have STRIPPED the language provider from
# the live athlete portal. Now:
#   - a held view is reset to production only if it differs from it;
#   - the App.jsx wraps are removed only if production does NOT have them.
#
# NEVER merge origin/master into the branch, and never rebase the branch onto
# it: master descends from cuts where held files were set back to production,
# so both replay that reversion onto the branch. Production is instead
# fast-forwarded by a commit whose TREE is the proven cut and whose first
# parent is production (git commit-tree), printed as ship-<name>.
#
#   bash scripts/cut-deploy-tree.sh [name]      # default: deploy-<mmdd>
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${1:-deploy-$(date +%m%d)}"
SRC=bhbc-hebrew
HELD_VIEWS=(src/ClientPortal.jsx src/MealLogger.jsx src/TrySandbox.jsx)

git fetch origin --quiet
PROD=$(git rev-parse origin/master)
echo "production : $(git log -1 --format='%h %s' "$PROD")"
echo "branch     : $(git log -1 --format='%h %s' "$SRC")"
echo "tree       : $NAME"
echo

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "REFUSING: the working tree is dirty. Commit or stash first." >&2
  exit 1
fi
START=$(git rev-parse --abbrev-ref HEAD)

git checkout -q -B "$NAME" "$SRC"
HELD=()
for f in "${HELD_VIEWS[@]}"; do
  if ! git diff --quiet "$PROD" HEAD -- "$f"; then git checkout -q "$PROD" -- "$f"; HELD+=("$f"); fi
done
PROD_WRAPS=$(git show "$PROD:src/App.jsx" | grep -c 'if (isClient) return (<LangCtx.Provider' || true)
if [ "$PROD_WRAPS" = "0" ]; then
  node scripts/unwrap-langctx.mjs
  HELD+=(src/App.jsx)
else
  echo "  production already runs the portal LangCtx wrap — App.jsx keeps it"
fi
if [ ${#HELD[@]} -gt 0 ]; then
  git add "${HELD[@]}"
  git commit -q -m "$NAME: everything except the athlete-portal files production does not run yet

Held at production: ${HELD[*]}. Cut from $SRC at $(git rev-parse --short "$SRC")."
fi

echo
echo "=== PROVING THE HOLD, not claiming it ==="
FAIL=0
for f in "${HELD_VIEWS[@]}"; do
  if git diff --quiet "$PROD" HEAD -- "$f"; then echo "  ok    byte-identical to production : $f"
  else echo "  FAIL  DIFFERS from production     : $f"; FAIL=1; fi
done
N=$(grep -c 'if (isClient) return (<LangCtx.Provider' src/App.jsx || true)
if [ "$N" = "$PROD_WRAPS" ]; then echo "  ok    portal LangCtx wrap count = production's ($N)"
else echo "  FAIL  portal LangCtx wraps: tree $N, production $PROD_WRAPS"; FAIL=1; fi
EXTRA=$(git diff --name-only "$SRC" HEAD | grep -v -x -F -f <(printf '%s\n' "${HELD[@]:-}") || true)
if [ -z "$EXTRA" ]; then echo "  ok    differs from the branch only in the held files (${#HELD[@]})"
else echo "  FAIL  also differs from the branch: $EXTRA"; FAIL=1; fi
echo
echo "=== what this tree SHIPS that production does not ==="
git diff --stat "$PROD" HEAD | tail -1

SHIP=""
if [ "$FAIL" = "0" ]; then
  SHIP=$(git commit-tree "HEAD^{tree}" -p "$PROD" -p HEAD -m "deploy $NAME: $SRC at $(git rev-parse --short "$SRC")

Tree = $NAME exactly (held at production: ${HELD[*]:-none}). Parent 1 = production,
so the push is a fast-forward.")
  git branch -f "ship-$NAME" "$SHIP"
fi
git checkout -q "$START"
echo
if [ "$FAIL" = "0" ]; then
  echo "TREE READY: $NAME   ship commit: ship-$NAME ($(git rev-parse --short "$SHIP"), fast-forward from production)"
  echo "It is NOT pushed. Build + gate it, then:"
  echo "    git push origin ship-$NAME:master"
else
  echo "TREE IS NOT SAFE TO DEPLOY — see the FAIL lines above." >&2
  exit 1
fi
