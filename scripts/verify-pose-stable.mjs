// verify-pose-stable.mjs - the stable 3D skeleton (5.10 #558). Pure, no network.
// Synthetic clip: a squat where MediaPipe's per-frame estimate stretches the shin,
// flips the left/right labels for one frame and drifts the feet with the hips.
// BREAK=1 runs the old display path (smoothing only) - must FAIL.
import { stabilizeWorldFrames, smoothFramesForDisplay, smoothFramesZeroPhase } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const run = process.env.BREAK === '1' ? (fr) => smoothFramesForDisplay(fr) : (fr) => stabilizeWorldFrames(fr);

// a standing body in MediaPipe world coords (metres, hip-centred, y DOWN)
const base = () => {
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));
  const set = (i, x, y, z = 0) => { p[i] = { x, y, z, visibility: 0.99 }; };
  set(11, -0.18, -0.5); set(12, 0.18, -0.5); set(13, -0.2, -0.22); set(14, 0.2, -0.22); set(15, -0.2, 0.02); set(16, 0.2, 0.02);
  set(23, -0.1, 0); set(24, 0.1, 0); set(25, -0.12, 0.42); set(26, 0.12, 0.42); set(27, -0.12, 0.84); set(28, 0.12, 0.84);
  set(29, -0.13, 0.88); set(30, 0.13, 0.88); set(31, -0.08, 0.9); set(32, 0.08, 0.9);
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) set(i, 0, -0.7);
  return p;
};
const N = 60;
const frames = [];
for (let i = 0; i < N; i++) {
  const ph = Math.sin((i / N) * Math.PI);           // one rep: down and up
  const w = base().map((q) => ({ ...q }));
  // hip-centred: as the hips sink 0.3 m and travel back, the FEET rise and move forward in this frame
  for (const k of [25, 26]) { w[k].y -= 0.12 * ph; w[k].z -= 0.18 * ph; }
  for (const k of [27, 28, 29, 30, 31, 32]) { w[k].y -= 0.3 * ph; w[k].x += 0.0; w[k].z -= 0.12 * ph; }
  // the estimate stretches the left shin by up to 20%
  const s = 1 + 0.2 * Math.abs(Math.sin(i * 1.7));
  w[27] = { ...w[27], x: w[25].x + (w[27].x - w[25].x) * s, y: w[25].y + (w[27].y - w[25].y) * s, z: w[25].z + (w[27].z - w[25].z) * s };
  frames.push({ t: i * 33.3, landmarks: w.map((q) => ({ x: 0.5 + q.x, y: 0.5 + q.y, z: 0, visibility: 0.99 })), worldLandmarks: w });
}
// frame 30: every left/right label flipped
const flip = (arr) => { const o = arr.slice(); for (const [l, r] of [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) { o[l] = arr[r]; o[r] = arr[l]; } return o; };
frames[30] = { ...frames[30], worldLandmarks: flip(frames[30].worldLandmarks), landmarks: flip(frames[30].landmarks) };

const out = run(frames);
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const shin = out.map((f) => d3(f.worldLandmarks[25], f.worldLandmarks[27]));
const cv = (() => { const m = shin.reduce((a, b) => a + b, 0) / shin.length; return Math.sqrt(shin.reduce((a, b) => a + (b - m) ** 2, 0) / shin.length) / m; })();
ok(cv < 0.01, `the left shin is one length through the clip (CV ${(cv * 100).toFixed(2)}%, raw stretched up to 20%)`);
ok(out[30].worldLandmarks[23].x < 0 && out[30].worldLandmarks[27].x < 0, `the flipped frame's left hip and ankle are back on the left (x ${out[30].worldLandmarks[23].x.toFixed(2)}, ${out[30].worldLandmarks[27].x.toFixed(2)})`);
const ank = out.map((f) => ({ x: (f.worldLandmarks[27].x + f.worldLandmarks[28].x) / 2, z: (f.worldLandmarks[27].z + f.worldLandmarks[28].z) / 2 }));
const drift = Math.max(...ank.map((a) => Math.hypot(a.x - ank[0].x, a.z - ank[0].z)));
ok(drift < 0.02, `the feet stay planted through the rep (max drift ${(drift * 100).toFixed(1)} cm; hip-centred it was 12 cm)`);
// the floor contact is whichever foot point is lowest (heel or toe), as in the code
const foot = out.map((f) => Math.max(...[27, 28, 29, 30, 31, 32].map((k) => f.worldLandmarks[k].y)));
ok(Math.max(...foot) - Math.min(...foot) < 0.02, `the lowest foot point stays on one floor height (spread ${((Math.max(...foot) - Math.min(...foot)) * 100).toFixed(1)} cm)`);
ok(frames[30].worldLandmarks[23].x > 0, 'the input frames are not mutated');
// NO BLEED FROM A HIDDEN STRETCH (11.10 review of #656): a still wrist at x 0.5, then 1 s where the
// model cannot see it and guesses 0.9 +- noise. The seen frames on either side must stay where they
// were - run straight through, the zero-lag smoother pulled them ~12% toward the guesses.
// BLEED=1 smooths with the hidden guesses treated as seen - must FAIL.
{
  const M = 100, fr = [];
  for (let i = 0; i < M; i++) {
    const hid = i >= 40 && i < 65;
    const v = hid ? 0.9 + 0.05 * Math.sin(i * 2.3) : 0.5;
    const w = base().map((q) => ({ ...q })); w[15] = { x: v, y: 0.02, z: 0, visibility: hid ? 0.1 : 0.99 };
    const l = w.map((q) => ({ x: 0.5 + q.x, y: 0.5 + q.y, z: 0, visibility: q.visibility }));
    fr.push({ t: i * 40, landmarks: l, worldLandmarks: w });
  }
  const sm = smoothFramesZeroPhase(fr, process.env.BLEED ? { minVis: 0 } : undefined);
  const edge = Math.max(...[36, 37, 38, 39, 65, 66, 67, 68].map((i) => Math.abs(sm[i].worldLandmarks[15].x - 0.5)));
  ok(edge < 0.01, `a hidden stretch does not pull the seen frames beside it (worst ${(edge * 100).toFixed(1)} cm off; 40 cm jump)`);
}
ok(stabilizeWorldFrames([]).length === 0 && stabilizeWorldFrames(null).length === 0, 'empty in, empty out');
// THE CLIP STANDS UP (11.10 #656): a standing clip filmed by a phone pitched 15° - the replay's
// legs must come out vertical; a plank (straight legs, 80° off) must be left in the camera's frame;
// joint angles do not change. BREAK=2 skips the rotation - must FAIL.
{
  const tiltX = (w, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return w.map((q) => ({ ...q, y: c * q.y - sn * q.z, z: sn * q.y + c * q.z })); };
  const mk = (deg) => Array.from({ length: 30 }, (_, i) => { const w = tiltX(base(), deg).map((q) => ({ ...q, x: q.x + 0.002 * Math.sin(i) })); return { t: i * 40, landmarks: w.map((q) => ({ x: 0.5 + q.x, y: 0.5 + q.y, z: 0, visibility: 0.99 })), worldLandmarks: w }; });
  const legTilt = (fr) => { const w = fr[15].worldLandmarks; const v = [(w[23].x + w[24].x - w[27].x - w[28].x) / 2, (w[23].y + w[24].y - w[27].y - w[28].y) / 2, (w[23].z + w[24].z - w[27].z - w[28].z) / 2]; return (Math.acos(-v[1] / Math.hypot(...v)) * 180) / Math.PI; };
  const kneeAng = (w) => { const a = w[23], b = w[25], c = w[27]; const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z]; return (Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI; };
  const up = process.env.BREAK === '2' ? false : true;
  const tilted = mk(15), o1 = stabilizeWorldFrames(tilted, { upright: up, plantFeet: false });
  ok(legTilt(tilted) > 14 && legTilt(o1) < 1, `a clip filmed 15° pitched stands up (legs ${legTilt(tilted).toFixed(1)}° -> ${legTilt(o1).toFixed(1)}° off vertical)`);
  const plank = mk(80), o2 = stabilizeWorldFrames(plank, { upright: up, plantFeet: false });
  ok(Math.abs(legTilt(o2) - legTilt(plank)) < 0.5, `a plank (straight legs 80° off) keeps the camera's frame (${legTilt(plank).toFixed(1)}° -> ${legTilt(o2).toFixed(1)}°)`);
  const raw = stabilizeWorldFrames(tilted, { upright: false, plantFeet: false });
  ok(Math.abs(kneeAng(o1[15].worldLandmarks) - kneeAng(raw[15].worldLandmarks)) < 0.01, 'the rotation leaves joint angles as they were');
}
// A FOOT ON THE FLOOR STAYS PUT (11.10 #656): a standing clip whose ankle guess wanders +-3 cm a frame
// is drawn with the foot still; a real step (0.6 m in 0.4 s) still travels; the measured points are
// kept in worldMeasured so no angle reads the drawn foot. BREAK=3 skips the pin - must FAIL.
{
  const pin = process.env.BREAK === '3' ? false : true;
  const wob = (i) => 0.03 * Math.sin(i * 2.1);
  const mk = (stepAt) => Array.from({ length: 75 }, (_, i) => {
    const w = base().map((q) => ({ ...q }));
    const step = stepAt != null ? Math.max(0, Math.min(1, (i - stepAt) / 12)) * 0.6 : 0;   // 12 frames at 30 fps = 0.4 s
    for (const k of [27, 29, 31]) { w[k].x += wob(i); w[k].z += wob(i + 1) + step; }
    w[25].z += step / 2;
    return { t: i * 33.3, landmarks: w.map((q) => ({ x: 0.5 + q.x, y: 0.5 + q.y, z: 0, visibility: 0.99 })), worldLandmarks: w };
  });
  const spread = (fr, k) => { const xs = fr.map((f) => f.worldLandmarks[k].x), zs = fr.map((f) => f.worldLandmarks[k].z); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)); };
  const still = stabilizeWorldFrames(mk(null), { plantFeet: true, smooth: false, pinFeet: pin });
  const s27 = spread(still.slice(5, 70), 27);
  ok(s27 < 0.01, `a planted foot whose guess wanders +-3 cm is drawn still (left ankle travel ${(s27 * 100).toFixed(1)} cm)`);
  // the FULL replay path (plantFeet on - with it off the pin never ran, and this check passed on a
  // version that glued the stepping foot: review 11.10). A step is read where it is unambiguous: the
  // gap between the two ankles, which the feet step's whole-body shift does not change
  const gap = (fr, i) => fr[i].worldLandmarks[27].z - fr[i].worldLandmarks[28].z;
  const stepped = stabilizeWorldFrames(mk(30), { plantFeet: true, smooth: false, pinFeet: pin });
  const steppedRaw = stabilizeWorldFrames(mk(30), { plantFeet: true, smooth: false, pinFeet: false });
  const g0 = gap(stepped, 10), g1 = gap(stepped, 65), r0 = gap(steppedRaw, 10), r1 = gap(steppedRaw, 65);
  ok(Math.abs((g1 - g0) - (r1 - r0)) < 0.06 && Math.abs(g1 - g0) > 0.5, `a real step still travels (the feet drawn ${((g1 - g0) * 100).toFixed(0)} cm further apart, measured ${((r1 - r0) * 100).toFixed(0)})`);
  const raw = stabilizeWorldFrames(mk(null), { plantFeet: true, smooth: false, pinFeet: false });
  const kept = still.every((f, i) => !f.worldMeasured || Math.abs(f.worldMeasured[25].z - raw[i].worldLandmarks[25].z) < 1e-9);
  ok(kept && still.some((f) => f.worldMeasured), 'the measured points are kept beside the drawn ones (worldMeasured)');
}

console.log(`POSE STABLE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
