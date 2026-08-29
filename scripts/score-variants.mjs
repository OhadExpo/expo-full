// score-variants.mjs — read a shot-suite log and score it against the KNOWN
// answer, which is the only thing that makes the variant suite a test.
//
// Every v_* clip is derived from the one clip whose shot count is known (17),
// so any variant returning something else is a threshold fitted to the original
// encode rather than to shooting. clip02 and clip08 are outside footage with no
// known ground truth: they are reported, never scored, because scoring a number
// you cannot check is how a green suite starts lying.
//
//   node scripts/score-variants.mjs audit-out/variants2.log [expected]
import fs from 'node:fs';

const file = process.argv[2] || 'audit-out/variants2.log';
const EXPECTED = Number(process.argv[3] || 17);
if (!fs.existsSync(file)) { console.log(`no log at ${file}`); process.exit(2); }

const WHAT = {
  v_ref: 'reference encode',
  v_30fps: 'half the frame rate',
  v_24fps: '24 fps',
  v_480: '480p, an older phone',
  v_dark: 'a gym at night',
  v_bright: 'a court at noon',
  v_mirror: 'filmed from the other side',
  v_wide: 'stood further back',
  v_lowq: 'heavily compressed',
};

const rows = [];
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^(\/testclips\/(\S+?)\.mp4)\s+pass\s+(\d+)\s+shots=(\S+)\s+(\d+)s/);
  if (m) rows.push({ clip: m[2], pass: Number(m[3]), shots: m[4] === '-' ? null : Number(m[4]), secs: Number(m[5]) });
}
if (!rows.length) { console.log('no completed passes in that log yet'); process.exit(0); }

let graded = 0, correct = 0;
console.log(`expected ${EXPECTED} shots on every v_* variant\n`);
for (const r of rows) {
  const known = Object.prototype.hasOwnProperty.call(WHAT, r.clip);
  const note = known ? WHAT[r.clip] : 'outside footage, true count unknown';
  let verdict;
  if (!known) verdict = 'n/a';
  else if (r.shots == null) verdict = 'FAILED';
  else if (r.shots === EXPECTED) { verdict = 'ok'; correct++; graded++; }
  else { verdict = `WRONG (${r.shots})`; graded++; }
  console.log(`  ${r.clip.padEnd(10)} ${String(r.shots ?? '-').padStart(3)}  ${String(r.secs).padStart(4)}s  ${verdict.padEnd(12)} ${note}`);
}

const secs = rows.map((r) => r.secs).filter(Boolean);
const avg = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0;
console.log(`\n${correct}/${graded} variants returned ${EXPECTED} · average ${avg}s per clip`);
if (graded && correct === graded) console.log('the detector survives every framing tested.');
else if (graded) console.log('a variant disagrees with the original encode - that is a fitted threshold, not a shot.');
