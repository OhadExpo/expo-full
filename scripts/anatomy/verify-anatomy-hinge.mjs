// GATE (13.10): are the knee and the elbow hinges? The lower segment's bend OUT of the joint's own flexion plane (deg,
// less the rest pose's carrying angle), by the bend's size, on the replay's 60 Hz track every 100 ms. PASS: with the
// joint bent 45+ deg, p90 under 12 deg at the elbow and 8 at the knee (13.10: 8.6 / 3.0; before the fixes 54 / 30 -
// HINGE_TOL=off or KNEE_ROLL_OFF=1 FAILS). RAW=1: no smoothing, at the captured knots.
import fs from 'node:fs';
import os from 'node:os';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { buildTrack, sampleTrack, S, PIVOT, RJ } from '../../src/anatomy/rig.js';
import { frameToPoints3D } from '../../src/poseLab.js';
import { Vector3, Quaternion } from 'three';
import { clipTitle } from './_clipTitle.mjs';
const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (x) => (x ? x.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null)) : null);
const J = {
  knee: (sd) => ({ up: S['thigh' + sd], lo: S['shin' + sd], u: RJ['knee' + sd].clone().sub(RJ['hip' + sd]), l: RJ['ankle' + sd].clone().sub(RJ['knee' + sd]), flex: new Vector3(0, 0, -1) }),
  elbow: (sd) => ({ up: S['uarm' + sd], lo: S['farm' + sd], u: RJ['elbow' + sd].clone().sub(RJ['shoulder' + sd]), l: RJ['wrist' + sd].clone().sub(RJ['elbow' + sd]), flex: new Vector3(0, 0, 1) }),
};
const BINS = [0, 20, 45, 90, 181], acc = { knee: BINS.map(() => []), elbow: BINS.map(() => []) };
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'));
  const fr = []; let nx = -Infinity; for (const x of o.frames) { if (!x.w || !x.l || x.t < nx) continue; fr.push({ t: x.t, landmarks: toObj(x.l), worldLandmarks: toObj(x.w) }); nx = x.t + 100; }
  const st = anatomyFrames(fr, o.dims); if (st.length < 10) continue; const other = st.otherPerson || new Set();
  const tr = buildTrack(st.filter((x) => !other.has(x.t)).map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims, ...(process.env.RAW ? { smoothMs: 0, interp: 'linear' } : {}) });
  const Q = PIVOT.map(() => new Quaternion()), r = new Vector3();
  const times = process.env.RAW ? tr.knotT : Array.from({ length: Math.floor((tr.t1 - tr.t0) / 100) + 1 }, (_, i) => tr.t0 + i * 100);
  for (const t of times) {
    if (!tr.inView(t)) continue; sampleTrack(tr, t, Q, r);
    for (const k of ['knee', 'elbow']) for (const sd of ['L', 'R']) {
      const j = J[k](sd);
      const ax = new Vector3().crossVectors(j.u, j.flex).normalize().applyQuaternion(Q[j.up]);   // the flexion axis, in the world
      const U = j.u.clone().normalize().applyQuaternion(Q[j.up]), L = j.l.clone().normalize().applyQuaternion(Q[j.lo]);
      const bend = (U.angleTo(L) * 180) / Math.PI, out = (Math.asin(Math.max(-1, Math.min(1, L.dot(ax)))) * 180) / Math.PI;
      // the rest pose's own out-of-plane (the carrying angle / the knee's): subtract it
      const L0 = j.l.clone().normalize(), ax0 = new Vector3().crossVectors(j.u, j.flex).normalize(); const out0 = (Math.asin(L0.dot(ax0)) * 180) / Math.PI;
      acc[k][BINS.findIndex((b, i) => bend >= b && bend < BINS[i + 1])].push(Math.abs(out - out0));
      if (process.env.WORST && bend >= 45 && Math.abs(out - out0) > +process.env.WORST) console.log('worst', f.slice(0, 3), (t / 1000).toFixed(1), k + sd, 'bend', bend.toFixed(0), 'out', Math.abs(out - out0).toFixed(0));
    }
  }
}
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(q * (s.length - 1))].toFixed(1) : '-'; };
for (const k of ['knee', 'elbow']) BINS.slice(0, -1).forEach((b, i) => console.log(k.padEnd(6), `bend ${b}-${BINS[i + 1] - 1}`.padEnd(12), 'n', String(acc[k][i].length).padStart(5), ' out of the hinge plane p50', pct(acc[k][i], 0.5), 'p90', pct(acc[k][i], 0.9), 'p99', pct(acc[k][i], 0.99)));
const p90of = (k) => { const v = acc[k][2].concat(acc[k][3]).sort((a, b) => a - b); return v.length ? v[Math.floor(0.9 * (v.length - 1))] : NaN; };
const e = p90of('elbow'), k = p90of('knee'), ok = e < 12 && k < 8;
console.log(`verify-anatomy-hinge: ${ok ? 'PASS' : 'FAIL'} - bent 45+ deg, out of the hinge plane p90 elbow ${e.toFixed(1)} (< 12), knee ${k.toFixed(1)} (< 8)`);
process.exitCode = ok ? 0 : 1;
