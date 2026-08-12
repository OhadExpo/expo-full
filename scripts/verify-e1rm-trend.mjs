// Fixtures for e1rmTrend (src/lineageAnalysis.js) — the strength-direction read
// that drives the POSITIVE (progressing) / NEGATIVE (regressing) split the coach
// acts on. A false 'down' fires a phantom "back off"; a false 'up' hides a real
// slip. Pins the direction thresholds AND the three hardening guards:
//   repNoisy         — a wide rep swing makes the e1RM slope a rep artifact.
//   single-outlier   — a direction resting on one PR/back-off day is not a trend.
//   intensification  — e1RM 'down' while load holds AND reps are hit = a rep-
//                      scheme peak (5->3->1), not weakening.
// Run: node scripts/verify-e1rm-trend.mjs
import { e1rmTrend } from '../src/lineageAnalysis.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
// series rows: { e1, reps, load, prescribedReps }. e1 drives the slope; the rest feed guards.
const S = (e1s, reps, loads, presc) => e1s.map((e1, i) => ({
  e1, reps: reps ? reps[i] : 3, load: loads ? loads[i] : 100, prescribedReps: presc ? presc[i] : undefined,
}));

// --- thin gate ---
check('2 rows -> thin (need 3)', e1rmTrend(S([100, 105])).state === 'thin');
check('empty -> thin', e1rmTrend([]).state === 'thin');

// --- clean directions (constant reps, no guard interference) ---
const up = e1rmTrend(S([100, 105, 110, 115]));
check('rising e1 -> up', up.dir === 'up' && up.state === 'ok');
check('up: latest = rounded last e1 (115)', up.latest === 115);
check('down: falling e1 -> down', e1rmTrend(S([115, 110, 105, 100])).dir === 'down');
check('near-flat e1 -> flat', e1rmTrend(S([100, 101, 100, 101])).dir === 'flat');

// --- repNoisy guard: wide rep swing => slope is a rep artifact, no direction ---
const noisy = e1rmTrend(S([100, 105, 110], [5, 3, 1]));
check('rising e1 but reps 5/3/1 (range 4) -> flat + repNoisy', noisy.dir === 'flat' && noisy.repNoisy === true);
check('reps range <3 -> not repNoisy', e1rmTrend(S([100, 105, 110], [3, 3, 2])).repNoisy === false);

// --- single-outlier robustness: a direction that reverses when one log is dropped ---
check('e1 [100,100,100,130] (one PR day) -> flat (outlier-driven)', e1rmTrend(S([100, 100, 100, 130])).dir === 'flat');
check('genuine 4-pt uptrend survives leave-one-out -> up', e1rmTrend(S([100, 106, 112, 118])).dir === 'up');

// --- rep-scheme intensification: down + load holding + hitting prescribed -> flat ---
const peak = e1rmTrend(S([120, 115, 110], [3, 3, 3], [100, 102, 104], [3, 3, 3]));
check('e1 down but load RISING + reps HIT -> flat (intensification, not weakening)', peak.dir === 'flat');
// guarded BOTH ways: real weakening (load falling) keeps down; missing reps keeps down
const weakling = e1rmTrend(S([120, 115, 110], [3, 3, 3], [104, 102, 98], [3, 3, 3]));
check('e1 down + load FALLING -> stays down (real slip)', weakling.dir === 'down');
const missing = e1rmTrend(S([120, 115, 110], [2, 2, 2], [100, 102, 104], [3, 3, 3]));
check('e1 down + MISSING prescribed reps -> stays down (real slip)', missing.dir === 'down');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
