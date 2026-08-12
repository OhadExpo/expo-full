// Fixtures for detectFaults (src/poseInsights.js) — the technique flags a coach
// reads off a filmed set (fading depth, fast eccentric, velocity cliff, short
// lockout, partial pull). A false flag erodes trust, so pin the family gates +
// the edge guards Ohad hardened: plyo depth is NOT flagged, a partial-pull fault
// needs a REAL measured elbow (never off missing data), leg/calf "press" is not
// an elbow-lockout lift, and the velocity-loss number is clamped at 90%+.
// Run: node scripts/verify-detect-faults.mjs
import { detectFaults } from '../src/poseInsights.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const knee = (m) => [{ name: 'L KNE', minDeg: m, maxDeg: 170 }, { name: 'R KNE', minDeg: m, maxDeg: 170 }];
const elb = (mn, mx) => [{ name: 'L ELB', minDeg: mn, maxDeg: mx }, { name: 'R ELB', minDeg: mn, maxDeg: mx }];
const R = (o = {}) => ({
  ok: true,
  romTempo: { collapsedCount: o.collapsed || 0, perRep: (o.eccs || []).map((e) => ({ ecc: e })) },
  velocity: o.loss == null ? null : { finalLossPct: o.loss, perRep: Array(o.velReps || 0).fill({}) },
  jointRom: o.joints || [],
});
const hasFault = (res, re) => !!res && res.faults.some((f) => re.test(f.msg));
const hasGood = (res, re) => !!res && res.good.some((g) => re.test(g));

// --- guard: no result / not ok ---
check('null result -> null', detectFaults(null, 'Back Squat') === null);
check('result not ok -> null', detectFaults({ ok: false }, 'Back Squat') === null);

// --- ROM collapse ---
check('2 collapsed reps -> range-loss fault', hasFault(detectFaults(R({ collapsed: 2 }), 'Back Squat'), /lost >15% of range/));
check('0 collapsed over 3 reps -> "full range" good', hasGood(detectFaults(R({ collapsed: 0, eccs: [1, 1, 1] }), 'Back Squat'), /Full range held/));

// --- eccentric control ---
check('fast eccentric (0.4s x3) -> "dropping fast" fault', hasFault(detectFaults(R({ eccs: [0.4, 0.4, 0.4] }), 'Back Squat'), /Dropping fast/));
check('controlled eccentric (1.2s) -> good', hasGood(detectFaults(R({ eccs: [1.2, 1.2, 1.2] }), 'Back Squat'), /Controlled/));

// --- velocity cliff + clamp ---
check('40% velocity loss -> "slower than the best" fault', hasFault(detectFaults(R({ loss: 40 }), 'Back Squat'), /slower than the best/));
check('95% loss -> shown as 90%+ (no false precision)', hasFault(detectFaults(R({ loss: 95 }), 'Back Squat'), /90%\+/));
check('12% loss over 3 reps -> "bar speed held" good', hasGood(detectFaults(R({ loss: 12, velReps: 3 }), 'Back Squat'), /Bar speed held/));

// --- squat depth (family-gated) ---
check('squat knee stops at 110° -> "stopping high" fault', hasFault(detectFaults(R({ joints: knee(110) }), 'Back Squat'), /Stopping high/));
check('squat knee to 90° -> "hitting depth" good', hasGood(detectFaults(R({ joints: knee(90) }), 'Back Squat'), /Hitting depth/));
check('PLYO (depth jump) shallow knee -> NOT flagged (intended stimulus)', !hasFault(detectFaults(R({ joints: knee(110) }), 'Depth Jump'), /Stopping high/));

// --- press lockout ---
check('bench short lockout (elbow 140°) -> fault', hasFault(detectFaults(R({ joints: elb(60, 140) }), 'Bench Press'), /Short lockout/));
check('bench full lockout (elbow 170°) -> good', hasGood(detectFaults(R({ joints: elb(60, 170) }), 'Bench Press'), /Full lockout/));
check('LEG press with elbow data -> NOT an elbow-lockout lift (word boundary)', !hasFault(detectFaults(R({ joints: elb(60, 140) }), 'Leg Press'), /Short lockout/));

// --- pull partial (Ohad #95: only on a REAL measured elbow) ---
check('row elbow only to 90° -> "partial pull" fault', hasFault(detectFaults(R({ joints: elb(90, 160) }), 'Barbell Row'), /Partial pull/));
check('row with NO elbow tracked -> NO false partial-pull fault', !hasFault(detectFaults(R({ joints: knee(120) }), 'Barbell Row'), /Partial pull/));

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
