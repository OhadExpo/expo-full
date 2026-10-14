// GATE for the anatomy rig (#690 / #691), in node on the real captures (~/expo-private-backups/set-clips/captures-full):
// the same path the app takes (stableReplayFrames -> frameToPoints3D -> buildTrack), at the app's ~10 a second.
//  FIT    where the model's joints are against the captured ones (cm, median / p95) - the body is where he is
//  HEAD   frames whose head points down while the chest is upright (F1, #285): must be 0
//  SMOOTH the motion's corners: the jump of angular acceleration in the 60 Hz track at the captured frames vs between
//         them (<= 2). A linear blend has a corner at every captured frame (ratio >> 2); the C2 spline must not (#691).
//  JERK   the largest single-sample change of angular velocity (deg/s per sample) - a pop, a flip
// Exit 1 on any failure. BREAK=linear runs the product path with linear interpolation: the gate must FAIL.
import fs from 'node:fs';
import os from 'node:os';
import { Vector3, Quaternion } from 'three';
import { stabilizeWorldFrames, frameToPoints3D } from '../../src/poseLab.js';
import { anatomyFrames } from '../../src/anatomy/lift2d.js';
import { buildTrack, sampleTrack, fk, fixFrontBack, S, NSEG, PIVOT, SEGMENTS as SEGS } from '../../src/anatomy/rig.js';
import { clipTitle } from './_clipTitle.mjs';

const DIR = process.env.DIR || os.homedir() + '/expo-private-backups/set-clips/captures-full';
const STEP = +(process.env.STEP_MS || 100), INTERP = process.env.BREAK === 'linear' ? 'linear' : process.env.INTERP || 'c2';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).filter((f) => !process.env.ONLY || f.startsWith(process.env.ONLY));
const toObj = (a) => a.map((q) => (q ? { x: q[0], y: q[1], z: q[2], visibility: q[3] } : null));
const pct = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
let fails = 0; const rows = [];
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  // the app's capture rate: keep a frame every STEP ms
  const raw = []; let next = -Infinity;
  for (const fr of o.frames) { if (!fr.w || fr.t < next) continue; raw.push({ t: fr.t, landmarks: toObj(fr.l), worldLandmarks: toObj(fr.w) }); next = fr.t + STEP; }
  // the replay's pipeline: lifted onto the picture, the stabiliser's L/R + upright only (Replay3D, 13.10)
  const st = anatomyFrames(raw, o.dims); if (st.length < 10) { rows.push(`${f}: too few frames`); continue; }
  // the fit is measured against the points the rig plays: with a front/back mirrored stretch put back (rig.fixFrontBack)
  // THE REPLAY'S OWN CALL (13.10): with the picture points (img) - without them the rig's picture-read feet never ran here
  // and this gate measured a path the app does not play
  const src = st.map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks }));
  const t0 = Date.now(); const tr = buildTrack(src, { interp: INTERP, dims: o.dims, exercise: clipTitle(f) }); const ms = Date.now() - t0;
  // ... and the fit's reference turned like the rig turned them: levelled (tr.levelQ) as well as un-mirrored
  const frames = fixFrontBack(src).frames.map((x) => (tr.levelQ ? { ...x, pts: x.pts.map((q) => { if (!q) return q; const v = new Vector3(q.x, q.y, q.z).applyQuaternion(tr.levelQ); return { ...q, x: v.x, y: v.y, z: v.z }; }) } : x));
  // FIT + HEAD at the captured frames
  const err = [], errAll = [], Q = PIVOT.map(() => new Quaternion()), root = new Vector3(), piv = PIVOT.map(() => new Vector3());
  let headDown = 0, upright = 0;
  const pairs = [[S.shinL, 25], [S.shinR, 26], [S.footL, 27], [S.footR, 28], [S.farmL, 13], [S.farmR, 14], [S.handL, 15], [S.handR, 16], [S.uarmL, 11], [S.uarmR, 12]];
  for (const fr of frames) {
    sampleTrack(tr, fr.t, Q, root); fk(Q, root, tr, piv);
    const p = fr.pts;
    // the fit is the parts the replay DRAWS as seen (14.10 #750): a part drawn faded is a declared guess - since the
    // engine stopped following MediaPipe's guess for a hidden leg (Ohad: "lower limbs ... should not be moving"), the
    // distance to that guess is not an error. errAll keeps every point at visibility 0.5+, printed beside it.
    const kS = Math.max(0, Math.min(tr.m - 1, Math.round((fr.t - tr.t0) / (1000 / tr.hz))));
    for (const [seg, k] of pairs) if (p[k] && (p[k].visibility == null || p[k].visibility >= 0.5)) { const e = piv[seg].distanceTo(new Vector3(p[k].x, p[k].y, p[k].z)) * 100; errAll.push(e); if (tr.seen[kS * NSEG + seg]) err.push(e); }
    const chestUp = new Vector3(0, 1, 0).applyQuaternion(Q[S.chest]), headUp = new Vector3(0, 1, 0).applyQuaternion(Q[S.head]);
    if (chestUp.y > 0.7) { upright++; if (headUp.y < 0) headDown++; }
  }
  // SMOOTH + JERK on the 60 Hz track
  const qa = new Quaternion(), qb = new Quaternion(), w = new Float64Array(tr.m * NSEG);
  for (let k = 0; k + 1 < tr.m; k++) for (let s = 0; s < NSEG; s++) { qa.fromArray(tr.quats, (k * NSEG + s) * 4); qb.fromArray(tr.quats, ((k + 1) * NSEG + s) * 4); w[k * NSEG + s] = ((2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * 180) / Math.PI) * tr.hz; }
  const capT = frames.map((x) => x.t); let ci = 0; const atCap = [], between = []; let jerk = 0;
  for (let k = 1; k + 1 < tr.m; k++) {
    const t = tr.t0 + k * (1000 / tr.hz); while (ci + 1 < capT.length && capT[ci + 1] <= t) ci++;
    const nearCap = Math.min(Math.abs(t - capT[ci]), Math.abs((capT[ci + 1] ?? Infinity) - t)) < 1000 / tr.hz / 2 + 0.01;
    // a corner = a JUMP in the motion's acceleration: the second difference of angular speed. (Its first difference
    // peaks at the captured frames even on a C2 spline - acceleration is piecewise linear and largest at the knots.)
    let acc = 0; for (let s = 0; s < NSEG; s++) { const d = Math.abs(w[k * NSEG + s] - w[(k - 1) * NSEG + s]); if (d > jerk) jerk = d; if (k >= 2) acc += Math.abs(w[k * NSEG + s] - 2 * w[(k - 1) * NSEG + s] + w[(k - 2) * NSEG + s]); }
    if (k >= 2) (nearCap ? atCap : between).push(acc / NSEG);
  }
  const corner = mean(atCap) / Math.max(1e-9, mean(between));
  // OVERSHOOT: between two captured frames a segment should turn along the way from one to the other - the degrees it
  // leaves that way by (angle to A + angle to B - angle A..B), p99 over every 60 Hz sample and segment
  const ang = (x, y) => (2 * Math.acos(Math.min(1, Math.abs(x.dot(y)))) * 180) / Math.PI;
  const QA = PIVOT.map(() => new Quaternion()), QB = PIVOT.map(() => new Quaternion()), QT = PIVOT.map(() => new Quaternion()), rr = new Vector3();
  const over = [];
  for (let c = 0; c + 1 < capT.length; c++) {
    sampleTrack(tr, capT[c], QA, rr); sampleTrack(tr, capT[c + 1], QB, rr);
    for (let t = capT[c] + 1000 / tr.hz; t < capT[c + 1]; t += 1000 / tr.hz) { sampleTrack(tr, t, QT, rr); for (let s = 0; s < NSEG; s++) over.push(Math.max(0, ang(QT[s], QA[s]) + ang(QT[s], QB[s]) - ang(QA[s], QB[s]))); }
  }
  const over99 = pct(over, 0.99);
  // POPS: a 60 Hz step in which a SEEN segment turns more than 20 degrees (1,200 deg/s): a flip, not a lift (a faded,
  // unseen one is drawn as a guess)
  let pops = 0; const popSeg = new Array(NSEG).fill(0); for (let k = 0; k + 1 < tr.m; k++) for (let s = 0; s < NSEG; s++) if (w[k * NSEG + s] / tr.hz > 20 && tr.seen[k * NSEG + s] && tr.seen[(k + 1) * NSEG + s]) { pops++; popSeg[s]++; if (process.env.POPT) console.log('pop', f, SEGS[s], ((tr.t0 + k * 1000 / tr.hz) / 1000).toFixed(2)); if (process.env.POPB && tr._run) { const t = tr.t0 + k * 1000 / tr.hz; let i = 0; while (i + 1 < tr.knotT.length - 1 && tr.knotT[i + 1] <= t) i++; const nb = tr.knotT.length; if (tr._run[i * NSEG + s] !== tr._run[Math.min(nb - 1, i + 1) * NSEG + s]) global.__popB = (global.__popB || 0) + 1; else global.__popI = (global.__popI || 0) + 1; if (process.env.POPK) { const qa = new Quaternion(), qb = new Quaternion(), r0 = new Vector3(); const QA = PIVOT.map(() => new Quaternion()), QB = PIVOT.map(() => new Quaternion()); sampleTrack(tr, tr.knotT[i], QA, r0); sampleTrack(tr, tr.knotT[Math.min(nb - 1, i + 1)], QB, r0); const kang = 2 * Math.acos(Math.min(1, Math.abs(QA[s].dot(QB[s])))) * 180 / Math.PI, dtk = tr.knotT[Math.min(nb - 1, i + 1)] - tr.knotT[i]; console.log('popk', SEGS[s], t.toFixed(0), 'step', (w[k * NSEG + s] / tr.hz).toFixed(0), 'knots', kang.toFixed(0), 'deg in', dtk, 'ms -> avg', (kang / dtk * 1000 / 60).toFixed(0), 'per 60Hz'); void qa; void qb; } } if (process.env.POPT && s === +process.env.POPT) console.log('pop', f, 'seg', s, 't', (tr.t0 + k * 1000 / tr.hz).toFixed(0), 'deg', (w[k * NSEG + s] / tr.hz).toFixed(0)); }
  if (process.env.POPB) { console.log(f, 'pops at run boundaries', global.__popB || 0, 'inside runs', global.__popI || 0); global.__popB = global.__popI = 0; }
  if (process.env.DIAG) console.log(f, 'pops by segment', popSeg.map((c, s) => (c ? SEGS[s] + ':' + c : '')).filter(Boolean).join(' '));
  const fit50 = pct(err, 0.5), fit95 = pct(err, 0.95);
  const bad = [];
  if (headDown > 0) bad.push(`HEAD ${headDown}/${upright}`);
  if (corner > 2.0) bad.push(`SMOOTH corner ${corner.toFixed(2)}`);
  if (over99 > 2) bad.push(`OVERSHOOT ${over99.toFixed(1)}deg`);
  if (pops > 0) bad.push(`POPS ${pops}`);
  if (fit50 > 6 || fit95 > 15) bad.push(`FIT ${fit50.toFixed(1)}/${fit95.toFixed(1)}cm`);
  if (bad.length) fails++;
  rows.push(`${f.padEnd(18)} ${String(frames.length).padStart(4)}f ${String(tr.m).padStart(5)}s60 scale ${tr.scale.toFixed(2)} fit ${fit50.toFixed(1)}/${fit95.toFixed(1)}cm head-down ${headDown}/${upright} corner ${corner.toFixed(2)} over99 ${over99.toFixed(1)} pops ${pops} jerk ${jerk.toFixed(0)} ${ms}ms fitAll ${pct(errAll, 0.5).toFixed(1)}/${pct(errAll, 0.95).toFixed(1)}cm ${bad.length ? 'FAIL ' + bad.join(' ') : 'ok'}`);
}
console.log(rows.join('\n'));
console.log(`${files.length} clips, interp=${INTERP}, step ${STEP}ms: ${fails ? fails + ' FAIL' : 'all pass'}`);
// REGRESSION VERDICT (13.10 #725): the absolute criteria above were set on the old path - every clip prints FAIL since
// the picture-anchored lift, so they cannot catch a regression. BASE=<a saved run of this gate> compares clip by clip:
// FAIL where head-down frames appear (base 0), pops rise past 1.25x + 20, or the median fit worsens by over 1.5 cm.
if (process.env.BASE) {
  const RX = /^(\S+)\s+\d+f .* fit ([\d.]+)\/([\d.]+)cm head-down (\d+)\/\d+ .* pops (\d+)/;
  const parse = (txt) => Object.fromEntries(txt.split('\n').map((l) => l.match(RX)).filter(Boolean).map((m) => [m[1], { fit: +m[2], head: +m[4], pops: +m[5] }]));
  const base = parse(fs.readFileSync(process.env.BASE, 'utf8')), now = parse(rows.join('\n')), reg = [];
  let pb = 0, pn = 0;
  for (const [k, n] of Object.entries(now)) {
    const b = base[k]; if (!b) continue; pb += b.pops; pn += n.pops;
    if (n.head > 0 && b.head === 0) reg.push(`${k} head-down ${n.head}`);
    if (n.pops > b.pops * 1.25 + 20) reg.push(`${k} pops ${b.pops} -> ${n.pops}`);
    if (n.fit > b.fit + 1.5) reg.push(`${k} fit ${b.fit} -> ${n.fit} cm`);
  }
  console.log(`verify-anatomy-rig vs BASE: ${reg.length ? 'FAIL - ' + reg.join('; ') : 'PASS - no clip regressed'} (pops ${pb} -> ${pn})`);
  process.exit(reg.length ? 1 : 0);
}
process.exit(fails ? 1 : 0);
