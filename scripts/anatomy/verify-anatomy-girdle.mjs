// GATE (13.10): does the model's shoulder rise toward the ear as the arm goes up, as it does in the picture (the shoulder
// girdle's rhythm)? Ear-to-shoulder distance over the torso length, binned by the arm's elevation, as the change (%) from
// arms-down - lifted landmarks vs the model. PASS: every band from 60 deg with 50+ readings within 4 points of the picture.
// Proven by breaking: GIRDLE=0 (the clavicle fixed to the chest, as before) -> FAIL (model -1 / -3 / 0 vs -6 / -12 / -16).
// Calibrated on the FULL-model corpus (the default DIR). The heavy model's landmarks read about 1.7x the rise on the same
// kind of motion (-10 / -21 / -26; the model -4 / -8 / -13 there, so DIR=captures-heavy FAILS by design) - the two landmark
// sets disagree, plausibly the shoulder point riding onto the bunched deltoid (theory, not measured). The gain stays on the
// smaller reading: a shoulder raised too little is the lesser error than one raised too far.
import fs from 'node:fs';
import os from 'node:os';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { buildTrack, sampleTrack, fk, S, PIVOT } from '../../src/anatomy/rig.js';
import { frameToPoints3D } from '../../src/poseLab.js';
import { Vector3, Quaternion } from 'three';
import { clipTitle } from './_clipTitle.mjs';
const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (x) => (x ? x.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null)) : null);
const BINS = [0, 30, 60, 90, 120, 150, 181];
const bin = (e) => BINS.findIndex((b, i) => e >= b && e < BINS[i + 1]);
const acc = { lift: BINS.map(() => []), model: BINS.map(() => []) };
const ang = (a, b) => (a.angleTo(b) * 180) / Math.PI;
const per = {};
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'));
  const fr = []; let nx = -Infinity; for (const x of o.frames) { if (!x.w || !x.l || x.t < nx) continue; fr.push({ t: x.t, landmarks: toObj(x.l), worldLandmarks: toObj(x.w) }); nx = x.t + 100; }
  const st = anatomyFrames(fr, o.dims); if (st.length < 10) continue; const other = st.otherPerson || new Set();
  const use = st.filter((x) => !other.has(x.t));
  const tr = buildTrack(use.map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims });
  const Q = PIVOT.map(() => new Quaternion()), r = new Vector3(), piv = PIVOT.map(() => new Vector3());
  const mine = { lift: BINS.map(() => []), model: BINS.map(() => []) };
  for (const x of use) {
    const w = x.worldLandmarks; if (!w) continue; const P = (i) => new Vector3(w[i].x, -w[i].y, -w[i].z);
    const vis = (i) => (w[i].visibility ?? 1) > 0.6;
    for (const [sh, el, ear, hip] of [[11, 13, 7, 23], [12, 14, 8, 24]]) {
      if (![sh, el, ear, hip].every(vis)) continue;
      const S0 = P(sh), torso = P(hip).sub(S0); const e = ang(P(el).sub(S0), torso);
      mine.lift[bin(e)].push(P(ear).distanceTo(S0) / torso.length());
    }
    if (!tr.inView(x.t)) continue;
    sampleTrack(tr, x.t, Q, r); fk(Q, r, tr, piv);
    for (const sd of ['L', 'R']) {
      const S0 = piv[S['uarm' + sd]], torso = piv[S['thigh' + sd]].clone().sub(S0); const e = ang(piv[S['farm' + sd]].clone().sub(S0), torso);
      mine.model[bin(e)].push(piv[S.head].distanceTo(S0) / torso.length());
    }
  }
  const med = (v) => { if (v.length < 5) return NaN; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
  const row = (k) => { const b0 = med(mine[k][0].concat(mine[k][1])); return mine[k].map((v) => (Number.isFinite(b0) ? ((med(v) / b0 - 1) * 100) : NaN)); };
  per[f] = { lift: row('lift'), model: row('model'), n: mine.lift.map((v) => v.length) };
  for (const k of ['lift', 'model']) { const b0 = med(mine[k][0].concat(mine[k][1])); if (!Number.isFinite(b0)) continue; mine[k].forEach((v, i) => v.forEach((d) => acc[k][i].push((d / b0 - 1) * 100))); }
  const fmt = (v) => v.map((q) => (Number.isFinite(q) ? q.toFixed(0).padStart(4) : '   -')).join(' ');
  if (process.env.VERBOSE) console.log(f.slice(0, 14).padEnd(15), 'lift', fmt(per[f].lift), '| model', fmt(per[f].model), '| n', per[f].n.join('/'));
}
const md = (v) => { if (v.length < 5) return '   -'; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1].toFixed(0).padStart(4); };
console.log('ALL ear-shoulder change % by arm elevation', BINS.slice(0, -1).map((b, i) => `${b}-${BINS[i + 1] - 1}`).join(' '));
console.log('lift ', acc.lift.map(md).join(' '), ' n', acc.lift.map((v) => v.length).join('/'));
console.log('model', acc.model.map(md).join(' '), ' n', acc.model.map((v) => v.length).join('/'));
const mdv = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const bad = [2, 3, 4, 5].filter((i) => acc.lift[i].length >= 50 && acc.model[i].length >= 50 && Math.abs(mdv(acc.lift[i]) - mdv(acc.model[i])) > 4);
const bands = [2, 3, 4, 5].filter((i) => acc.lift[i].length >= 50 && acc.model[i].length >= 50).length;
console.log(`verify-anatomy-girdle: ${bad.length || !bands ? 'FAIL' : 'PASS'} - ${bands - bad.length} / ${bands} bands from 60 deg within 4 points of the picture`);
process.exitCode = bad.length || !bands ? 1 : 0;
