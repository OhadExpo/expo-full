// Fixtures for the TRAILING RE-RACK gate in velocityMetrics (src/poseLab.js) — #242.
// A tiny-but-POSITIVE concentric at the END of a set (e.g. 0.07 m/s after six
// real ~0.4 m/s reps) is the bar being set down / re-racked, NOT a working rep.
// Left alone it (a) inflates the rep count and (b) becomes the finalLossPct
// anchor → a false "deep fatigue / huge velocity-loss" verdict. This pins the
// honest contract: a TRAILING re-rack (positive but < RERACK_FLOOR_MS AND far
// under the set's best effort) is flagged rerack:true, gets lossPct:null (never
// anchors finalLoss), and is subtracted from the reported repCount — while a
// fatigued real last rep, a legitimately light set, and any interior slow rep
// all SURVIVE untouched.
//
// Frames carry BOTH image landmarks (normalised) and worldLandmarks (metres) so
// frameScaleY locks ONE metres-per-image-unit for the clip. world SHO y=-0.50m /
// ANKLE y=0.50m (1.0m span); image SHO 0.30 / ANKLE 0.90 (0.60 span) → locked
// scale = 1/0.6 ≈ 1.667 m per image-unit. wristY = the bar proxy; the wrist
// moving UP (image y DECREASING) is a positive concentric.
// Run: node scripts/verify-rerack-gate.mjs
import { velocityMetrics } from '../src/poseLab.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

const SCALE = 1 / 0.6;   // metres per image-unit (worldSpan 1.0 / imageSpan 0.60)
const FRAME_MS = 33;     // t = i*33ms → dt between frames = 0.033s

// Build a frames array from image wrist-Y positions (mirrors verify-velocity-metrics.mjs).
const mk = (wristYs) => wristYs.map((wy, i) => {
  const im = new Array(33).fill(null), w = new Array(33).fill(null);
  im[11] = { x: -0.1, y: 0.30, z: 0, visibility: 0.9 }; im[12] = { x: 0.1, y: 0.30, z: 0, visibility: 0.9 };
  im[27] = { x: -0.1, y: 0.90, z: 0, visibility: 0.9 }; im[28] = { x: 0.1, y: 0.90, z: 0, visibility: 0.9 };
  im[15] = { x: -0.1, y: wy, z: 0, visibility: 0.9 };   im[16] = { x: 0.1, y: wy, z: 0, visibility: 0.9 };
  w[11] = { x: -0.1, y: -0.50, z: 0, visibility: 0.9 }; w[12] = { x: 0.1, y: -0.50, z: 0, visibility: 0.9 };
  w[27] = { x: -0.1, y: 0.50, z: 0, visibility: 0.9 };  w[28] = { x: 0.1, y: 0.50, z: 0, visibility: 0.9 };
  return { t: i * FRAME_MS, landmarks: im, worldLandmarks: w };
});

// Build frames + rep index-triples from per-rep target mean velocities.
// Each rep is `n` frames descending linearly so the mean concentric == v exactly
// (mean uses only the bottom/top endpoints; a linear ramp keeps peak >= mean).
// Each rep restarts from the same top — the inter-rep gap is never read (per-rep
// metrics only span bottomIdx→endIdx).
const REP_FRAMES = 6;
function build(vs) {
  const wristYs = [];
  const reps = [];
  const TOP = 0.60;
  let idx = 0;
  for (const v of vs) {
    const n = REP_FRAMES;
    const dtSec = (n - 1) * FRAME_MS / 1000;
    const totalUp = (v * dtSec) / SCALE;   // total image-y DECREASE over the rep
    const step = totalUp / (n - 1);
    const bottomIdx = idx;
    for (let j = 0; j < n; j++) wristYs.push(TOP - step * j);
    reps.push({ startIdx: bottomIdx, bottomIdx, endIdx: idx + n - 1 });
    idx += n;
  }
  return { frames: mk(wristYs), reps };
}

// analyzeClip reports repCount = jointRepCount - rerackCount (joint path).
// We exercise velocityMetrics directly (the function under test) and assert the
// reported count via that exact arithmetic.
const reported = (reps, vm) => Math.max(0, reps.length - (vm?.rerackCount || 0));

// ── (a) six real ~0.4 m/s reps + a 7th at 0.07 m/s re-rack ──────────────────
{
  const { frames, reps } = build([0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.07]);
  const vm = velocityMetrics(frames, null, reps);
  check('(a) read produced, 7 perRep entries', vm && vm.perRep.length === 7);
  check('(a) rep7 flagged rerack:true', vm && vm.perRep[6].rerack === true);
  check('(a) rep7 lossPct null (never anchors finalLoss)', vm && vm.perRep[6].lossPct === null);
  check('(a) rerackCount === 1', vm && vm.rerackCount === 1);
  check('(a) reported repCount 6 (not 7)', reported(reps, vm) === 6);
  check('(a) rep6 (real) survives with lossPct present', vm && vm.perRep[5].lossPct != null && vm.perRep[5].rerack !== true);
  check('(a) finalLossPct anchored to rep6 (small)', vm && vm.finalLossPct === vm.perRep[5].lossPct && vm.finalLossPct <= 5);
  check('(a) re-rack did not anchor bestMean', vm && vm.bestMean >= 0.40);
}

// ── (b) fatigued-but-real last rep (best 0.45, last 0.20) → NOT stripped ────
{
  const { frames, reps } = build([0.45, 0.42, 0.38, 0.30, 0.25, 0.20]);
  const vm = velocityMetrics(frames, null, reps);
  check('(b) rerackCount 0 (fatigue is not a re-rack)', vm && vm.rerackCount === 0);
  check('(b) last rep NOT flagged rerack', vm && vm.perRep[5].rerack !== true);
  check('(b) last rep lossPct present (real fatigue read survives)', vm && vm.perRep[5].lossPct != null);
  check('(b) reported repCount unchanged (6)', reported(reps, vm) === 6);
  check('(b) finalLossPct = last real rep loss (> 0)', vm && vm.finalLossPct === vm.perRep[5].lossPct && vm.finalLossPct > 0);
}

// ── (c) light CONTROLLED set (best ~0.15), last 0.10 → relative gate protects ─
{
  const { frames, reps } = build([0.15, 0.15, 0.14, 0.13, 0.12, 0.10]);
  const vm = velocityMetrics(frames, null, reps);
  // last mean 0.10 IS below the 0.12 absolute floor, but 0.10 is NOT below
  // 0.35*best(0.15)=0.0525 → the relative gate keeps it a real (light) rep.
  check('(c) light set: rerackCount 0 (relative gate protects)', vm && vm.rerackCount === 0);
  check('(c) last rep NOT stripped', vm && vm.perRep[5].rerack !== true && vm.perRep[5].lossPct != null);
  check('(c) reported repCount unchanged (6)', reported(reps, vm) === 6);
}

// ── (d) two trailing re-racks (reps 6 & 7 both < 0.12) → both stripped ──────
{
  const { frames, reps } = build([0.40, 0.40, 0.40, 0.40, 0.40, 0.10, 0.07]);
  const vm = velocityMetrics(frames, null, reps);
  check('(d) both trailing re-racks flagged', vm && vm.perRep[5].rerack === true && vm.perRep[6].rerack === true);
  check('(d) both stripped: lossPct null', vm && vm.perRep[5].lossPct === null && vm.perRep[6].lossPct === null);
  check('(d) rerackCount === 2', vm && vm.rerackCount === 2);
  check('(d) reported repCount 5', reported(reps, vm) === 5);
  check('(d) rep5 (real) untouched', vm && vm.perRep[4].rerack !== true && vm.perRep[4].lossPct != null);
}

// ── (e) INTERIOR slow rep (rep3 slow, reps 4-6 fast) → interior NOT stripped ─
{
  const { frames, reps } = build([0.40, 0.40, 0.08, 0.40, 0.40, 0.40]);
  const vm = velocityMetrics(frames, null, reps);
  check('(e) interior slow rep NOT flagged rerack', vm && vm.perRep[2].rerack !== true);
  check('(e) interior slow rep keeps lossPct (real, just slow)', vm && vm.perRep[2].lossPct != null);
  check('(e) rerackCount 0 (walk stops at fast last rep)', vm && vm.rerackCount === 0);
  check('(e) reported repCount unchanged (6)', reported(reps, vm) === 6);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
