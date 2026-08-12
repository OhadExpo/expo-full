// Fixtures for the VBT autoregulation engine the coach acts on live in the camera
// tool (src/poseInsights.js): velocityAutoreg (within-set velocity-loss stop-set)
// and warmupReadiness (between-session fixed-load readiness). The DANGEROUS
// direction is a readiness call that says "train as planned / push" when the
// athlete is actually reading well down — so the degenerate-input honesty (no
// baseline → no fabricated nudge) and the delta DIRECTION are pinned here.
// These assert the unambiguously-correct contract (honest null on bad input;
// slower-than-ref = worse), independent of the exact %-band cutoffs.
// Run: node scripts/verify-vbt-autoreg.mjs
import { velocityAutoreg, warmupReadiness } from '../src/poseInsights.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };
const perRep = (arr) => ({ perRep: arr.map((v) => ({ meanConcentric: v })), finalLossPct: null, bestMean: Math.max(...arr) });

// ── velocityAutoreg: honest thin/degenerate state ──
check('velocityAutoreg(null) -> null', velocityAutoreg(null) === null);
check('velocityAutoreg(no perRep) -> null', velocityAutoreg({ bestMean: 1 }) === null);
check('velocityAutoreg(<3 reps) -> null', velocityAutoreg(perRep([1.0, 0.9])) === null);
check('velocityAutoreg(all-junk velocities) -> null', velocityAutoreg(perRep([0, -1, 0])) === null);

// ── velocityAutoreg: a real fading set names the stop-rep in physical position ──
// ref = mean(2 fastest) = (1.0+0.95)/2 = 0.975. losses: r3=23% (>=20 power),
// r4=38% (>=30 general), none >=40. Ramp-up guard: r0 (1.0) is up to speed.
const fade = velocityAutoreg(perRep([1.0, 0.95, 0.85, 0.75, 0.60]));
check('fading set -> ok object', fade && fade.total === 5);
check('power stop @ rep 4 (first >=20% loss)', fade && fade.powerRep === 4);
check('general stop @ rep 5 (first >=30% loss)', fade && fade.generalRep === 5);
check('hyper stop = null (never crossed 40%)', fade && fade.hyperRep == null);
// A steady set (no meaningful loss) must NOT fabricate an early stop.
const steady = velocityAutoreg(perRep([1.0, 1.0, 0.99, 1.0, 0.98]));
check('steady set -> no early power/general stop', steady && steady.powerRep == null && steady.generalRep == null);

// ── warmupReadiness: no baseline / bad input -> honest null (never a nudge) ──
check('warmupReadiness(0, ref) -> null (no read)', warmupReadiness(0, { refVel: 1.0, n: 5 }) === null);
check('warmupReadiness(neg, ref) -> null', warmupReadiness(-0.5, { refVel: 1.0, n: 5 }) === null);
check('warmupReadiness(vel, null ref) -> null (no baseline)', warmupReadiness(1.0, null) === null);
check('warmupReadiness(vel, ref.refVel<=0) -> null', warmupReadiness(1.0, { refVel: 0, n: 5 }) === null);

// ── warmupReadiness: DIRECTION — slower-than-ref reads WORSE, faster/equal reads OK ──
const same = warmupReadiness(1.0, { refVel: 1.0, n: 5 });
check('today == ref -> delta ~0, tone good (train as planned)', same && Math.abs(same.deltaPct) <= 1 && same.tone === 'good');
const wayDown = warmupReadiness(0.5, { refVel: 1.0, n: 5 });
check('today 50% slower -> delta ~-50, tone bad (back off / confirm)', wayDown && wayDown.deltaPct <= -45 && wayDown.tone === 'bad');
const faster = warmupReadiness(1.2, { refVel: 1.0, n: 5 });
check('today faster than ref -> positive delta, tone good', faster && faster.deltaPct > 0 && faster.tone === 'good');

// ── warmupReadiness: low-confidence gate on a thin reference ──
check('ref n<3 -> lowConf true (thin baseline)', warmupReadiness(1.0, { refVel: 1.0, n: 1 }).lowConf === true);
check('ref n>=3 -> lowConf false', warmupReadiness(1.0, { refVel: 1.0, n: 5 }).lowConf === false);
// a STALE baseline (>8wk) down-ranks confidence even with enough sessions (review #2)
check('stale ref (n>=3 but stale) -> lowConf true', warmupReadiness(1.0, { refVel: 1.0, n: 5, stale: true }).lowConf === true);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
