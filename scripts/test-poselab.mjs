// Headless unit test for poseLab.js — the analysis math behind VBT, ROM/tempo,
// rep segmentation, and the jump test. Synthetic pose frames with KNOWN ground
// truth → assert metrics. Bundle + run:
//   npx esbuild scripts/test-poselab.mjs --bundle --platform=node --format=esm --outfile=.t.mjs && node .t.mjs
import { analyzeClip, jumpMetrics, segmentReps, channelSignal, estimateFps } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗', name, detail); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const band = (x, lo, hi) => x >= lo && x <= hi;

// World landmarks (metres, hip-centred) for the knee angle + the scale ruler.
// Image landmarks (normalized) for absolute vertical motion (velocity/jump).
function blank33() { return new Array(33).fill(null); }

// Squat: knee 170°(top)→80°(bottom)→170°, N reps. Body (bar) translates down
// then up in image space; feet (ankle) stay planted.
function squatClip({ reps = 3, fps = 30, secPerRep = 2 }) {
  const frames = []; const fpr = fps * secPerRep; const dt = 1000 / fps; let t = 0;
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < fpr; i++) {
      const depth = Math.sin((i / fpr) * Math.PI);      // 0 top → 1 bottom → 0 top
      frames.push(squatFrame({ t, kneeAngle: 170 - 90 * depth, depth }));
      t += dt;
    }
  }
  return frames;
}
function squatFrame({ t, kneeAngle, depth }) {
  // world: knee at b, thigh up to hip, shank down to ankle (sagittal x-y)
  const w = blank33();
  const rad = (kneeAngle * Math.PI) / 180;
  const knee = { x: 0, y: 0.45, z: 0 };
  const hip = { x: 0, y: 0, z: 0 };
  const ank = { x: 0.45 * Math.sin(Math.PI - rad), y: knee.y + 0.45 * Math.cos(Math.PI - rad), z: 0 };
  w[23] = { ...hip }; w[24] = { ...hip };
  w[25] = { ...knee }; w[26] = { ...knee };
  w[27] = { ...ank }; w[28] = { ...ank };
  w[11] = { x: 0, y: -0.6, z: 0 }; w[12] = { x: 0, y: -0.6, z: 0 }; // shoulders ~0.6m above hip
  w[15] = { x: 0, y: -0.55, z: 0 }; w[16] = { x: 0, y: -0.55, z: 0 };
  // image: body lowers up to 0.20 normalized at the bottom; feet planted.
  const drop = depth * 0.20;
  const im = blank33();
  im[11] = { x: 0.5, y: 0.25 + drop }; im[12] = { x: 0.5, y: 0.25 + drop };
  im[27] = { x: 0.5, y: 0.85 }; im[28] = { x: 0.5, y: 0.85 };       // ankle planted
  im[15] = { x: 0.5, y: 0.30 + drop }; im[16] = { x: 0.5, y: 0.30 + drop }; // bar tracks body
  im[23] = { x: 0.5, y: 0.55 + drop }; im[24] = { x: 0.5, y: 0.55 + drop };
  return { t, landmarks: im, worldLandmarks: w };
}

// Jump: 1s still, projectile flight h(t)=v0·t-½g·t² for T=0.5s (peak ~30.7cm),
// 1s land. Whole body (shoulder+ankle) rises by h; image converted via scale.
function jumpClip({ fps = 60 } = {}) {
  const frames = []; const dt = 1000 / fps; let t = 0;
  const g = 9.81, T = 0.5, v0 = (g * T) / 2;
  const SCALE = 2.0;                  // metres per normalized unit (worldLen/imgLen)
  const frame = (riseM) => {
    const w = blank33();
    w[11] = { x: 0, y: -0.6, z: 0 }; w[27] = { x: 0, y: 0.6, z: 0 }; // worldLen=1.2m
    const im = blank33();
    const riseNorm = riseM / SCALE;
    im[11] = { x: 0.5, y: 0.25 - riseNorm }; im[27] = { x: 0.5, y: 0.85 - riseNorm }; // imgLen=0.6 → scale 2.0
    im[28] = { x: 0.5, y: 0.85 - riseNorm };
    return { t, landmarks: im, worldLandmarks: w };
  };
  for (let i = 0; i < fps; i++) { frames.push(frame(0)); t += dt; }
  const fl = Math.round(fps * T);
  for (let i = 0; i < fl; i++) { const tt = (i / fps); frames.push(frame(Math.max(0, v0 * tt - 0.5 * g * tt * tt))); t += dt; }
  for (let i = 0; i < fps; i++) { frames.push(frame(0)); t += dt; }
  return frames;
}

console.log('poseLab.js unit tests\n');

const c = squatClip({ reps: 3, fps: 30, secPerRep: 2 });
ok('estimateFps ≈ 30', near(estimateFps(c), 30, 1), `got ${estimateFps(c)}`);

const sig = channelSignal(c, 'Back Squat');
ok('channel = knee for squat', sig.kind === 'knee', `got ${sig.kind}`);

const reps = segmentReps(sig.angle, 30);
ok('segmentReps = 3 (counts troughs, edge-safe)', reps.length === 3, `got ${reps.length}`);

const a = analyzeClip(c, 'Back Squat');
ok('analyzeClip ok', a.ok === true);
ok('repCount = 3', a.repCount === 3, `got ${a.repCount}`);
ok('velocity present (3 reps)', !!a.velocity && a.velocity.perRep.filter(Boolean).length === 3);
ok('mean concentric velocity plausible (0.1–3 m/s)', !!a.velocity && band(a.velocity.bestMean, 0.1, 3), `got ${a.velocity?.bestMean}`);
ok('velocity is positive (image-space, not ~0)', !!a.velocity && a.velocity.bestMean > 0.05, `got ${a.velocity?.bestMean}`);
ok('ROM present ≈ 90°', !!a.romTempo && near(a.romTempo.maxRom, 90, 18), `maxRom ${a.romTempo?.maxRom}`);
ok('tempo has ecc + con seconds', !!a.romTempo && a.romTempo.perRep[0] && a.romTempo.perRep[0].ecc > 0 && a.romTempo.perRep[0].con > 0);

const j = jumpMetrics(jumpClip({ fps: 60 }));
ok('jump detected', !!j, JSON.stringify(j));
ok('jump height plausible 25–36cm (true ~31)', j && band(j.heightCm, 25, 36), `got ${j?.heightCm}cm`);
ok('jump flight ≈ 500ms', j && near(j.flightMs, 500, 60), `got ${j?.flightMs}ms`);
ok('peak-rise cross-check plausible (≥20cm)', j && j.peakRiseCm >= 20, `got ${j?.peakRiseCm}cm`);

const hold = analyzeClip(squatClip({ reps: 1, fps: 30, secPerRep: 1 }), 'Plank Hold');
ok('hold/iso → 0 reps, still ok', hold.ok && hold.repCount === 0, `reps ${hold.repCount}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
