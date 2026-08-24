// Regression test for audit #31 — a couple's identically-named plans must not
// cross-contaminate, WITHOUT regressing the ordinary single-athlete case.
import { isLogOfPlan, duplicatePlanNames } from '../src/planLogMatch.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  if (got === want) pass++;
  else { fail++; console.log(`  ✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

console.log('PLAN/LOG MATCH — audit #31\n');

const planA = { id: 'pl_a', name: 'Block #12' };
const planB = { id: 'pl_b', name: 'Block #12' };   // the other couple member
const solo  = { id: 'pl_s', name: 'Block #4' };
const dup = duplicatePlanNames([planA, planB, solo]);

t('duplicate names detected', dup.has('Block #12'), true);
t('unique name not flagged', dup.has('Block #4'), false);

// --- the couple collision, which is the whole point ------------------------
t('member A log matches A', isLogOfPlan({ planId: 'pl_a', planName: 'Block #12' }, planA, dup), true);
t('member A log does NOT match B', isLogOfPlan({ planId: 'pl_a', planName: 'Block #12' }, planB, dup), false);
t('member B log matches B', isLogOfPlan({ planId: 'pl_b', planName: 'Block #12' }, planB, dup), true);

// --- the ordinary case must be untouched -----------------------------------
t('solo: name matches, no ids anywhere', isLogOfPlan({ planName: 'Block #4' }, solo, dup), true);
t('solo: different name never matches', isLogOfPlan({ planName: 'Block #3' }, solo, dup), false);

// A block deleted and recreated under the SAME name keeps its history: the name
// is still the link because that name is not duplicated.
t('recreated block keeps its history', isLogOfPlan({ planId: 'pl_OLD', planName: 'Block #4' }, solo, dup), true);

// --- rows written before plan_id existed ------------------------------------
t('legacy row in a duplicated name still matches (cannot do better)',
  isLogOfPlan({ planName: 'Block #12' }, planA, dup), true);
t('plan without an id falls back to the name',
  isLogOfPlan({ planId: 'pl_a', planName: 'Block #12' }, { name: 'Block #12' }, dup), true);

// --- degenerate ------------------------------------------------------------
t('null row', isLogOfPlan(null, planA, dup), false);
t('null plan', isLogOfPlan({ planName: 'x' }, null, dup), false);
t('no dupNames supplied -> pure name match', isLogOfPlan({ planId: 'pl_a', planName: 'Block #12' }, planB, null), true);

console.log(`\nPLAN/LOG MATCH: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
