// Is there a FASTER arc hiding among the candidates that the tracker is not
// choosing? Refit with the blob-size gate swept, and report every distinct arc.
import fs from 'node:fs';
import { trackBall, launchAngle } from '../src/ballTrack.js';
// Accepts either input, because the docs point people at both and the original
// silently crashed on one of them:
//   1. a harness LOG containing a "BALLFRAMES [...]" line
//   2. a fixture written by shot-harness-run.mjs (scripts/fixtures/*.json),
//      which is an object with a `frames` array in the same shape
const file = process.argv[2];
if (!file) {
  console.log('Usage: node scripts/replay-ball-candidates.mjs <harness-log | fixture.json>');
  console.log('  e.g. node scripts/replay-ball-candidates.mjs scripts/fixtures/ball-rejected.json');
  console.log('Nothing was analysed.');
  process.exit(2);
}
const txt = fs.readFileSync(file, 'utf8');
let pts = null;
const line = txt.split('\n').find((l) => l.startsWith('BALLFRAMES'));
if (line) {
  pts = JSON.parse(line.slice('BALLFRAMES '.length));
} else {
  try {
    const j = JSON.parse(txt);
    if (Array.isArray(j)) pts = j;
    else if (j && Array.isArray(j.frames)) pts = j.frames;
    if (pts && j && j.why) console.log('fixture refusal reason:', JSON.stringify(j.why.why || j.why));
  } catch { /* fall through to the error below */ }
}
if (!pts || !pts.length) {
  console.log(`No ball frames in ${file}.`);
  console.log('Expected a harness log with a BALLFRAMES line, or a fixture with a `frames` array.');
  console.log('Nothing was analysed.');
  process.exit(2);
}
const K = 1000;
const all = pts.flatMap((f) => f.b.map(([x, y, w, h]) => ({ t: f.t, w: w * K, h: h * K })));
const sizes = all.map((b) => (b.w + b.h) / 2).sort((a, b) => a - b);
console.log('candidate blobs:', all.length, '| size per-mille  min', sizes[0].toFixed(1),
  'med', sizes[sizes.length >> 1].toFixed(1), 'max', sizes[sizes.length - 1].toFixed(1));
console.log('frames with >1 candidate:', pts.filter((f) => f.b.length > 1).length, 'of', pts.length);
console.log('');
// Sweep a minimum blob size: if a bigger/faster object is being ignored, a
// higher floor should surface a different arc.
for (const minSize of [0, 15, 25, 35, 45]) {
  const frames = pts.map((f) => ({
    t: f.t,
    blobs: f.b.map(([x, y, w, h]) => ({ x: x * K, y: y * K, w: w * K, h: h * K, n: 1 }))
      .filter((b) => (b.w + b.h) / 2 >= minSize),
  })).filter((f) => f.blobs.length);
  const tr = trackBall(frames, {});
  if (!tr) { console.log(`minSize ${String(minSize).padStart(2)}  no track`); continue; }
  const out = {};
  const la = launchAngle(tr.points, null, tr.ballPx, out);
  console.log(`minSize ${String(minSize).padStart(2)}  n=${String(tr.points.length).padStart(2)} ballPx=${tr.ballPx.toFixed(1)}` +
    (la ? `  deg=${la.angleDeg.toFixed(1)} speed=${la.speedMs} rise=${la.riseM} r2=${la.fit}` : `  REFUSED: ${out.why}`));
}
