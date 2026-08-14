// Regression fixtures for poseLab.broadJumpMetrics — standing broad-jump
// horizontal distance (cm), scaled by the athlete's stature. The scale math is
// the honesty-critical part (image x is width-normalised, the stature ruler is
// height-normalised → the frame aspect must reconcile them), plus the guards
// (no real jump → null; unknown height → world-pose estimate flagged approximate).
// Run: node scripts/verify-broad-jump.mjs
import { broadJumpMetrics } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); c ? pass++ : fail++; };
const near = (n, got, want, tol = 3) => {
  const c = got != null && Number.isFinite(got) && Math.abs(got - want) <= tol;
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : `\n   got ${got} want ${want}±${tol}`}`);
  c ? pass++ : fail++;
};

const P = (x, y) => ({ x, y, z: 0, visibility: 1 });
// A standing body whose FEET are centred at image-x `fx`. Head y≈0.10, feet
// y≈0.90 → stature = 0.80 image-y-units. foot_index carries the horizontal read.
const bodyAt = (fx) => ({
  0: P(fx, 0.10), 7: P(fx - 0.02, 0.12), 8: P(fx + 0.02, 0.12),
  27: P(fx, 0.85), 28: P(fx, 0.85), 29: P(fx - 0.03, 0.90), 30: P(fx + 0.03, 0.90),
  31: P(fx + 0.05, 0.88), 32: P(fx + 0.05, 0.88),
});
const lm = (over) => { const a = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 })); for (const k in over) a[k] = over[k]; return a; };
// start-still at fx=0.25 (toe 0.30) → landing-still at fx=0.65 (toe 0.70): Δ=0.40 x-units
const clip = () => {
  const f = [];
  for (let i = 0; i < 6; i++) { const l = lm(bodyAt(0.25)); f.push({ t: i * 100, landmarks: l, worldLandmarks: l }); }
  for (let i = 6; i < 12; i++) { const l = lm(bodyAt(0.65)); f.push({ t: i * 100, landmarks: l, worldLandmarks: l }); }
  return f;
};

// square frame (aspect 1), known height 180cm: cm/y-unit = 180/0.80 = 225 → 0.40·225 = 90cm
{
  const f = clip(); f.dims = { w: 1000, h: 1000 };
  const bj = broadJumpMetrics(f, { heightCm: 180 });
  near('square frame + known height 180cm → ~90cm', bj && bj.distanceCm, 90, 4);
  ok('known height + dims → NOT approximate', !!bj && bj.approxScale === false);
}
// wide 2:1 frame doubles cm-per-x-unit → distance doubles to ~180cm (aspect reconciled)
{
  const f = clip(); f.dims = { w: 2000, h: 1000 };
  const bj = broadJumpMetrics(f, { heightCm: 180 });
  near('2:1 frame (aspect reconciled) → ~180cm', bj && bj.distanceCm, 180, 6);
}
// no known height → falls back to the metric world-pose stature, flagged approximate
{
  const f = clip(); f.dims = { w: 1000, h: 1000 };
  const bj = broadJumpMetrics(f, {});
  ok('no known height → still returns a distance', !!bj && bj.distanceCm > 0);
  ok('no known height → flagged approxScale', !!bj && bj.approxScale === true);
}
// no real horizontal displacement → null (never a fabricated distance)
{
  const f = []; for (let i = 0; i < 12; i++) { const l = lm(bodyAt(0.4)); f.push({ t: i * 100, landmarks: l, worldLandmarks: l }); }
  f.dims = { w: 1000, h: 1000 };
  ok('no horizontal jump → null', broadJumpMetrics(f, { heightCm: 180 }) === null);
}
// too few frames → null
ok('too few frames → null', broadJumpMetrics([{ t: 0, landmarks: lm(bodyAt(0.3)), worldLandmarks: lm(bodyAt(0.3)) }], { heightCm: 180 }) === null);

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
