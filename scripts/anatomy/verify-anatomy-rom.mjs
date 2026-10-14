// GATE (13.10): how often does a model reading go past a human range of motion? Share of in-view 10 Hz frames past the
// norm + MARGIN (norms: the AAOS clinical ranges, active ROM; weight-bearing ankle dorsiflexion and the deep-squat knee
// given room). PASS: no flexion / abduction / deviation / side-bend reading past it in over 8% of its frames. Twists
// (rot, toeOut, inv) are listed but not gated - one camera cannot measure them; the app marks them ~ (estimated).
// It found, 13.10: shoulder 'adduction' -57..-148 in 24.6% (arms crossed after a turn, lift2d) and wrist radial
// deviation to -73 in 16.4% (an 85 deg cone, rig limitWrist) - both FAIL here before their fixes.
import fs from 'node:fs';
import os from 'node:os';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { buildTrack } from '../../src/anatomy/rig.js';
import { frameToPoints3D } from '../../src/poseLab.js';
import { modelJointAxes } from '../../src/anatomy/jointAxes.js';
import { clipTitle } from './_clipTitle.mjs';
const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const MARGIN = +(process.env.MARGIN || 15);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (x) => (x ? x.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null)) : null);
// [joint kind, field, min, max]
const NORM = [
  ['hip', 'flex', -30, 125], ['hip', 'abd', -30, 45], ['hip', 'rot', -45, 45],
  ['knee', 'flex', -10, 150], ['knee', 'rot', -40, 40], ['knee', 'valgus', -30, 30],
  ['ankle', 'dorsi', -50, 45], ['ankle', 'inv', -15, 35], ['ankle', 'toeOut', -30, 45],
  ['shoulder', 'flex', -60, 180], ['shoulder', 'abd', -30, 180], ['shoulder', 'rot', -90, 70],
  ['forearm', 'pron', -90, 90], ['wrist', 'flex', -70, 80], ['wrist', 'ulnar', -20, 30],
  ['trunk', 'flex', -30, 80], ['trunk', 'side', -35, 35], ['trunk', 'rot', -45, 45],
  ['neck', 'flex', -60, 50], ['neck', 'side', -45, 45], ['neck', 'rot', -80, 80],
];
const kindOf = (j) => j.replace(/[LR]$/, '');
const tot = {}, perClip = {};
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'));
  const fr = []; let nx = -Infinity; for (const x of o.frames) { if (!x.w || !x.l || x.t < nx) continue; fr.push({ t: x.t, landmarks: toObj(x.l), worldLandmarks: toObj(x.w) }); nx = x.t + 100; }
  const st = anatomyFrames(fr, o.dims); if (st.length < 10) continue; const other = st.otherPerson || new Set();
  const tr = buildTrack(st.filter((x) => !other.has(x.t)).map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims });
  for (let t = tr.t0; t <= tr.t1; t += 100) {
    if (tr.inView && !tr.inView(t)) continue;
    const A = modelJointAxes(tr, t);
    for (const [j, r] of Object.entries(A)) {
      if (!r.seen) continue;
      for (const [k, fld, lo, hi] of NORM) {
        if (kindOf(j) !== k || r[fld] == null) continue;
        const key = k + '.' + fld, v = r[fld]; const T = (tot[key] = tot[key] || { n: 0, lo: 0, hi: 0, worst: [] });
        T.n++; if (v < lo - MARGIN) T.lo++; if (v > hi + MARGIN) T.hi++;
        if (v < lo - MARGIN || v > hi + MARGIN) { (perClip[key] = perClip[key] || {})[f.slice(0, 3)] = ((perClip[key] || {})[f.slice(0, 3)] || 0) + 1; T.worst.push([Math.abs(v < lo ? v - lo : v - hi), f.slice(0, 3), (t / 1000).toFixed(1), j, v.toFixed(0)]); }
      }
    }
  }
}
console.log(`past the norm + ${MARGIN} deg, share of seen in-view frames (10 Hz)`);
const TWIST = /\.(rot|toeOut|inv)$/, bad = [];
for (const [key, T] of Object.entries(tot).sort((a, b) => (b[1].lo + b[1].hi) / b[1].n - (a[1].lo + a[1].hi) / a[1].n)) {
  T.worst.sort((a, b) => b[0] - a[0]);
  if (!TWIST.test(key) && (T.lo + T.hi) / T.n > 0.08) bad.push(key);
  console.log(key.padEnd(15), 'n', String(T.n).padStart(6), ' below', ((100 * T.lo) / T.n).toFixed(1).padStart(5) + '%', ' above', ((100 * T.hi) / T.n).toFixed(1).padStart(5) + '%', ' clips', JSON.stringify(perClip[key] || {}).slice(0, 90), ' worst', T.worst.slice(0, 2).map((w) => w.slice(1).join(' ')).join(' | '));
}
console.log(`verify-anatomy-rom: ${bad.length ? 'FAIL - ' + bad.join(', ') + ' past the human range in over 8% of frames' : 'PASS - every measured plane within the human range in 92%+ of frames'} (twists not gated)`);
process.exitCode = bad.length ? 1 : 0;
