// Fixtures for velocityProfileShift (src/velocityProfileShift.js) — reads whether
// a block made the athlete more FORCEFUL (line shifted right: more load at a shared
// velocity) or more FAST (intercept v0 up). A wrong verdict would misdirect the
// next block's emphasis, so pin the two axes, the dead-band, and the thin guard.
// Run: node scripts/verify-velocity-profile-shift.mjs
import { velocityProfileShift } from '../src/velocityProfileShift.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const near = (a, b, t = 0.6) => a != null && Math.abs(a - b) <= t;

// Baseline profile: v = 1.0 − 0.005·load  → load@0.5 m/s = 100, v0 = 1.0
const BEFORE = [{ load: 80, velocity: 0.60 }, { load: 120, velocity: 0.40 }];

// --- thin: a window that can't be fit (one load) ---
check('one window unfittable -> thin', velocityProfileShift(BEFORE, [{ load: 100, velocity: 0.5 }], 0.30).state === 'thin');
check('empty after -> thin', velocityProfileShift(BEFORE, [], 0.30).state === 'thin');

// --- FORCE adaptation: shallower slope (v=1.0−0.004L) → load@0.5 rises 100→125, v0 unchanged ---
const force = velocityProfileShift(BEFORE, [{ load: 80, velocity: 0.68 }, { load: 120, velocity: 0.52 }], 0.30);
check('force block -> verdict "force"', force.state === 'ok' && force.verdict === 'force');
check('force block -> load@ref up ~25%', near(force.dLoadAtRefPct, 25));
check('force block -> v0 ~flat', near(force.dV0Pct, 0));
check('force block -> 1RM delta reported (140->175, +25%)', force.oneRMBefore === 140 && force.oneRMAfter === 175 && near(force.dRmPct, 25));

// --- VELOCITY adaptation: intercept up (v=1.1−0.006L) → v0 +10%, load@0.5 unchanged ---
const vel = velocityProfileShift(BEFORE, [{ load: 80, velocity: 0.62 }, { load: 120, velocity: 0.38 }], 0.30);
check('velocity block -> verdict "velocity"', vel.state === 'ok' && vel.verdict === 'velocity');
check('velocity block -> v0 up ~10%', near(vel.dV0Pct, 10));
check('velocity block -> load@ref ~flat', near(vel.dLoadAtRefPct, 0));

// --- BALANCED gain: both up (v=1.1−0.00545L → v0 +10%, load@0.5 +10%) ---
const bal = velocityProfileShift(BEFORE, [{ load: 80, velocity: 0.664 }, { load: 120, velocity: 0.446 }], 0.30);
check('balanced block -> verdict "balanced-gain"', bal.state === 'ok' && bal.verdict === 'balanced-gain');

// --- REGRESSED: steeper slope (v=1.0−0.006L) → load@0.5 falls 100→83 ---
const reg = velocityProfileShift(BEFORE, [{ load: 80, velocity: 0.52 }, { load: 120, velocity: 0.28 }], 0.30);
check('weaker block -> verdict "regressed"', reg.state === 'ok' && reg.verdict === 'regressed');

// --- FLAT: identical profile → no meaningful move ---
const flat = velocityProfileShift(BEFORE, [{ load: 80, velocity: 0.60 }, { load: 120, velocity: 0.40 }], 0.30);
check('identical profile -> verdict "flat"', flat.state === 'ok' && flat.verdict === 'flat');
check('flat -> both deltas ~0', near(flat.dLoadAtRefPct, 0) && near(flat.dV0Pct, 0));

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
