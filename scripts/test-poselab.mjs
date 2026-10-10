// Headless unit test for poseLab.js — the analysis math behind VBT, ROM/tempo,
// rep segmentation, and the jump test. Synthetic pose frames with KNOWN ground
// truth → assert metrics. Bundle + run:
//   npx esbuild scripts/test-poselab.mjs --bundle --platform=node --format=esm --outfile=.t.mjs && node .t.mjs
import { analyzeClip, jumpMetrics, segmentReps, channelSignal, estimateFps, estimateView, extendedJointRom } from '../src/poseLab.js';
import { signedSagittalAt, signedDeviationAt } from '../src/repCounter.js';

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

// WHERE THE CAMERA STANDS (10.10 #639): the hip line rotated about the vertical reads as front /
// angled / side, and a clip with no visible hips or shoulders reads as unknown (null), never a guess
{
  const at = (deg) => { const r = (deg * Math.PI) / 180; const fr = []; for (let i = 0; i < 12; i++) { const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.1 })); w[23] = { x: -0.15 * Math.cos(r), y: 0, z: -0.15 * Math.sin(r), visibility: 0.9 }; w[24] = { x: 0.15 * Math.cos(r), y: 0, z: 0.15 * Math.sin(r), visibility: 0.9 }; fr.push({ t: i, worldLandmarks: w }); } return estimateView(fr); };
  ok('camera: hips across the picture = front', at(5).view === 'front');
  ok('camera: hips along the depth = side', at(88).view === 'side');
  ok('camera: 45 deg = angled, 45 off side', at(45).view === 'angled' && at(45).offSideDeg === 45);
  ok('camera: nothing visible = unknown', estimateView([{ t: 0, worldLandmarks: Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.1 })) }]) === null);
}

// THE KNEE IN THE BODY'S OWN PLANE (10.10 #639 stage 2): a leg bent through flexion and a few
// degrees of hyperextension reads the same whichever way the camera stood; the old x,y read
// shrinks as the body turns. A front-on clip is refused for over-extension.
{
  // hips on the x axis (body facing -z at yaw 0 = side-on to a camera looking along z... the
  // hip axis along the camera depth), knee straight below, the shank swung forward/back by `bend`
  const legAt = (bendDeg, yawDeg) => {
    const y = (yawDeg * Math.PI) / 180, rot = (x, z) => ({ x: x * Math.cos(y) - z * Math.sin(y), z: x * Math.sin(y) + z * Math.cos(y) });
    const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.9 }));
    // body frame: hip axis = z (side-on to the camera at yaw 0), sagittal plane = x,y
    const put = (i, bx, by, bz) => { const r = rot(bx, bz); w[i] = { x: r.x, y: by, z: r.z, visibility: 0.9 }; };
    const b = (bendDeg * Math.PI) / 180;
    for (const [hip, knee, ank, side] of [[23, 25, 27, -0.1], [24, 26, 28, 0.1]]) {
      put(hip, 0, -0.45, side); put(knee, 0, 0, side);
      put(ank, -0.45 * Math.sin(b), 0.45 * Math.cos(b), side);   // positive bend = shank back (flexion)
    }
    put(11, 0, -0.95, -0.18); put(12, 0, -0.95, 0.18);
    return w;
  };
  let maxErr = 0, oldShrink = 0;
  for (const yaw of [0, 20, 40, 60]) {
    const f = signedSagittalAt(legAt(60, yaw), 23, 25, 27), h = signedSagittalAt(legAt(-8, yaw), 23, 25, 27);
    maxErr = Math.max(maxErr, Math.abs(Math.abs(f) - 60), Math.abs(Math.abs(h) - 8));
    if (Math.sign(f) === Math.sign(h)) maxErr = 99;   // flexion and hyperextension must have opposite signs
    const o = signedDeviationAt(legAt(-8, yaw), 23, 25, 27);
    oldShrink = Math.max(oldShrink, 8 - Math.abs(o));
  }
  ok('knee sagittal: 60 flexion / 8 hyperextension read within 0.5 deg at yaw 0-60', maxErr < 0.5, `max err ${maxErr.toFixed(2)}`);
  ok('knee sagittal: the old x,y read shrinks the 8 deg as the body turns (why this exists)', oldShrink > 3, `shrink ${oldShrink.toFixed(1)}`);
  ok('knee sagittal: left and right legs bend with the same sign', Math.sign(signedSagittalAt(legAt(40, 30), 23, 25, 27)) === Math.sign(signedSagittalAt(legAt(40, 30), 24, 26, 28)));
  // a squat-like clip: 0 -> 70 -> -6 deg, the lockout held
  const clip = (yaw) => Array.from({ length: 48 }, (_, i) => {
    const bend = i < 20 ? (70 * i) / 19 : i < 40 ? 70 - (76 * (i - 20)) / 19 : -6;   // hold the lockout
    const w = legAt(bend, yaw);
    return { t: i * 33, worldLandmarks: w, landmarks: w.map((p) => ({ ...p, x: 0.5 + p.x * 0.3, y: 0.5 + p.y * 0.3 })) };
  });
  const side = extendedJointRom(clip(0)).find((e) => e.name === 'L KNE±');
  const turned = extendedJointRom(clip(40)).find((e) => e.name === 'L KNE±');
  ok('knee over-extension: side-on and 40 deg turned agree (6 deg)', side && turned && side.overExtDeg === 6 && turned.overExtDeg === 6, `side ${side && side.overExtDeg} turned ${turned && turned.overExtDeg}`);
  // a left/right label swap the upstream repair missed (6 frames mid-ascent) must not
  // flip flexion into a hyperextension
  const swapped = clip(0).map((f, i) => {
    if (i < 30 || i > 35) return f;
    const sw = (arr) => { const o = arr.slice(); for (const [l, r] of [[23, 24], [25, 26], [27, 28]]) { o[l] = arr[r]; o[r] = arr[l]; } return o; };
    return { ...f, worldLandmarks: sw(f.worldLandmarks), landmarks: sw(f.landmarks) };
  });
  const sk = extendedJointRom(swapped).find((e) => e.name === 'L KNE±');
  ok('knee over-extension: a missed L/R swap does not read as hyperextension', sk && sk.overExtDeg === 6, `over ${sk && sk.overExtDeg}`);
  const front = extendedJointRom(clip(90));
  ok('knee over-extension: a front-on clip is refused, not guessed', !front.some((e) => /KNE/.test(e.name)), JSON.stringify(front.map((e) => e.name)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
