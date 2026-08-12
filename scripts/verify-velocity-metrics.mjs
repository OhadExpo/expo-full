// Fixtures for velocityMetrics (src/poseLab.js) — the camera BAR SPEED the coach
// prescribes loads off (VBT). It was reviewed (#86/#87) but had no standalone
// fixtures; this pins the hardened contract on controlled synthetic frames:
// locked scale, peak >= mean, no fabricated baseline, and — the #87 bug class —
// a bar-drop rep gets lossPct null (never >100%) and never anchors finalLoss.
// Frames carry BOTH image landmarks (normalised) and worldLandmarks (metres) so
// frameScaleY can lock one metres-per-image-unit for the clip.
// Run: node scripts/verify-velocity-metrics.mjs
import { velocityMetrics } from '../src/poseLab.js';

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

// world SHO y=-0.50m / ANKLE y=0.50m (1.0m span); image SHO 0.30 / ANKLE 0.90
// (0.60 span) → locked scale ≈1.67 m per image-unit. wristYs = the bar proxy.
const mk = (wristYs) => wristYs.map((wy, i) => {
  const im = new Array(33).fill(null), w = new Array(33).fill(null);
  im[11] = { x: -0.1, y: 0.30, z: 0, visibility: 0.9 }; im[12] = { x: 0.1, y: 0.30, z: 0, visibility: 0.9 };
  im[27] = { x: -0.1, y: 0.90, z: 0, visibility: 0.9 }; im[28] = { x: 0.1, y: 0.90, z: 0, visibility: 0.9 };
  im[15] = { x: -0.1, y: wy, z: 0, visibility: 0.9 };   im[16] = { x: 0.1, y: wy, z: 0, visibility: 0.9 };
  w[11] = { x: -0.1, y: -0.50, z: 0, visibility: 0.9 }; w[12] = { x: 0.1, y: -0.50, z: 0, visibility: 0.9 };
  w[27] = { x: -0.1, y: 0.50, z: 0, visibility: 0.9 };  w[28] = { x: 0.1, y: 0.50, z: 0, visibility: 0.9 };
  return { t: i * 33, landmarks: im, worldLandmarks: w };
});

// ── clean concentric rep: positive mean, peak >= mean, loss 0 for the best rep ──
const one = velocityMetrics(mk([0.60, 0.57, 0.53, 0.49, 0.46, 0.44]), null, [{ startIdx: 0, bottomIdx: 0, endIdx: 5 }]);
check('clean rep -> positive meanConcentric', one && one.perRep[0].meanConcentric > 0);
check('clean rep -> peak >= mean (never physically-impossible)', one && one.perRep[0].peak >= one.perRep[0].meanConcentric);
check('best rep -> lossPct 0', one && one.perRep[0].lossPct === 0 && one.finalLossPct === 0);

// ── no worldLandmarks -> scale can't lock -> null (no fabricated velocity) ──
const noWorld = mk([0.60, 0.50, 0.44]).map((f) => ({ t: f.t, landmarks: f.landmarks }));
check('no worldLandmarks -> null (scale unlockable)', velocityMetrics(noWorld, null, [{ startIdx: 0, bottomIdx: 0, endIdx: 2 }]) === null);

// ── a whole set that is a pure bar-drop (wrist FALLS) -> null, not a bogus read ──
check('all-drop set -> null (no fabricated baseline)', velocityMetrics(mk([0.44, 0.50, 0.56, 0.60]), null, [{ startIdx: 0, bottomIdx: 0, endIdx: 3 }]) === null);

// ── #87 BUG CLASS: 2 good reps (2nd slower) + a final BAR-DROP rep. The drop must
//    read lossPct null (not a >100% junk loss) and must NOT anchor finalLossPct —
//    finalLoss should reflect the last REAL rep (rep 2), which held some speed. ──
const wristYs = [
  0.60, 0.57, 0.53, 0.49, 0.46, 0.44, // rep1 fast (idx 0-5)
  0.60, 0.58, 0.56, 0.54, 0.52, 0.50, // rep2 slower (idx 6-11)
  0.44, 0.50, 0.56, 0.60,             // rep3 BAR DROP (idx 12-15)
];
const reps = [
  { startIdx: 0, bottomIdx: 0, endIdx: 5 },
  { startIdx: 6, bottomIdx: 6, endIdx: 11 },
  { startIdx: 12, bottomIdx: 12, endIdx: 15 },
];
const set = velocityMetrics(mk(wristYs), null, reps);
check('mixed set -> read produced', set && set.perRep.length === 3);
check('rep1 faster than rep2 (loss increases)', set && set.perRep[1].meanConcentric < set.perRep[0].meanConcentric);
check('rep2 (real) -> positive lossPct vs best', set && set.perRep[1].lossPct > 0);
check('bar-drop rep -> lossPct null (never >100%)', set && set.perRep[2].lossPct === null);
check('finalLossPct anchored to last REAL rep, not the drop', set && set.finalLossPct === set.perRep[1].lossPct);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
