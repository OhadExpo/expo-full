// THE CENTRE OF MASS vs THE FLOOR AND THE BAR (13.10 #715, Ohad: "Gravity centers, vs the floor/bars").
// Read off the body on screen (the same track, forward kinematics and rest points as modelAngles), so the number and
// the model always agree.
//
// Each rig segment's mass share and the position of its own centre along it are de Leva's adjustments of Zatsiorsky's
// segment parameters (de Leva, 1996, J Biomech 29:1223-1230; male table) - established reference values for a typical
// adult, not this athlete's measured anatomy. Mapped onto the 19-segment rig: head + neck on the head (at the ears),
// de Leva's upper trunk and half the middle trunk on the chest, the other half on the lumbar, the lower trunk on the
// pelvis; the clavicles carry none. The shares sum to 1.000.
//
// The whole-body centre = the mass-weighted sum of the segments' centres; under it, on the floor, the plumb point. The
// base of support = the heels and toes of the planted feet; mid-foot = the middle of those. Forward = where the pelvis
// faces. Reported: the centre's distance ahead of (+) / behind (−) mid-foot, its height, whether its
// plumb point lies inside the base - and the same "ahead of mid-foot" for the bar, read as the middle of the two hands'
// knuckles (the hands hold the bar; with no bar it is where the hands are).
import { Vector3, Quaternion } from 'three';
import { PIVOT, RJ, S, sampleTrack, fk, carry } from './rig.js';

const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const along = (a, b, f) => a.clone().lerp(b, f);
// [segment, mass share, the segment's centre in the REST pose]
export const SEG_COM = (() => {
  const P = (n) => PIVOT[S[n]];
  const knuck = (sd) => mid(RJ['index' + sd], RJ['pinky' + sd]);
  const list = [
    ['head', 0.0694, RJ.earMid.clone()],
    ['chest', 0.1596 + 0.1633 / 2, along(P('chest'), P('neck'), 0.55)],
    ['lumbar', 0.1633 / 2, along(P('lumbar'), P('chest'), 0.5)],
    ['pelvis', 0.1117, along(P('pelvis'), P('lumbar'), 0.39)],
  ];
  for (const sd of ['L', 'R']) {
    list.push(['uarm' + sd, 0.0271, along(RJ['shoulder' + sd], RJ['elbow' + sd], 0.5772)]);
    list.push(['farm' + sd, 0.0162, along(RJ['elbow' + sd], RJ['wrist' + sd], 0.4574)]);
    list.push(['hand' + sd, 0.0061, along(RJ['wrist' + sd], knuck(sd), 0.79)]);
    list.push(['thigh' + sd, 0.1416, along(RJ['hip' + sd], RJ['knee' + sd], 0.4095)]);
    list.push(['shin' + sd, 0.0433, along(RJ['knee' + sd], RJ['ankle' + sd], 0.4459)]);
    list.push(['foot' + sd, 0.0137, along(RJ['heel' + sd], RJ['toe' + sd], 0.4415)]);
  }
  return list.map(([n, m, c]) => [S[n], m, c]);
})();
export const COM_MASS_TOTAL = SEG_COM.reduce((a, s) => a + s[1], 0);

// a point inside a convex polygon (x / z), the polygon's points in any order (its hull is taken)
function hull(ps) {
  const p = ps.slice().sort((a, b) => a.x - b.x || a.z - b.z), cr = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  if (p.length < 3) return p;
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const inside = (h, q) => { if (h.length < 3) return false; let s = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; const c = (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } } return true; };

const _Q = PIVOT.map(() => new Quaternion()), _root = new Vector3(), _piv = PIVOT.map(() => new Vector3()), _v = new Vector3();
// the balance at time t: null when there is no track; seen = the trunk and both legs were seen
export function modelBalance(tr, t) {
  if (!tr) return null;
  const { seen } = sampleTrack(tr, t, _Q, _root); fk(_Q, _root, tr, _piv);
  const c = (seg, pt) => carry(seg, pt, _Q, _piv, tr, new Vector3());
  const com = new Vector3();
  for (const [seg, m, p] of SEG_COM) com.addScaledVector(carry(seg, p, _Q, _piv, tr, _v), m);
  com.divideScalar(COM_MASS_TOTAL);
  const floor = tr.floor || 0, touch = 0.04 * (tr.scale || 1);   // a heel / toe within 4 cm of the floor bears weight
  // WHICH FOOT CARRIES HIM = the rig's own planted flags (debounced over the clip), not this frame's height: a foot
  // hovering at 4 cm switched mid-foot between the feet every few frames - COM 'ahead' jumped 13-25 cm a frame (p99)
  const K = tr.knotT; let ki = 0; if (K && K.length) { let lo = 0, hi = K.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (K[m] < t) lo = m + 1; else hi = m; } ki = lo > 0 && Math.abs(K[lo - 1] - t) < Math.abs(K[lo] - t) ? lo - 1 : lo; }
  const planted = (sd) => (tr.contact && tr.contact[sd] && tr.contact[sd].length > ki ? !!tr.contact[sd][ki] : null);
  const feet = [];
  for (const sd of ['L', 'R']) for (const k of ['heel', 'toe']) { const q = c(S['foot' + sd], RJ[k + sd]); const pl = planted(sd); feet.push({ q, on: pl == null ? q.y - floor < touch : pl, sd, k }); }
  const on = feet.filter((f) => f.on);
  const base = on.length ? on : feet;   // no foot on the floor (a jump): mid-foot of the feet where they are
  const mf = base.reduce((a, f) => a.add(f.q), new Vector3()).divideScalar(base.length);
  // FORWARD = where his pelvis faces, level (a foot read reversed - hidden behind a plate - flipped the feet's own
  // heel-to-toe 'forward' and the sign of every number with it)
  const fwd = new Vector3(0, 0, 1).applyQuaternion(_Q[S.pelvis]);
  fwd.y = 0; if (fwd.lengthSq() < 1e-9) fwd.set(0, 0, 1); fwd.normalize();
  const side = new Vector3(fwd.z, 0, -fwd.x);
  const flat = (p) => new Vector3(p.x - mf.x, 0, p.z - mf.z);
  const bar = mid(c(S.handL, mid(RJ.indexL, RJ.pinkyL)), c(S.handR, mid(RJ.indexR, RJ.pinkyR)));
  const h = hull(on.map((f) => ({ x: f.q.x, z: f.q.z })));
  return {
    com, plumb: new Vector3(com.x, floor, com.z), midFoot: new Vector3(mf.x, floor, mf.z), bar,
    base: h.map((p) => new Vector3(p.x, floor + 0.002, p.z)),
    comAhead: flat(com).dot(fwd), comSide: flat(com).dot(side), comHeight: com.y - floor,
    barAhead: flat(bar).dot(fwd), barHeight: bar.y - floor,
    inBase: h.length >= 3 ? inside(h, { x: com.x, z: com.z }) : null, planted: on.length,
    seen: !!(seen[S.pelvis] && seen[S.chest] && seen[S.thighL] && seen[S.thighR] && seen[S.shinL] && seen[S.shinR]),
  };
}
