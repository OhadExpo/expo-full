// Does rewarding "started at the hand" pick the RIGHT ball on shot 4?
//
// The default arc score is `pts.length + r2 - gaps*1.5`. Length dominates, since
// r2 only contributes 0..1. On shot 4 the previous shot's ball — sailing across
// an empty night sky — is visible for ~20 frames while the ball just off the
// hand manages ~11, so length wins regardless of which one started at the hand.
//
// `originBias` (opt-in, default 0) adds a reward for seeding close to the wrist.
// This sweeps it against the real fixture. Fixture is normalised; launchAngle
// works in PIXELS, so scale by 1000.
import fs from 'node:fs';
import { trackBall, launchAngle } from '../src/ballTrack.js';

const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const K = 1000;
const frames = j.frames.map((f) => ({
  t: f.t,
  blobs: f.b.map(([x, y, w, h]) => ({ x: x * K, y: y * K, w: w * K, h: h * K, n: 1 })),
}));
const origin = { x: j.wrist[0] * K, y: j.wrist[1] * K };

console.log(`shot ${j.index} · release t=${j.releaseT} · shipped refusal: ${JSON.stringify(j.why && j.why.why)}`);
console.log('');
console.log('originBias   n    startedAt(ball ø)   result');
for (const bias of [0, 3, 6, 10, 15, 25]) {
  const tr = trackBall(frames, { origin, originBias: bias });
  if (!tr) { console.log(`   ${String(bias).padStart(3)}       -          -        no track`); continue; }
  const d0 = Math.hypot(tr.points[0].x - origin.x, tr.points[0].y - origin.y) / Math.max(tr.points[0].px, 1e-9);
  const out = {};
  const la = launchAngle(tr.points, null, tr.ballPx, out);
  const verdict = la == null ? `REFUSED: ${out.why}` : `*** LAUNCH ${la.toFixed(1)}° ***`;
  console.log(`   ${String(bias).padStart(3)}      ${String(tr.points.length).padStart(2)}       ${d0.toFixed(1).padStart(5)}        ${verdict}`);
}
