// probe-ball-size.mjs — is the tracker following the BALL, or the biggest blob?
//
// Measured 2026-08-30 on a current run: the candidate blobs on a rejected shot
// range 6.3 to 57.3 per-mille of frame width with a MEDIAN of 10.4, and the
// track the tracker selects has ballPx ~48-50. It is choosing blobs roughly
// five times the size of a typical candidate.
//
// That alone would explain every refusal seen, because the rise gate is
// expressed IN BALL WIDTHS: inflate the ball and a real climb reads as
// "it barely rose (0.0 ball widths)".
//
// This sweeps a size CEILING (the existing replay only sweeps the floor) and
// reports what arc survives at each cap, so the question "is there a ball-sized
// arc hiding in this data" gets a measured answer instead of an opinion.
//
//   node scripts/probe-ball-size.mjs <harness-log|fixture.json>
import fs from 'node:fs';
import { trackBall, launchAngle } from '../src/ballTrack.js';

const file = process.argv[2];
if (!file) { console.log('usage: node scripts/probe-ball-size.mjs <harness-log|fixture.json>'); process.exit(2); }

const txt = fs.readFileSync(file, 'utf8');
let frames = null;
const line = txt.split('\n').find((l) => l.startsWith('BALLFRAMES'));
if (line) frames = JSON.parse(line.slice('BALLFRAMES '.length));
else {
  try {
    const j = JSON.parse(txt);
    frames = Array.isArray(j) ? j : (j && j.frames) || null;
  } catch { /* reported below */ }
}
if (!frames || !frames.length) { console.log('no BALLFRAMES data in', file); process.exit(2); }

// blobs are [x, y, w, h, n] in the same x1000 units the engine uses
// BALLFRAMES stores normalised 0..1 coords; the engine scales by K before it
// ever calls trackBall, so a probe that skips that reads every blob as 0.0 wide
// and every track as "never travelled sideways". Scale first, then measure.
const K = 1000;
const sizes = [];
for (const f of frames) for (const b of (f.blobs || f.b || [])) sizes.push((Array.isArray(b) ? b[2] : b.w) * K);
sizes.sort((a, b) => a - b);
const q = (p) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p))];
console.log(`${frames.length} frames, ${sizes.length} blobs`);
console.log(`blob width  p10 ${q(0.1).toFixed(1)}  median ${q(0.5).toFixed(1)}  p90 ${q(0.9).toFixed(1)}  max ${sizes[sizes.length - 1].toFixed(1)}`);

const asObj = (b) => (Array.isArray(b)
  ? { x: b[0] * K, y: b[1] * K, w: b[2] * K, h: b[3] * K, n: b[4] ?? 1 }
  : { ...b, x: b.x * K, y: b.y * K, w: b.w * K, h: b.h * K, n: b.n ?? 1 });

console.log('\nsweeping a size CEILING (keep only blobs at or below it):');
for (const cap of [12, 16, 20, 25, 30, 40, 60, 1e9]) {
  const kept = frames.map((f) => ({
    t: f.t,
    blobs: (f.blobs || f.b || []).map(asObj).filter((b) => b.w <= cap),
  })).filter((f) => f.blobs.length);
  if (kept.length < 5) { console.log(`  cap ${String(cap).padStart(4)}  only ${kept.length} frames left`); continue; }
  const stats = {};
  const tr = trackBall(kept, { stats });
  if (!tr) { console.log(`  cap ${String(cap).padStart(4)}  no track  (${JSON.stringify(stats)})`); continue; }
  const out = {};
  const la = launchAngle(tr.points, null, tr.ballPx, out, null);
  const desc = la
    ? `ANGLE ${la.angleDeg}deg  speed ${la.speedMs ?? '-'}  rise ${la.riseM ?? '-'}  fit ${la.fit}`
    : `refused: ${out.why}`;
  console.log(`  cap ${String(cap).padStart(4)}  n=${String(tr.points.length).padStart(3)} ballPx=${tr.ballPx.toFixed(1)}  ${desc}`);
}
