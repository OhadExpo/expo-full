// GATE: ARE THE ANGLES RIGHT? (13.10 #718, Ohad: "Perfectly angle accurate"). No motion capture exists for these clips,
// so the one ground truth available is used: where a joint's own plane (hip-knee-ankle for the knee) faces the camera,
// that angle is seen at its true size in the PICTURE (MediaPipe's image points - its most accurate output). On those
// frames the model's 3D angle (rig.modelAngles - the number the joint box shows) is compared with the angle in the
// picture. Per joint: frames that qualified, median and p90 error in degrees.
// A frame qualifies when the joint plane's normal is within TILT (20) degrees of the camera axis and the picture saw
// all three points (visibility >= 0.5). DIR = a corpus of captures (as the other anatomy gates); ONLY = a clip prefix.
import fs from 'node:fs';
import os from 'node:os';
import { Vector3, Quaternion } from 'three';
import { frameToPoints3D } from '../../src/poseLab.js';
import { buildTrack, sampleTrack, fk, modelAngles, S, PIVOT } from '../../src/anatomy/rig.js';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { modelJointAxes } from '../../src/anatomy/jointAxes.js';
import { clipTitle } from './_clipTitle.mjs';

const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const TILT = (+(process.env.TILT || 20) * Math.PI) / 180;
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (a) => a.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null));
const pct = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const ang2 = (a, b, c) => { const ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1]; const d = Math.hypot(ux, uy) * Math.hypot(vx, vy); return d > 0 ? (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / d))) * 180) / Math.PI : NaN; };
// joint: [model angle key, the three model points (segment pivots), the three image landmarks]
const JOINTS = [];
for (const sd of ['L', 'R']) {
  const l = sd === 'L' ? { sh: 11, el: 13, wr: 15, hp: 23, kn: 25, an: 27 } : { sh: 12, el: 14, wr: 16, hp: 24, kn: 26, an: 28 };
  JOINTS.push(['knee' + sd, ['thigh' + sd, 'shin' + sd, 'foot' + sd], [l.hp, l.kn, l.an]]);
  JOINTS.push(['hip' + sd, ['uarm' + sd, 'thigh' + sd, 'shin' + sd], [l.sh, l.hp, l.kn]]);
  JOINTS.push(['elbow' + sd, ['uarm' + sd, 'farm' + sd, 'hand' + sd], [l.sh, l.el, l.wr]]);
  // the shoulder: elbow - shoulder - hip (the joint box's SHOULDER), its plane = the arm against the trunk
  JOINTS.push(['shoulder' + sd, ['farm' + sd, 'uarm' + sd, 'thigh' + sd], [l.el, l.sh, l.hp]]);
}
const all = {}, signed = {}; const clipRows = []; const fppa = [], fppaS = [], shin = [], shinS = [], VB = [];
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); const W = o.dims.w, H = o.dims.h;
  const raw = []; let next = -Infinity;
  for (const fr of o.frames) { if (!fr.w || !fr.l || fr.t < next) continue; raw.push({ t: fr.t, landmarks: toObj(fr.l), worldLandmarks: toObj(fr.w) }); next = fr.t + 100; }
  const st = anatomyFrames(raw, { w: W, h: H }); if (st.length < 10) continue;
  const other = st.otherPerson || new Set();
  const tr = buildTrack(st.filter((x) => !other.has(x.t)).map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims });
  // the camera axis in the model's world: MediaPipe's +z through the applied upright rotation and the floor levelling
  const R = st.uprightR || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ap = (v) => new Vector3(R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]);
  const ours = (v) => new Vector3(v.x, -v.y, -v.z);
  const camZ = ours(ap([0, 0, 1])); if (tr.levelQ) camZ.applyQuaternion(tr.levelQ); camZ.normalize();
  const camX = ours(ap([1, 0, 0])), camY = ours(ap([0, 1, 0])); if (tr.levelQ) { camX.applyQuaternion(tr.levelQ); camY.applyQuaternion(tr.levelQ); }
  const Q = PIVOT.map(() => new Quaternion()), root = new Vector3(), piv = PIVOT.map(() => new Vector3());
  const errs = [];
  for (const x of st) {
    if (other.has(x.t) || (tr.inView && !tr.inView(x.t))) continue;
    const img = x.landmarks; if (!img) continue;
    sampleTrack(tr, x.t, Q, root); fk(Q, root, tr, piv);
    const MA = modelAngles(tr, x.t);
    // THE SHIN'S TILT with the foot planted (13.10 #709: what dorsiflexion is made of, the foot flat on the floor): the
    // model's knee -> ankle line seen from the clip's camera against the picture's, side-on frames (the leg's plane facing
    // the camera within 20 deg) - MediaPipe's foot points are biased, its shin is not
    {
      let ki = 0; const K = tr.knotT; while (ki + 1 < K.length && Math.abs(K[ki + 1] - x.t) < Math.abs(K[ki] - x.t)) ki++;
      for (const [sd, kn, an, hp] of [['L', 25, 27, 23], ['R', 26, 28, 24]]) {
        if (!(tr.contact && tr.contact[sd] && tr.contact[sd][ki])) continue;
        if ([kn, an, hp].some((k) => !img[k] || (img[k].visibility ?? 1) < 0.5)) continue;
        const Kp = piv[S['shin' + sd]], Ap = piv[S['foot' + sd]], Hp = piv[S['thigh' + sd]];
        const nrm = Hp.clone().sub(Kp).cross(Ap.clone().sub(Kp)); if (nrm.lengthSq() < 1e-10) continue; nrm.normalize();
        if (Math.abs(nrm.dot(camZ)) < Math.cos(TILT)) continue;
        const d = Ap.clone().sub(Kp), mx = d.dot(camX), my = d.dot(camY);   // image right, image down
        const px2 = (img[an].x - img[kn].x) * W, py2 = (img[an].y - img[kn].y) * H;
        let e = Math.atan2(mx, my) - Math.atan2(px2, py2); while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
        e *= 180 / Math.PI; shin.push(Math.abs(e)); shinS.push(e);
      }
    }
    // KNEE VALGUS (FPPA) where his front faces the camera (the pelvis's forward within 25 deg of the camera axis): the
    // picture's own 2D hip-knee-ankle angle is the clinical front-camera measure - the model's valgus against it
    {
      const fwd = new Vector3(0, 0, 1).applyQuaternion(Q[S.pelvis]);
      if (Math.abs(fwd.dot(camZ)) >= Math.cos((25 * Math.PI) / 180)) {
        const AXS = modelJointAxes(tr, x.t);
        for (const [sd, hp, kn, an] of [['L', 23, 25, 27], ['R', 24, 26, 28]]) {
          const v = AXS && AXS['knee' + sd] ? AXS['knee' + sd].valgus : null; if (v == null) continue;
          if ([hp, kn, an].some((k) => !img[k] || (img[k].visibility ?? 1) < 0.5)) continue;
          const P2 = (k) => [img[k].x * W, img[k].y * H]; const h = P2(hp), k2 = P2(kn), a2 = P2(an);
          // the picture's deviation: the shin's line against the thigh's (image y down), the knee IN (toward the other leg) +
          const ang = (u) => Math.atan2(u[0], u[1]) * 180 / Math.PI;
          let dv = ang([a2[0] - k2[0], a2[1] - k2[1]]) - ang([k2[0] - h[0], k2[1] - h[1]]); while (dv > 180) dv -= 360; while (dv < -180) dv += 360;
          // facing the camera his left is on the picture's right (or left, facing away): the sign that agrees with the
          // model's own L / R facing - taken from the pelvis direction
          const facingCam = fwd.dot(camZ) < 0, sgn = (sd === 'L' ? 1 : -1) * (facingCam ? -1 : 1);
          // (the sign measured, 13.10: this way the two agree with no bias - 24 clips, bias median -0.7; the other way -6.6)
          const pic = -sgn * dv; if (Math.abs(pic) > 60) continue;
          fppa.push(Math.abs(v - pic)); fppaS.push(v - pic);
          if (process.env.VBINS) { const bi = Math.min(3, Math.floor(Math.abs(v) / 15)); (VB[bi] = VB[bi] || []).push([Math.abs(v - pic), Math.abs(pic)]); }
        }
      }
    }
    for (const [key, segs, lm] of JOINTS) {
      if (!MA[key] || MA[key].v == null) continue;
      if (lm.some((k) => !img[k] || (img[k].visibility ?? 1) < 0.5)) continue;
      const [a, b, c] = segs.map((n) => piv[S[n]]);
      const nrm = a.clone().sub(b).cross(c.clone().sub(b)); if (nrm.lengthSq() < 1e-10) continue; nrm.normalize();
      if (Math.abs(nrm.dot(camZ)) < Math.cos(TILT)) continue;   // the joint's plane does not face the camera
      const ia = ang2(...lm.map((k) => [img[k].x * W, img[k].y * H]));
      if (!Number.isFinite(ia)) continue;
      const e = Math.abs(MA[key].v - ia);
      errs.push(e); (all[key.slice(0, -1)] ||= []).push(e); (signed[key.slice(0, -1)] ||= []).push(MA[key].v - ia);
      if (process.env.DUMP && key.startsWith(process.env.DUMP)) console.log('  ', f, (x.t / 1000).toFixed(1), key, 'model', MA[key].v.toFixed(0), 'picture', ia.toFixed(0), MA[key].seen ? '' : '(unseen)');
    }
  }
  clipRows.push([f, errs.length, pct(errs, 0.5), pct(errs, 0.9)]);
  console.log(`${f.padEnd(20)} side-on joint readings ${String(errs.length).padStart(5)}  median ${pct(errs, 0.5).toFixed(1)} deg  p90 ${pct(errs, 0.9).toFixed(1)} deg`);
}
const every = Object.values(all).flat();
console.log('---');
for (const [k, v] of Object.entries(all)) console.log(`${k.padEnd(6)} n ${String(v.length).padStart(6)}  median ${pct(v, 0.5).toFixed(1)}  p90 ${pct(v, 0.9).toFixed(1)} deg   bias (model - picture) median ${pct(signed[k], 0.5).toFixed(1)}, p10 ${pct(signed[k], 0.1).toFixed(1)}, p90 ${pct(signed[k], 0.9).toFixed(1)}`);
if (shin.length) console.log(`SHIN TILT (foot planted, side-on) n ${shin.length}  median ${pct(shin, 0.5).toFixed(1)}  p90 ${pct(shin, 0.9).toFixed(1)} deg   bias median ${pct(shinS, 0.5).toFixed(1)}`);
if (process.env.VBINS) VB.forEach((v, i) => v && console.log(`  valgus |model| ${i * 15}-${i * 15 + 14}: n ${v.length}  error median ${pct(v.map((q) => q[0]), 0.5).toFixed(1)} p90 ${pct(v.map((q) => q[0]), 0.9).toFixed(1)}  |picture| median ${pct(v.map((q) => q[1]), 0.5).toFixed(1)}`));
if (fppa.length) console.log(`VALGUS (FPPA, front-facing frames) n ${fppa.length}  median ${pct(fppa, 0.5).toFixed(1)}  p90 ${pct(fppa, 0.9).toFixed(1)} deg   bias median ${pct(fppaS, 0.5).toFixed(1)}`); else console.log('VALGUS (FPPA): no front-facing frames');
console.log(`ALL    n ${String(every.length).padStart(6)}  median ${pct(every, 0.5).toFixed(1)}  p90 ${pct(every, 0.9).toFixed(1)} deg  (${clipRows.length} clips, joint planes within ${Math.round((TILT * 180) / Math.PI)} deg of facing the camera)`);
