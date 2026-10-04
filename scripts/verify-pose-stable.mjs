// verify-pose-stable.mjs - the stable 3D skeleton (5.10 #558). Pure, no network.
// Synthetic clip: a squat where MediaPipe's per-frame estimate stretches the shin,
// flips the left/right labels for one frame and drifts the feet with the hips.
// BREAK=1 runs the old display path (smoothing only) - must FAIL.
import { stabilizeWorldFrames, smoothFramesForDisplay } from '../src/poseLab.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const run = process.env.BREAK ? (fr) => smoothFramesForDisplay(fr) : (fr) => stabilizeWorldFrames(fr);

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
ok(stabilizeWorldFrames([]).length === 0 && stabilizeWorldFrames(null).length === 0, 'empty in, empty out');

console.log(`POSE STABLE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
