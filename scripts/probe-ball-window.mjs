// Does the tracking WINDOW start too early on shot 4?
//
// The frames show he does not release until ~200ms after the detected release,
// while the previous shot's ball sails past at apex. If the window start is the
// second problem, dropping the first N frames should surface the real arc.
// Fixture is normalised; launchAngle works in PIXELS, so scale by 1000.
import fs from 'node:fs';
import { trackBall, launchAngle } from '../src/ballTrack.js';

const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const K = 1000;
const all = j.frames.map((f) => ({
  t: f.t,
  blobs: f.b.map(([x, y, w, h]) => ({ x: x * K, y: y * K, w: w * K, h: h * K, n: 1 })),
}));
const origin = { x: j.wrist[0] * K, y: j.wrist[1] * K };
console.log('shot', j.index, '| frames', all.length, '| t', all[0].t, '->', all[all.length - 1].t);
console.log('');
console.log('dropFirst  t0      maxOrigin   n    result');
for (const drop of [0, 4, 6, 8, 10]) {
  const frames = all.slice(drop);
  if (frames.length < 8) continue;
  for (const mo of [9, 5, 3]) {
    const tr = trackBall(frames, { origin, maxOriginBalls: mo });
    if (!tr) { console.log(`   ${String(drop).padStart(2)}     ${frames[0].t}      ${String(mo).padStart(2)}       -    no track`); continue; }
    const out = {};
    const la = launchAngle(tr.points, null, tr.ballPx, out);
    const verdict = la == null ? `REFUSED: ${out.why}` : `*** deg ${la.toFixed(1)} ***`;
    console.log(`   ${String(drop).padStart(2)}     ${frames[0].t}      ${String(mo).padStart(2)}      ${String(tr.points.length).padStart(2)}   ${verdict}`);
  }
}
