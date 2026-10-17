// GATE: DOES THE BODY MATCH THE VIDEO? (13.10 #705, Ohad: "We're not close"). The model's joints, seen from the
// video's own camera, against where the PICTURE puts them (MediaPipe's image points - its most accurate output).
// Error = 2D distance after the best scale+shift per frame, as % of his height in the picture; median / p90 per clip.
// His height = his body's length in the picture (rig.bodyPx), whichever way he lies - the frame's vertical span made a
// push-up's horizontal body 26 px 'tall' and every error on it 3-10x too big (13.10, c36).
// Same pipeline as the replay: liftFrom2D -> stableReplayFrames -> buildTrack. BREAK=nolift runs it on MediaPipe's
// raw 3D (the pre-13.10 replay): the gate must show it far worse.
import fs from 'node:fs';
import os from 'node:os';
import { Vector3, Quaternion } from 'three';
import { stableReplayFrames, stabilizeWorldFrames, frameToPoints3D, uprightRotation } from '../../src/poseLab.js';
import { buildTrack, sampleTrack, fk, bodyPx, S, NSEG, PIVOT } from '../../src/anatomy/rig.js';
import { liftFrom2D, anatomyFrames, fixLimbSwaps } from '../../src/anatomy/lift2d.js';
import { clipTitle } from './_clipTitle.mjs';

const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (a) => a.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null));
const pct = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
// model joint -> landmark index
const PAIRS = [[S.uarmL, 11], [S.uarmR, 12], [S.farmL, 13], [S.farmR, 14], [S.handL, 15], [S.handR, 16], [S.thighL, 23], [S.thighR, 24], [S.shinL, 25], [S.shinR, 26], [S.footL, 27], [S.footR, 28]];
const rows = []; let fails = 0;
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); const W = o.dims.w, H = o.dims.h;
  const raw = []; let next = -Infinity;
  for (const fr of o.frames) { if (!fr.w || !fr.l || fr.t < next) continue; raw.push({ t: fr.t, landmarks: toObj(fr.l), worldLandmarks: toObj(fr.w) }); next = fr.t + 100; }
  const src = process.env.BREAK === 'nolift' ? raw : liftFrom2D(raw, { w: W, h: H });
  const rawFixed = process.env.BREAK === 'nolift' ? raw : fixLimbSwaps(raw);
  const st = process.env.BREAK === 'nolift' ? stableReplayFrames(src) : anatomyFrames(raw, { w: W, h: H }); if (st.length < 10) continue;
  const tr = buildTrack(st.map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { exercise: clipTitle(f), dims: o.dims });
  // the camera: MediaPipe's +z, turned by the clip's upright rotation, in frameToPoints3D's axes
  // the turn the pipeline APPLIED (13.10: recomputed here from other frames it could differ from the one used)
  const U = process.env.BREAK === 'nolift' ? uprightRotation(src.filter((x) => x.worldLandmarks)) : null;
  const R = process.env.BREAK === 'nolift' ? (U ? U.R : [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) : (st.uprightR || [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const ap = (v) => new Vector3(R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]);
  const ours = (v) => new Vector3(v.x, -v.y, -v.z);
  const camX = ours(ap([1, 0, 0])), camY = ours(ap([0, 1, 0])), camZ = ours(ap([0, 0, 1]));   // image right, image DOWN, away from the lens
  if (tr.levelQ) { camX.applyQuaternion(tr.levelQ); camY.applyQuaternion(tr.levelQ); camZ.applyQuaternion(tr.levelQ); }   // the rig levelled the floor: the camera turned with it
  const Q = PIVOT.map(() => new Quaternion()), root = new Vector3(), piv = PIVOT.map(() => new Vector3());
  const errs = [], perJ = {}, frameMed = [];
  const hgtClip = bodyPx(raw.length, (a, k) => { const l = raw[a].landmarks[k]; return l ? [l.x * W, l.y * H] : null; }, true);
  for (const x of st) {
    const im = rawFixed.find((r) => r.t === x.t); if (!im) continue;   // the picture with the limb labels the rig uses
    sampleTrack(tr, x.t, Q, root); fk(Q, root, tr, piv);
    const A = [], B = [];
    // a stretch the rig un-mirrored: its picture labels swap too
    const SW = { 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27 }, mir = tr.mirroredT && tr.mirroredT.has(x.t);
    // the parts the replay DRAWS as seen (14.10 #750): a faded part is a declared guess, and the engine no longer follows
    // MediaPipe's guess for a hidden leg (REPRO_ALL=1: every point at visibility 0.5+, the gate before)
    const kS = Math.max(0, Math.min(tr.m - 1, Math.round((x.t - tr.t0) / (1000 / tr.hz))));
    const KS = [], A3 = []; for (const [seg, k0] of PAIRS) { const k = mir ? SW[k0] : k0; const l = im.landmarks[k]; if (!l || !(l.visibility >= 0.5)) continue; if (!process.env.REPRO_ALL && !tr.seen[kS * NSEG + seg]) continue; A.push([piv[seg].dot(camX), piv[seg].dot(camY)]); A3.push(piv[seg].dot(camZ)); B.push([l.x * W, l.y * H]); KS.push(k); }
    if (A.length < 6) continue;
    if (process.env.REPRO_PERSP === '1') {
      // the camera distance D (to the joints' middle) that fits best; x / (1 + z / D) -> the far camera as D grows
      const fitErr = (P) => { const m0 = [0, 1].map((c) => P.reduce((q, p) => q + p[c], 0) / P.length), m1 = [0, 1].map((c) => B.reduce((q, p) => q + p[c], 0) / B.length); let nu = 0, de = 0; P.forEach((p, i) => { nu += (p[0] - m0[0]) * (B[i][0] - m1[0]) + (p[1] - m0[1]) * (B[i][1] - m1[1]); de += (p[0] - m0[0]) ** 2 + (p[1] - m0[1]) ** 2; }); const sc = de > 0 ? nu / de : 1; return P.reduce((q, p, i) => q + Math.hypot((p[0] - m0[0]) * sc + m1[0] - B[i][0], (p[1] - m0[1]) * sc + m1[1] - B[i][1]) ** 2, 0); };
      const zc = A3.reduce((q, v) => q + v, 0) / A3.length; let best = A, be = fitErr(A);
      for (let D = 0.6; D <= 12; D *= 1.15) { if (A3.some((z) => D + z - zc < 0.2)) continue; const P = A.map((p, i) => [p[0] / (1 + (A3[i] - zc) / D), p[1] / (1 + (A3[i] - zc) / D)]); const e = fitErr(P); if (e < be) { be = e; best = P; } }
      A.splice(0, A.length, ...best);
    }
    // best scale + shift (no rotation: the camera is the camera)
    const ma = [0, 1].map((c) => A.reduce((s, p) => s + p[c], 0) / A.length), mb = [0, 1].map((c) => B.reduce((s, p) => s + p[c], 0) / B.length);
    let num = 0, den = 0; A.forEach((p, i) => { num += (p[0] - ma[0]) * (B[i][0] - mb[0]) + (p[1] - ma[1]) * (B[i][1] - mb[1]); den += (p[0] - ma[0]) ** 2 + (p[1] - ma[1]) ** 2; });
    const s = den > 0 ? num / den : 1;
    const hgt = Math.max(1, hgtClip);
    const fe = []; A.forEach((p, i) => fe.push((100 * Math.hypot((p[0] - ma[0]) * s + mb[0] - B[i][0], (p[1] - ma[1]) * s + mb[1] - B[i][1])) / hgt)); frameMed.push([x.t, pct(fe, 0.5)]);
    A.forEach((p, i) => { const e = (100 * Math.hypot((p[0] - ma[0]) * s + mb[0] - B[i][0], (p[1] - ma[1]) * s + mb[1] - B[i][1])) / hgt; errs.push(e); if (process.env.DIAG) { const k = KS[i]; (perJ[k] = perJ[k] || []).push(e); if (process.env.WORST && e > +process.env.WORST) console.log('worst', x.t, k, e.toFixed(0), 'vis', im.landmarks[k].visibility.toFixed(2), 'img', B[i].map((v) => v.toFixed(0)).join(',')); } });
  }
  const m = pct(errs, 0.5), p90 = pct(errs, 0.9);
  if (process.env.PERFRAME === "2") { const by = {}; for (const [t, v] of frameMed) (by[Math.floor(t / 2000) * 2] = by[Math.floor(t / 2000) * 2] || []).push(v); console.log(Object.entries(by).map(([s, v]) => s + "s:" + pct(v, 0.5).toFixed(0)).join(" ")); }
  if (process.env.PERFRAME) { const fm = frameMed.map((q) => q[1]); console.log(f.padEnd(20), 'frame medians: p50', pct(fm, 0.5).toFixed(1), 'p90', pct(fm, 0.9).toFixed(1), 'share >8%', (fm.filter((v) => v > 8).length / fm.length * 100).toFixed(0) + '%', '>12%', (fm.filter((v) => v > 12).length / fm.length * 100).toFixed(0) + '%', '>16%', (fm.filter((v) => v > 16).length / fm.length * 100).toFixed(0) + '%'); }
  if (process.env.DIAG) console.log(f, Object.entries(perJ).map(([k, v]) => `${k}:${pct(v, 0.5).toFixed(1)}/${pct(v, 0.9).toFixed(1)}`).join(' '));
  const bad = m > 4 || p90 > 10; if (bad) fails++;
  rows.push(`${f.padEnd(18)} reprojection ${m.toFixed(1)}% / p90 ${p90.toFixed(1)}% of his height ${bad ? 'FAIL' : 'ok'}`);
}
console.log(rows.join('\n'));
console.log(`${rows.length} clips (${process.env.BREAK || 'lift'}): ${fails ? fails + ' FAIL' : 'all pass'}`);
process.exit(fails ? 1 : 0);
