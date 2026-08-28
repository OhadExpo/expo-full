// Does anchoring the rise gate to the HAND rescue the rejected shot?
//
// Replays a saved fixture through trackBall + launchAngle twice: once the old
// way (rise measured from the first tracked blob) and once with the release
// origin passed in (rise measured from the wrist, where the ball actually
// starts). Runs offline against the fixture, so it answers in a second
// instead of re-running a two-minute clip through MediaPipe.
import fs from 'node:fs';
import { trackBall, launchAngle } from '../src/ballTrack.js';

const file = process.argv[2] || 'scripts/fixtures/ball-rejected.json';
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const pts = j.frames;
const K = 1000;
// Match the window the PRODUCT actually uses: shotAnalysis takes release ->
// release+700ms. Some saved fixtures are far wider (one spans 1534 ms), which
// runs past the landing and flattens the quadratic — so replaying the whole
// fixture answers a question the app never asks.
const WINDOW_MS = Number(process.env.WINDOW_MS || 700);
const t0f = j.releaseT ?? pts[0].t;
const frames = pts
  .filter((f) => f.t <= t0f + WINDOW_MS)
  .map((f) => ({
    t: f.t,
    blobs: f.b.map(([x, y, w, h]) => ({ x: x * K, y: y * K, w: w * K, h: h * K, n: 1 })),
  })).filter((f) => f.blobs.length);
console.log(`window: ${t0f} -> ${t0f + WINDOW_MS} ms (${frames.length} of ${pts.length} fixture frames)`);

const origin = j.wrist ? { x: j.wrist[0] * K, y: j.wrist[1] * K } : null;
console.log(`fixture: ${file}`);
console.log(`release t=${j.releaseT}  wrist=${JSON.stringify(j.wrist)}  original refusal: ${JSON.stringify((j.why || {}).why || j.why)}`);

const tr = trackBall(frames, origin ? { origin } : {});
if (!tr) { console.log('no track — nothing to compare'); process.exit(1); }
console.log(`tracked ${tr.points.length} points, fit ${tr.fit}, ballPx ${tr.ballPx.toFixed(1)}`);

const ysUp = tr.points.map((p) => -p.y);
const apex = Math.max(...ysUp);
console.log(`first tracked point (up) ${ysUp[0].toFixed(1)}   apex ${apex.toFixed(1)}   hand ${origin ? (-origin.y).toFixed(1) : 'n/a'}`);
console.log(`  climb from first point: ${((apex - ysUp[0]) / tr.ballPx).toFixed(1)} ball widths`);
if (origin) console.log(`  climb from the HAND    : ${((apex - -origin.y) / tr.ballPx).toFixed(1)} ball widths   (gate needs 1.2)`);
console.log('');

for (const [label, org] of [['WITHOUT origin (old behaviour)', null], ['WITH origin (hand-anchored)', origin]]) {
  const out = {};
  const la = launchAngle(tr.points, j.releaseT, tr.ballPx, out, org);
  const desc = !la ? `REFUSED: ${out.why}`
    : la.ascentMissing ? `TRACKED (partial) r2=${la.fit} n=${la.n} — angle/speed withheld: ${la.partialWhy}`
    : `ACCEPTED  deg=${la.angleDeg.toFixed(1)} speed=${la.speedMs} rise=${la.riseM} r2=${la.fit}`;
  console.log(`${label.padEnd(32)} ${desc}`);
}
