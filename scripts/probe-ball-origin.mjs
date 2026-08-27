// Does the origin constraint separate the RIGHT ball from the previous shot's?
//
// Shot 4 has two balls in the air: the previous shot near its apex, and the one
// being released. The tracker picks the apex ball because it is visible for more
// frames and scores on length. maxOriginBalls exists to reject an arc that does
// not start at the hand — this sweeps it against the real fixture.
import fs from 'node:fs';
import { trackBall, launchAngle } from '../src/ballTrack.js';

const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// launchAngle works in PIXELS (its "never travelled sideways" gate compares
// against 8), so scale the normalised fixture up the same way
// replay-ball-candidates.mjs does. Passing normalised coords straight in makes
// every arc fail that gate and looks like a tracking failure.
const K = 1000;
const frames = j.frames.map((f) => ({
  t: f.t,
  blobs: f.b.map(([x, y, w, h]) => ({ x: x * K, y: y * K, w: w * K, h: h * K, n: 1 })),
}));
const origin = j.wrist ? { x: j.wrist[0] * K, y: j.wrist[1] * K } : null;
console.log('fixture:', process.argv[2].split(/[\/]/).pop(), '| shot', j.index, '| wrist', j.wrist);
console.log('refusal as shipped:', JSON.stringify(j.why && j.why.why));
console.log('');
console.log('maxOriginBalls   n   ballPx   result');
for (const m of [9, 7, 5, 4, 3, 2.5, 2, 1.5]) {
  const stats = {};
  const tr = trackBall(frames, { origin, maxOriginBalls: m, stats });
  if (!tr) { console.log(`  ${String(m).padStart(4)}          -    -       no track (farFromHand=${stats.farFromHand || 0})`); continue; }
  const out = {};
  const la = launchAngle(tr.points, null, tr.ballPx, out);
  const verdict = la == null ? `REFUSED: ${out.why}` : `deg ${la.toFixed(1)}`;
  console.log(`  ${String(m).padStart(4)}       ${String(tr.points.length).padStart(3)}   ${tr.ballPx.toFixed(1).padStart(5)}   ${verdict}`);
}
