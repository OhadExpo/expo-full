// Fixtures for detectAsymmetry (src/poseInsights.js) — the RAW left/right ROM
// imbalance that becomes the injury flag. A fabricated flag (one side simply not
// working read as a "90% imbalance") is a wrong clinical nudge, so pin the
// anti-fabrication guards: unilateral lifts excluded, both sides must actually
// move (min ROM >=30), implausible gaps (>=55%) rejected as a laterality
// artifact, and only the joints that DRIVE the lift are screened.
// Run: node scripts/verify-detect-asymmetry.mjs
import { detectAsymmetry } from '../src/poseInsights.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
// jointRom rows analyzeClip produces: { name, romDeg }. Helper for a knee pair.
const knees = (l, r) => [{ name: 'L KNE', romDeg: l }, { name: 'R KNE', romDeg: r }];

// --- empty / null ---
check('null jointRom -> null', detectAsymmetry(null, 'Back Squat') === null);
check('empty jointRom -> null', detectAsymmetry([], 'Back Squat') === null);

// --- unilateral lift is never an "imbalance" ---
const uni = detectAsymmetry(knees(120, 60), 'Bulgarian Split Squat');
check('unilateral lift -> flagged as unilateral, no rows', uni.unilateral === true && uni.rows.length === 0);

// --- more single-side-by-design lifts must ALSO read unilateral (no fabricated
//     flag off the deliberately-unloaded side) — adversarial review #4/#5/#8 ---
for (const [title, l, r] of [
  ['Shrimp Squat', 115, 58],
  ['Reverse Lunge', 110, 55],
  ['Walking Lunge', 100, 62],
  ['Curtsy Lunge', 105, 60],
  ['Alternating DB Curl', 100, 70],   // elbow pair, but same idea
  ['Single-Leg Step-Up', 108, 64],
]) {
  const rows = title.includes('Curl')
    ? [{ name: 'L ELB', romDeg: l }, { name: 'R ELB', romDeg: r }]
    : knees(l, r);
  const u = detectAsymmetry(rows, title);
  check(`"${title}" -> unilateral, no fabricated flag`, u && u.unilateral === true && u.rows.length === 0);
}

// --- symmetric bilateral -> a row, but severity ok / not flagged ---
const sym = detectAsymmetry(knees(120, 120), 'Back Squat');
check('symmetric knees -> asymPct 0, no flag', sym.rows[0].asymPct === 0 && sym.flagged.length === 0);

// --- moderate + high severity + weaker side ---
const mod = detectAsymmetry(knees(100, 120), 'Back Squat');
check('knees 100/120 -> ~17% MOD, weaker Left, flagged', mod.rows[0].asymPct === 17 && mod.rows[0].severity === 'mod' && mod.rows[0].weaker === 'Left' && mod.flagged.length === 1);
const high = detectAsymmetry(knees(120, 90), 'Back Squat');
check('knees 120/90 -> 25% HIGH, weaker Right', high.rows[0].asymPct === 25 && high.rows[0].severity === 'high' && high.rows[0].weaker === 'Right');

// --- GUARD: a near-static side (min ROM < 30) is NOT an imbalance (no fabricated flag) ---
check('one side barely moving (10 vs 120) -> guarded out -> null', detectAsymmetry(knees(10, 120), 'Back Squat') === null);
// --- GUARD: an implausible >=55% gap is a laterality/measurement artifact, rejected ---
check('40 vs 120 (67% gap) -> rejected as artifact -> null', detectAsymmetry(knees(40, 120), 'Back Squat') === null);

// --- only joints that DRIVE the lift are screened (knees on a bench press = ignored) ---
check('knee data on Bench Press (upper lift) -> not screened -> null', detectAsymmetry(knees(100, 120), 'Bench Press') === null);
// --- ...but the same knee data on a lower lift IS screened ---
check('same knee data on Back Squat -> screened', detectAsymmetry(knees(100, 120), 'Back Squat') !== null);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
