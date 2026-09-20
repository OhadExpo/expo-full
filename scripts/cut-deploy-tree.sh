#!/usr/bin/env bash
# CUT THE DEPLOY TREE: everything on the branch EXCEPT the athlete portal.
#
# Ohad: "update and deploy everything anywhere except athlete portal".
#
# The hold is NOT a state of the branch. bhbc-hebrew carries the athlete work in
# full and always should; the tree is a separate cut in which four files are put
# back to what production is already running. That is why the tree has to be
# RE-CUT every time the branch moves — deploy-0919 went stale the moment the
# next commit landed, and a stale tree deploys yesterday's work while looking
# finished.
#
# The hold is exactly four files:
#   src/ClientPortal.jsx   ) the three athlete views, reset to production
#   src/MealLogger.jsx     )
#   src/TrySandbox.jsx     )
#   src/App.jsx            three <LangCtx.Provider> wraps removed — the ones
#                          that put the portal and the sandbox inside the
#                          language provider. They are the athlete-portal
#                          Hebrew fix and they ship WITH the portal, not before it.
#
# NEVER merge origin/master into the branch to do this (see the memory note):
# master descends from a tree where those files were already set back, so a
# merge re-applies the revert and silently deletes the portal work.
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
# 1. The three athlete views go back to exactly what production runs.
git checkout -q "$PROD" -- "${HELD_VIEWS[@]}"
# 2. The three LangCtx wraps in App.jsx come out. Done by exact string so it
#    fails loudly if the surrounding code changed, rather than half-applying.
node scripts/unwrap-langctx.mjs
git add "${HELD_VIEWS[@]}" src/App.jsx
git commit -q -m "$NAME: everything except the athlete portal

The three athlete views are byte-identical to production and App.jsx carries
no LangCtx wrap around them. Cut from $SRC at $(git rev-parse --short "$SRC")." || echo "(nothing to commit — already held)"

echo
echo "=== PROVING THE HOLD, not claiming it ==="
FAIL=0
for f in "${HELD_VIEWS[@]}"; do
  if git diff --quiet "$PROD" HEAD -- "$f"; then echo "  ok    byte-identical to production : $f"
  else echo "  FAIL  DIFFERS from production     : $f"; FAIL=1; fi
done
# Scoped to the PORTAL wrap. A second `<LangCtx.Provider value={lang}>` wraps
# the coach app and is supposed to be there; counting both fails a good cut.
N=$(grep -c 'if (isClient) return (<LangCtx.Provider' src/App.jsx || true)
if [ "$N" = "0" ]; then echo "  ok    0 portal LangCtx wraps in App.jsx"; else echo "  FAIL  $N portal LangCtx wrap(s) still in App.jsx"; FAIL=1; fi
CHANGED=$(git diff --name-only "$SRC" HEAD | wc -l | tr -d ' ')
echo "  $( [ "$CHANGED" = "4" ] && echo ok || echo FAIL )    $CHANGED file(s) differ from the branch (expected 4)"
[ "$CHANGED" = "4" ] || FAIL=1
echo
echo "=== what this tree SHIPS that production does not ==="
git diff --stat "$PROD" HEAD | tail -1

git checkout -q "$START"
echo
if [ "$FAIL" = "0" ]; then
  echo "TREE READY: $NAME"
  echo "It is NOT pushed. To deploy, run:"
  echo "    git push origin $NAME:master"
else
  echo "TREE IS NOT SAFE TO DEPLOY — see the FAIL lines above." >&2
  exit 1
fi
