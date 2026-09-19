#!/usr/bin/env bash
# #78 PART 2 — "then show me on a local host what's left to deploy".
#
# Run this AFTER the deploy lands. What is left at that point is exactly the
# athlete portal, which deploy-0919 held at production, so every pair is
# production as it stands right now (left) beside this branch (right), from a
# real athlete's seat, in Hebrew, at the width a phone actually has.
#
# PROD is the live site on purpose - there is no need to build and serve a
# second copy of production locally, and the live site is the thing he would
# compare against anyway.
#
# BRANCH must be serving the BHBC-HEBREW build, not the deploy tree: the point
# of the page is to show what the deploy left behind.
#
#   git checkout bhbc-hebrew && npm run build      # 4173/5199 serve dist
#   bash scripts/whats-left-page.sh
set -u
export BRANCH="${BRANCH:-http://127.0.0.1:5199}"
export PROD="${PROD:-https://expo-app.co.il}"
export LANG_APP=he

echo "prod   : $PROD"
echo "branch : $BRANCH"
echo

# One gate at a time on one Chrome (see mobile-audit-battery.sh for why).
LANG_APP=he W=430 MANIFEST=pairs-he-phone.json \
  JOBS="athlete:/athlete:portal-phone,athlete:/athlete:meal-phone:meal log|יומן אוכל" \
  node scripts/shoot-prod-vs-branch.mjs

LANG_APP=he MANIFEST=pairs-he.json \
  JOBS="athlete:/athlete:portal" \
  node scripts/shoot-prod-vs-branch.mjs

LANG_APP=he W=430 MANIFEST=pairs-athlete-more.json \
  JOBS="athlete:/athlete:history-phone:history|היסטוריה,athlete:/athlete:prs-phone:^(prs|שיאים)$,athlete:/athlete:messages-phone:messages|הודעות,athlete:/athlete:bw-phone:^(bw|משקל)$" \
  node scripts/shoot-prod-vs-branch.mjs

LANG_APP=he W=430 MANIFEST=pairs-demo.json \
  JOBS="athlete:/demo/athlete:demo-athlete-he" \
  node scripts/shoot-prod-vs-branch.mjs

node scripts/build-athlete-left.mjs

# A pair where one side is blank is not a comparison, it is a missing
# screenshot - and a page full of those would say "nothing left to deploy",
# which is the opposite of the truth. Say so instead.
node -e "
const fs=require('fs');
let thin=0,total=0;
for (const f of ['pairs-he.json','pairs-he-phone.json','pairs-athlete-more.json','pairs-demo.json']) {
  let rows=[]; try { rows=JSON.parse(fs.readFileSync('audit-out/pairs/'+f,'utf8')); } catch { continue; }
  for (const r of rows) {
    total++;
    const a=(r.before&&r.before.chars)||0, b=(r.after&&r.after.chars)||0;
    if (a<200||b<200) { thin++; console.log('THIN PAIR  '+r.name+'  live '+a+' chars, branch '+b); }
  }
}
console.log(total+' pairs, '+thin+' of them thin');
"

echo
echo "serve it:  node scripts/serve-page.mjs audit-out/athlete-left.html 4182"
