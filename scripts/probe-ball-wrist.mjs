// Is the origin gate failing because its reference wrist is STALE?
//
// trackBall compares every candidate seed against ONE point: the wrist at the
// DETECTED release. On shot 4 he does not let go until ~200ms later, by which
// time his arm has fully extended. This measures, per frame, how far the nearest
// blob is from BOTH references — the release-frame wrist the code actually uses,
// and the wrist at that frame, which is what it should use.
//
// If the two columns diverge, the gate cannot be fixed by changing its
// threshold, because it is measuring against the wrong point.
//
// Needs a fixture with `wristTrack` (harnessBuild wristtrack-1 or later).
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!j.wristTrack || !j.wristTrack.length) {
  console.log('This fixture has no wristTrack — regenerate it with the current harness.');
  console.log('Nothing was measured.');
  process.exit(2);
}
const relWrist = { x: j.wrist[0], y: j.wrist[1] };
const wristAt = new Map(j.wristTrack.map(([t, x, y]) => [t, (x == null ? null : { x, y })]));

console.log(`shot ${j.index} · detected release t=${j.releaseT} · refusal: ${JSON.stringify(j.why && j.why.why)}`);
console.log('');
console.log('   t      nearest blob → RELEASE wrist    → wrist AT THAT FRAME    wrist moved');
let diverged = 0;
for (const f of j.frames) {
  const now = wristAt.get(f.t);
  let dRel = Infinity, dNow = Infinity;
  for (const [x, y, w, h] of f.b) {
    const px = Math.max((w + h) / 2, 1e-9);
    dRel = Math.min(dRel, Math.hypot(x - relWrist.x, y - relWrist.y) / px);
    if (now) dNow = Math.min(dNow, Math.hypot(x - now.x, y - now.y) / px);
  }
  const moved = now ? Math.hypot(now.x - relWrist.x, now.y - relWrist.y) : null;
  const movedBalls = now ? (moved / 0.026).toFixed(1) : '-';
  if (now && Math.abs(dRel - dNow) > 1.5) diverged++;
  console.log(`  ${String(f.t).padEnd(7)} ${dRel.toFixed(1).padStart(8)} ball ø            ${(now ? dNow.toFixed(1) : '-').padStart(8)} ball ø        ${String(movedBalls).padStart(5)} ball ø`);
}
console.log('');
console.log(`frames where the two references disagree by >1.5 ball diameters: ${diverged} of ${j.frames.length}`);
console.log(diverged
  ? 'The reference IS stale — the gate cannot be fixed by tuning its threshold.'
  : 'The two references agree; staleness is not the problem here.');
