// GATE: DOES THE BODY FACE WHERE THE PICTURE SAYS? (15.10 #717, c38: a side-on squat turned front -> side -> back in the
// model while he stood side-on). The reprojection gate cannot see it - a body turned about its own vertical axis can put
// its joints on nearly the same 2D points. The picture CAN say one thing for sure: when the shoulder line is short against
// the trunk (side-on) the body faces image-left or image-right, and the nose says which.
// Per in-view frame where the picture is clearly side-on (shoulder width < 0.25 of the trunk, nose clear of the shoulder
// midpoint by > 0.15 trunk): the model's pelvis forward, seen from the video's camera, must point the same image side and
// be mostly sideways (|forward . imageX| >= 0.5). Reports the share of such frames that disagree; FAIL above 10%.
// Same pipeline as the replay (anatomyFrames -> buildTrack) and the reprojection gate's camera.
//   DIR=<captures dir> ONLY=<prefix> node scripts/anatomy/verify-anatomy-facing.mjs      BREAK=spin turns every model 90 deg
import fs from 'node:fs';
import os from 'node:os';
import { Vector3, Quaternion } from 'three';
import { frameToPoints3D } from '../../src/poseLab.js';
import { buildTrack, sampleTrack, S, PIVOT } from '../../src/anatomy/rig.js';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { clipTitle } from './_clipTitle.mjs';

const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (a) => a.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null));
// where the camera stands, read off each clip's video (clip-views.json): a REAR view shows no nose, so its 'side-on' truth
// would be MediaPipe's own guess (c38, filmed from behind, read 50% 'wrong' against it) - not scored, and said so
const VIEWS = JSON.parse(fs.readFileSync(new URL('./clip-views.json', import.meta.url), 'utf8'));
const rows = []; let fails = 0, allSide = 0, allBad = 0, rear = 0;
for (const f of files) {
  const view = VIEWS[f.slice(0, 3)] || '';
  if (/^rear/.test(view) && !process.env.ALL_VIEWS) { rows.push(`${f.padEnd(18)} facing: not scored - filmed from behind (${view}), the picture has no nose to tell the side`); rear++; continue; }
  const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); const W = o.dims.w, H = o.dims.h;
  const raw = []; let next = -Infinity;
  for (const fr of o.frames) { if (!fr.w || !fr.l || fr.t < next) continue; raw.push({ t: fr.t, landmarks: toObj(fr.l), worldLandmarks: toObj(fr.w) }); next = fr.t + 100; }
  const st = anatomyFrames(raw, { w: W, h: H }); if (st.length < 10) continue;
  const other = st.otherPerson || new Set();
  const use = st.filter((x) => !other.has(x.t));
  const tr = buildTrack(use.map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims });
  const R = st.uprightR || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ap = (v) => new Vector3(R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]);
  const ours = (v) => new Vector3(v.x, -v.y, -v.z);
  const camX = ours(ap([1, 0, 0]));   // image right, in the model's world
  if (tr.levelQ) camX.applyQuaternion(tr.levelQ);
  const Q = PIVOT.map(() => new Quaternion()), root = new Vector3();
  let side = 0, bad = 0; const badT = [];
  for (const x of use) {
    if (tr.inView && !tr.inView(x.t)) continue;
    const L = x.landmarks; const P = (k) => (L[k] && L[k].visibility >= 0.5 ? [L[k].x * W, L[k].y * H] : null);
    const ls = P(11), rs = P(12), lh = P(23), rh = P(24), no = L[0] && L[0].visibility >= 0.5 ? [L[0].x * W, L[0].y * H] : null;   // a nose MediaPipe does not see is its guess
    if (!ls || !rs || !lh || !rh || !no) continue;
    const sm = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2], hm = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2];
    const trunk = Math.hypot(sm[0] - hm[0], sm[1] - hm[1]); if (trunk < 20) continue;
    // a standing / hinged trunk only (a lying body's 'side-on' is another question)
    if (Math.abs(sm[1] - hm[1]) < 0.6 * trunk) continue;
    const sw = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]) / trunk; const nose = (no[0] - sm[0]) / trunk;
    if (!(sw < 0.25 && Math.abs(nose) > 0.15)) continue;
    side++;
    sampleTrack(tr, x.t, Q, root);
    const fwd = new Vector3(0, 0, 1).applyQuaternion(Q[S.pelvis]);
    if (process.env.BREAK === 'spin') fwd.applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const fx = fwd.dot(camX); fwd.y = 0;
    const ok = Math.abs(fx) >= 0.5 && Math.sign(fx) === Math.sign(nose);
    if (!ok) { bad++; badT.push(x.t); }
  }
  allSide += side; allBad += bad;
  if (!side) { rows.push(`${f.padEnd(18)} facing: no clear side-on frames`); continue; }
  const share = (100 * bad) / side; const fail = side >= 10 && share > 10; if (fail) fails++;
  const span = badT.length ? `${(badT[0] / 1000).toFixed(1)}-${(badT[badT.length - 1] / 1000).toFixed(1)} s` : '';
  rows.push(`${f.padEnd(18)} facing: ${bad}/${side} side-on frames disagree (${share.toFixed(0)}%) ${span} ${fail ? 'FAIL' : 'ok'}`);
}
console.log(rows.join('\n'));
console.log(`${rows.length} clips (${process.env.BREAK || 'model'}): ${allBad}/${allSide} side-on frames disagree; ${fails ? fails + ' FAIL' : 'all pass'}${rear ? `; ${rear} filmed from behind not scored (ALL_VIEWS=1 scores them)` : ''}`);
process.exit(fails ? 1 : 0);
