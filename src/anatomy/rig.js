// THE ANATOMY RIG (#690, 13.10): the captured pose -> a rotation for each of the 19 body segments of the baked
// Z-Anatomy body (scripts/anatomy/bake-anatomy.mjs), then a 60-a-second motion track (#691, Ohad: "so smooth it's
// like a 60fps video"). Pure math on three's vectors - no scene, no DOM - so the gates run it in node on the corpus.
//
// The rules, each one a fault the June viewer had:
//  - sides from the MODEL's own '.l' / '.r' (it faces +z, its left is at +x): the June rig took the side from the x
//    sign, swapped every side and posed a mirrored body that faced backwards (#285, "head turned over");
//  - every segment keeps its anatomical length (one scale for the clip): bones never stretch or gap;
//  - a limb's roll comes from the plane it makes with the next segment, blended in by how bent that joint is - a
//    straight limb has no plane and keeps the swing from its parent, so the roll never pops when a limb straightens;
//  - the head comes from the ears and nose, held within 75 degrees of the chest, else the chest's turn;
//  - the soles follow the captured feet (the body is not pinned at the hips: a jump rises, a squat stays planted);
//  - captured poses (~10 a second) are smoothed, then joined by C1 cubic curves and sampled 60 times a second -
//    no corner in the motion at a captured frame.
import { Vector3, Quaternion, Matrix4 } from 'three';
import REST from './restJoints.js';

export const SEGMENTS = REST.segments.map((s) => s.name);
export const PARENT = REST.segments.map((s) => s.parent);
export const PIVOT = REST.segments.map((s) => new Vector3(...s.pivot));
export const RJ = Object.fromEntries(Object.entries(REST.joints).map(([k, v]) => [k, new Vector3(...v)]));
export const S = Object.fromEntries(SEGMENTS.map((n, i) => [n, i]));
export const NSEG = SEGMENTS.length;
export const TRACK_HZ = 60;
// the shoulder girdle's rise with the arm (buildTrack): deg of clavicle elevation = GAIN * x^2 / (x + 15), x = arm elevation - 40
const ENV = typeof process !== 'undefined' && process.env ? process.env : {};
const GIRDLE_GAIN = ENV.GIRDLE != null ? +ENV.GIRDLE : 0.18, GIRDLE_MAX = 25;   // 0.16 -> 0.18 refitted 13.10 when the subject guard let more real frames in
const HIP_ROT_MAX = 50 * Math.PI / 180;   // the knee-hinge roll's cap on the hip's turn (buildTrack)

const VIS = 0.5;
const fin = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const vis = (p) => fin(p) && (p.visibility == null || p.visibility >= VIS);
const V = (p) => new Vector3(p.x, p.y, p.z);
const midV = (a, b) => V(a).add(V(b)).multiplyScalar(0.5);

// ---- rotations -------------------------------------------------------------------------------------------------------
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _m1 = new Matrix4(), _m2 = new Matrix4();
// an orthonormal frame: x = primary, z = primary x secondary. null when secondary is (nearly) along primary.
function frame(pri, sec, out) {
  _x.copy(pri); if (_x.lengthSq() < 1e-12) return null; _x.normalize();
  _z.crossVectors(_x, sec); const s = _z.length(); if (s < 1e-6) return null; _z.divideScalar(s);
  _y.crossVectors(_z, _x);
  return out.makeBasis(_x, _y, _z);
}
// the full rotation taking (restPri, restSec) onto (posePri, poseSec): primary exact, secondary as close as it can be
export function basisQ(rp, rs, pp, ps) {
  if (!frame(rp, rs, _m1)) return null;
  const a = _m1.clone();
  if (!frame(pp, ps, _m2)) return null;
  return new Quaternion().setFromRotationMatrix(_m2.multiply(a.transpose()));
}
// how far a secondary is off its primary, 0..1 (sin of the angle) - the trust in the bend plane
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// swing from the parent's carried direction onto the captured one: no roll of its own
function swingFrom(parentQ, restDir, poseDir) {
  const from = restDir.clone().applyQuaternion(parentQ).normalize(), to = poseDir.clone().normalize();
  return new Quaternion().setFromUnitVectors(from, to).multiply(parentQ);
}
const DEG = Math.PI / 180;
// q = swing * twist, twist about `axis` (unit): the twist's signed angle and the swing
function swingTwist(q, axis) {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  const tw = new Quaternion(axis.x * d, axis.y * d, axis.z * d, q.w); if (tw.lengthSq() < 1e-12) tw.set(0, 0, 0, 1); else tw.normalize();
  const sw = q.clone().multiply(tw.clone().invert());
  let ang = 2 * Math.atan2(Math.hypot(tw.x, tw.y, tw.z), tw.w); if (tw.x * axis.x + tw.y * axis.y + tw.z * axis.z < 0) ang = -ang;
  if (ang > Math.PI) ang -= 2 * Math.PI; if (ang < -Math.PI) ang += 2 * Math.PI;
  return { sw, ang };
}
const clampSwing = (sw, lim) => { const a = 2 * Math.acos(Math.min(1, Math.abs(sw.w))); return a > lim ? new Quaternion().slerp(sw, lim / a) : sw; };
// the head against the chest. The ear line (in the chest's frame) gives the turn (yaw, +-80) and the side tilt (+-40);
// ears read the wrong way round (a turn past 100) are swapped back. The nose then nods the head about its ear axis
// (-45 down .. +40 up); a nose behind the ears is not a nod and is ignored.
const REST_EARS = () => RJ.earR.clone().sub(RJ.earL).normalize(), REST_FWD = () => RJ.nose.clone().sub(RJ.earMid);
const Y = new Vector3(0, 1, 0);
export function headQ(qChest, earL, earR, nose) {
  const inv = qChest.clone().invert();
  let side = earR.clone().sub(earL).applyQuaternion(inv); if (side.lengthSq() < 1e-8) return null; side.normalize();
  let q = new Quaternion().setFromUnitVectors(REST_EARS(), side);
  let st = swingTwist(q, Y);
  if (Math.abs(st.ang) > 100 * DEG) { side.negate(); q = new Quaternion().setFromUnitVectors(REST_EARS(), side); st = swingTwist(q, Y); }
  const yaw = Math.max(-80 * DEG, Math.min(80 * DEG, st.ang));
  let qs = clampSwing(st.sw, 40 * DEG).multiply(new Quaternion().setFromAxisAngle(Y, yaw));
  if (nose) {
    const axis = REST_EARS().applyQuaternion(qs);   // the posed ear axis (chest frame)
    const f0 = REST_FWD().applyQuaternion(qs), f1 = nose.clone().sub(earL.clone().add(earR).multiplyScalar(0.5)).applyQuaternion(inv);
    f0.addScaledVector(axis, -f0.dot(axis)); f1.addScaledVector(axis, -f1.dot(axis));
    if (f0.lengthSq() > 1e-8 && f1.lengthSq() > 1e-8) {
      f0.normalize(); f1.normalize();
      // signed about the ear axis (earR - earL points to his right: a positive turn about it lifts the face)
      let a = Math.atan2(new Vector3().crossVectors(f0, f1).dot(axis), f0.dot(f1));
      if (Math.abs(a) < 110 * DEG) { a = Math.max(-45 * DEG, Math.min(40 * DEG, a)); qs = new Quaternion().setFromAxisAngle(axis, a).multiply(qs); }
    }
  }
  return qChest.clone().multiply(qs);
}

// A HINGE (elbow, knee): the upper segment's swing from its parent, then its roll about its own axis so the joint's
// flexion axis - rest: upper x the direction the hinge flexes toward - lies on the captured one (upper x lower). The
// weight of the measured roll rises with the bend (15 -> 35 degrees); below it the previous roll is kept.
// ... and with how well the far end was seen (13.10, c31 18.7 s: a wrist read at 10% visibility put the bend plane
// anywhere and the upper arm rolled 155 degrees in one reading - its muscles and hand flipped with it); and the roll
// turns at most 60 degrees a reading (~600 deg/s, far over any lift) - a bigger step is a misread, taken in part.
const FWD = new Vector3(0, 0, 1), BACK = new Vector3(0, 0, -1), ROLL_STEP = 60 * Math.PI / 180;
function hingeQ(parentQ, restUpper, flexDir, poseUpper, poseLower, prevTau, lowerVis = 1) {
  const sw = swingFrom(parentQ, restUpper, poseUpper);
  const u = poseUpper.clone().normalize();
  let tau = prevTau;
  if (poseLower && poseLower.lengthSq() > 1e-10) {
    const bend = Math.acos(Math.max(-1, Math.min(1, u.dot(poseLower.clone().normalize()))));
    // a BIG bend's plane is trusted however well its far end was seen (13.10): the lower segment now stays in the hinge
    // plane (inHinge), so a held roll put a poorly seen hand by his thigh with it at his hip (c31 6.5 s) - from 40 deg
    // (all from 55) the roll follows the measured plane, still at most ROLL_STEP a reading. Measured: elbow out-of-plane
    // p90 8.6 -> 4.5, pops 972 -> 885.
    const vw = smooth(0.3, 0.7, Number.isFinite(lowerVis) ? lowerVis : 1), w = smooth(15 * DEG, 35 * DEG, bend) * Math.max(vw, smooth(40 * DEG, 55 * DEG, bend));
    if (w > 0) {
      const ax = new Vector3().crossVectors(u, poseLower).normalize();
      const a0 = new Vector3().crossVectors(restUpper, flexDir).normalize().applyQuaternion(sw);
      a0.addScaledVector(u, -a0.dot(u));
      if (a0.lengthSq() > 1e-10) {
        a0.normalize();
        const meas = Math.atan2(new Vector3().crossVectors(a0, ax).dot(u), a0.dot(ax));
        let d = meas - prevTau; d = Math.atan2(Math.sin(d), Math.cos(d));
        tau = prevTau + Math.max(-ROLL_STEP, Math.min(ROLL_STEP, w * d));
      }
    }
  }
  return { q: new Quaternion().setFromAxisAngle(u, tau).multiply(sw), tau };
}

function unBehind(lower, upper, chestQ) {
  if (ENV.UNBEHIND_OFF) return lower;
  const u = upper.clone().normalize(), down = new Vector3(0, -1, 0).applyQuaternion(chestQ);
  if (u.dot(down) < Math.cos(45 * Math.PI / 180)) return lower;
  const f = new Vector3(0, 0, 1).applyQuaternion(chestQ); f.addScaledVector(u, -f.dot(u)); if (f.lengthSq() < 1e-8) return lower; f.normalize();
  // ...and only a nearly straight arm (bent under 45 deg): a back squat's hands on the bar behind the neck really are behind
  // (c38: the rule on every bend cost 145 pops there)
  if (u.angleTo(lower) >= 45 * Math.PI / 180) return lower;
  const b = lower.dot(f); if (b >= 0) return lower;
  return lower.clone().addScaledVector(f, -b);
}
// A HINGE STAYS A HINGE (13.10): the roll above is taken from the measured bend only as far as it is trusted (a poorly
// seen wrist or ankle, a small bend) - but the forearm / shin then went straight to that same poorly seen point, so the
// joint bent SIDEWAYS: elbows bent 45-90 deg sat out of their own flexion plane by p90 54 deg, knees 14 (an elbow or a
// knee has a few degrees of side play). The lower segment now lies in the joint's plane - its rest carrying angle kept,
// HINGE_TOL either side - and the out-of-plane part of the measured direction, the least trusted part, gives way.
const HINGE_TOL = (+(ENV.HINGE_TOL || 8) * Math.PI) / 180;
function inHinge(upperQ, restUpper, flexDir, restLower, poseLower) {
  if (ENV.HINGE_TOL === 'off') return poseLower;
  const ax0 = new Vector3().crossVectors(restUpper, flexDir).normalize(), s0 = restLower.clone().normalize().dot(ax0);
  const ax = ax0.applyQuaternion(upperQ), len = poseLower.length(); if (len < 1e-9) return poseLower;
  const n = poseLower.clone().divideScalar(len), sv = n.dot(ax);
  const lo = Math.sin(Math.asin(s0) - HINGE_TOL), hi = Math.sin(Math.asin(s0) + HINGE_TOL);
  if (sv >= lo && sv <= hi) return poseLower;
  const want = Math.max(lo, Math.min(hi, sv)), inP = n.addScaledVector(ax, -sv); const l = inP.length(); if (l < 1e-6) return poseLower;
  return inP.multiplyScalar(Math.sqrt(1 - want * want) / l).addScaledVector(ax, want).multiplyScalar(len);
}

// FRONT / BACK CONFUSION (13.10, c21 rear-3/4 RFESS): MediaPipe decides for a stretch that the lifter faces the other
// way - his left and right labels swap and his depth mirrors - so the hips' heading jumps ~180 degrees in ONE frame and
// jumps back seconds later. A real turn takes many frames. Such a one-frame half-turn toggles a 'mirrored' state; the
// state the clip spends more time in is taken as the truth and the other spans are put back (sides swapped, depth
// mirrored about his hips). Returns new point arrays; the input is not touched.
const LR = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const headingOf = (p) => {
  if (!p || !fin(p[23]) || !fin(p[24]) || !fin(p[11]) || !fin(p[12])) return null;
  const x = p[24].x - p[23].x + p[12].x - p[11].x, z = p[24].z - p[23].z + p[12].z - p[11].z;
  return Math.hypot(x, z) > 1e-4 ? Math.atan2(z, x) : null;
};
export function fixFrontBack(frames) {
  // each frame takes the reading - as it is, or mirrored - whose heading is nearer the last one: a turn is continuous and
  // passes, a jump of more than 90 degrees is the mirror (the hips and shoulders flip a frame or two apart, so a
  // one-step 180 test missed most of them - 13.10, c21)
  const n = frames.length, flip = new Uint8Array(n); let ref = null;
  const dist = (x, y) => { let d = Math.abs(x - y) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  // a heading is only read where the hip and shoulder lines lie flat enough to name it: under 45% of their usual level
  // width (bent over, the lines tipped up - 13.10, c16 16.6 s: a 100-degree wobble of a near-vertical hip line was taken
  // for the mirror and the whole body flipped) the frame keeps the state before it
  const wid = (p) => (p && fin(p[23]) && fin(p[24]) && fin(p[11]) && fin(p[12]) ? Math.hypot(p[24].x - p[23].x + p[12].x - p[11].x, p[24].z - p[23].z + p[12].z - p[11].z) : NaN);
  const ws = frames.map((f) => wid(f.pts)).filter(Number.isFinite).sort((x, y) => x - y), wMed = ws.length ? ws[ws.length >> 1] : 0;
  // DECIDED PER STRETCH, NOT PER FRAME (13.10 #717b, c38 back squat: at each rep's bottom the tipped lines read -150 for
  // two frames, a frame-by-frame reference followed them, and standing up again at the true -30 read as the mirror - 166
  // good frames "fixed" into the wrong facing). A stretch = readable frames whose heading moves under 90 degrees from
  // one to the next (a real turn stays inside one). Each stretch is decided once, its first frames against the END of
  // the last LONG stretch (4+ frames): a two-frame wobble is decided, but never becomes the reference.
  const H = frames.map((f) => (wid(f.pts) >= 0.45 * wMed ? headingOf(f.pts) : null));
  const circMed = (as) => { let sx = 0, sz = 0; for (const a2 of as) { sx += Math.cos(a2); sz += Math.sin(a2); } const mean = Math.atan2(sz, sx); const d = as.map((a2) => { let x = a2 - mean; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; }).sort((x, y) => x - y); return mean + d[d.length >> 1]; };
  for (let i = 0; i < n;) {
    if (H[i] == null) { flip[i] = i ? flip[i - 1] : 0; i++; continue; }
    let j = i; while (j + 1 < n && H[j + 1] != null && dist(H[j + 1], H[j]) <= Math.PI / 2) j++;
    const hs = H.slice(i, j + 1);
    let f = 0;
    // a close call (the stretch's head near 90 degrees from the reference - a turn under way) keeps the facing: only a
    // clearly mirrored head (30+ degrees nearer as the mirror) is flipped (c33 53.9 s: the B-stance side swap, 82 : 98)
    if (ref != null) { const head = circMed(hs.slice(0, 5)); f = dist(head + Math.PI, ref) + Math.PI / 12 < dist(head, ref) ? 1 : 0; }
    for (let c = i; c <= j; c++) flip[c] = f;
    if (hs.length >= 4 || ref == null) ref = circMed(hs.slice(-5)) + f * Math.PI;
    i = j + 1;
  }
  const ones = flip.reduce((a, b) => a + b, 0);
  const bad = ones > n / 2 ? 0 : 1;
  if (!flip.some((f) => f === bad)) return { frames, fixed: 0 };
  // two failures look the same in the heading: the side labels swapped alone, or swapped AND the depth mirrored (he
  // was read as facing the other way). Each bad frame takes the repair that lands nearest the frame before it.
  const swapOnly = (pts) => { const p = pts.slice(); for (const [l, r] of LR) { p[l] = pts[r]; p[r] = pts[l]; } return p; };
  const mirrorZ = (pts) => { const hz = fin(pts[23]) && fin(pts[24]) ? (pts[23].z + pts[24].z) / 2 : 0; return pts.map((q) => (q ? { ...q, z: 2 * hz - q.z } : q)); };
  const KEY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  const near = (a2, b2) => { if (!a2 || !b2) return Infinity; let d = 0; for (const k of KEY) if (fin(a2[k]) && fin(b2[k])) d += Math.hypot(a2[k].x - b2[k].x, a2[k].y - b2[k].y, a2[k].z - b2[k].z); return d; };
  let fixed = 0, lastGood = null;
  const out = frames.map((f, i) => {
    if (flip[i] !== bad || !f.pts) { lastGood = f.pts || lastGood; return f; }
    const A = swapOnly(f.pts), Bm = mirrorZ(A);
    const p = lastGood && near(Bm, lastGood) < near(A, lastGood) ? Bm : A;
    fixed++; lastGood = p;
    return { ...f, pts: p, mirrored: true };
  });
  return { frames: out, fixed };
}

// LYING DOWN, FACE UP OR FACE DOWN, BY THE EXERCISE (14.10 #690, c27 / c06 bench presses: the chest read face-down on
// 559 of 3,286 frames of c27 in 30 flips, and for 36.8 s of c06 - impossible on a bench). The front/back fixer cannot
// see it: it reads the heading off the hip and shoulder lines, and a body lying along the camera's depth has none. The
// picture cannot either (measured: nose-above-the-ears says face-up on 149 of 311 c27 frames and 53 of 278 on c06,
// both benches - a turned head and a rolled phone). The LOGGED EXERCISE can, as it does for one-legged stances (#753):
// a bench / floor press, a fly, a pull-over, a bridge, a crunch is done face-up; a push-up, a plank, a prone raise face
// down. Every frame whose trunk lies within 30 degrees of level and reads the other way is turned 180 degrees about the
// trunk's long axis (through the hips). No such exercise name: nothing is changed. SUPINE=0 turns it off.
const SUPINE = ENV.SUPINE != null ? +ENV.SUPINE : (typeof window !== 'undefined' && window.__SUPINE != null ? +window.__SUPINE : 0);   // OFF until reviewed against the video (14.10: the c06 render lifted the legs)
export const FACE_UP_EX = /bench|chest[\s-]?press|floor[\s-]?press|\bfly\b|flye|pull[\s-]?over|skull[\s-]?crush|supine|lying|glute[\s-]?bridge|hip[\s-]?thrust|bridge|dead[\s-]?bug|crunch|sit[\s-]?up|leg[\s-]?raise|hollow/i;
export const FACE_DOWN_EX = /lying[\s-]?(leg|hamstring)[\s-]?curl|push[\s-]?up|press[\s-]?up|plank|prone|superman|mountain[\s-]?climb|bear[\s-]?crawl/i;
export const NOT_LYING_EX = /standing|seated|cable|machine|bent[\s-]?over|pec[\s-]?deck|kneeling/i;
// ...unless the name says the body lies (a Smith Machine Bench Press, a Machine Lying Leg Curl)
export const SURELY_LYING_EX = /lying|bench|prone|supine|floor/i;
// LYING=0 (node) turns the lying-trunk allowance off, for an A/B
const LYING_RULE = !(ENV.LYING != null && +ENV.LYING === 0);
export const lyingFacing = (title) => (!title ? 0 : FACE_DOWN_EX.test(String(title)) ? -1 : FACE_UP_EX.test(String(title)) ? 1 : 0);
// THE BAR ON HIS BACK HOLDS HIS HANDS (15.10 #717, c38 back squat: the arms popped 340 times in the rig gate - uarmR alone
// 114 - and the RAW elbows / wrists jumped over 15 cm in 100 ms 515 times, wrists up to 54 cm, while his hands sat on the
// bar beside his neck). With the bar on the back the arm hardly moves against the TRUNK, so each arm point is read in the
// trunk's own frame (shoulder line x spine) and replaced by its median over +-0.6 s: the trunk's own motion - the
// descent, the hinge, the walk-out - passes through untouched, only the arm's wobble against it is filtered. Only for a
// bar-on-back lift by the logged name (a front squat, a trap bar, dumbbells: the hands move with the load).
export const BAR_ON_BACK_EX = /back[\s-]?squat|good[\s-]?morning|(?:high|low)[\s-]?bar[\s-]?(?:back[\s-]?)?squat|(?:\bbb\b|barbell|back)[\s-]?(?:box|pause|pin)[\s-]?squat|(?:\bbb\b|barbell)[\s-]?(?:split[\s-]?squat|lunge|reverse[\s-]?lunge|walking[\s-]?lunge|rfess|rear[\s-]?foot|bulgarian|step[\s-]?up)/i;
const BAR_ARMS = !(ENV.BARARMS != null && +ENV.BARARMS === 0);
const ARM_IDX = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export function steadyBarArms(frames, exercise = '') {
  if (!BAR_ARMS || !BAR_ON_BACK_EX.test(String(exercise || '')) || /front[\s-]?squat|trap[\s-]?bar|\bdb\b|dumbbell|kettlebell|\bkb\b|goblet|safety[\s-]?bar|zercher/i.test(String(exercise || ''))) return frames;
  const W = 600;
  // the trunk frame of a frame: origin = the shoulder of that arm, x = left->right shoulder, y = spine, z = x * y
  const frameOf = (q) => {
    if (!q || !fin(q[11]) || !fin(q[12]) || !fin(q[23]) || !fin(q[24])) return null;
    const sx = q[12].x - q[11].x, sy = q[12].y - q[11].y, sz = q[12].z - q[11].z, sl = Math.hypot(sx, sy, sz); if (sl < 1e-6) return null;
    const x = [sx / sl, sy / sl, sz / sl];
    let u = [(q[11].x + q[12].x - q[23].x - q[24].x) / 2, (q[11].y + q[12].y - q[23].y - q[24].y) / 2, (q[11].z + q[12].z - q[23].z - q[24].z) / 2];
    const d = u[0] * x[0] + u[1] * x[1] + u[2] * x[2]; u = [u[0] - d * x[0], u[1] - d * x[1], u[2] - d * x[2]]; const ul = Math.hypot(...u); if (ul < 1e-6) return null;
    const y = u.map((v) => v / ul), z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    return { x, y, z };
  };
  const F = frames.map((f) => frameOf(f.pts));
  const local = frames.map((f, k) => { const B = F[k]; if (!B) return null; const q = f.pts; return ARM_IDX.map((i) => { const o = q[i <= 22 && i % 2 ? 11 : 12]; const p0 = q[i]; if (!fin(p0) || !fin(o)) return null; const v = [p0.x - o.x, p0.y - o.y, p0.z - o.z]; return [v[0] * B.x[0] + v[1] * B.x[1] + v[2] * B.x[2], v[0] * B.y[0] + v[1] * B.y[1] + v[2] * B.y[2], v[0] * B.z[0] + v[1] * B.z[1] + v[2] * B.z[2]]; }); });
  const med = (a) => { const s2 = a.slice().sort((m, n) => m - n); return s2[s2.length >> 1]; };
  return frames.map((f, k) => {
    const B = F[k]; if (!B || !local[k]) return f;
    const t = f.t, win = []; for (let j = k; j >= 0 && t - frames[j].t <= W; j--) if (local[j]) win.push(j); for (let j = k + 1; j < frames.length && frames[j].t - t <= W; j++) if (local[j]) win.push(j);
    if (win.length < 3) return f;
    const pts = f.pts.slice();
    ARM_IDX.forEach((i, a) => {
      const vals = win.map((j) => local[j][a]).filter(Boolean); if (vals.length < 3 || !fin(pts[i])) return;
      const m = [med(vals.map((v) => v[0])), med(vals.map((v) => v[1])), med(vals.map((v) => v[2]))];
      const o = pts[i % 2 ? 11 : 12];
      pts[i] = { ...pts[i], x: o.x + m[0] * B.x[0] + m[1] * B.y[0] + m[2] * B.z[0], y: o.y + m[0] * B.x[1] + m[1] * B.y[1] + m[2] * B.z[1], z: o.z + m[0] * B.x[2] + m[1] * B.y[2] + m[2] * B.z[2] };
    });
    return { ...f, pts, barArms: true };
  });
}

export function fixSupine(frames, exercise = '') {
  const facing = lyingFacing(exercise);
  // FACE-UP ONLY (measured): push-ups were already read face-down (0-2 short flips on c05 / c17 / c36) and turning their
  // odd frames cost c17 pops 20 -> 50; a face-down name only keeps a face-up rule from firing on it
  if (!SUPINE || facing <= 0) return { frames, fixed: 0 };
  // the chest's forward from the points: (shoulderR - shoulderL) x spine, its y NEGATIVE face-up (calibrated against the
  // rig's own chest axis: 190 : 57 on c27, 177 : 8 on c06)
  const want = facing > 0 ? -1 : 1;
  // per frame: the trunk's tilt from level and the chest's sign
  const info = frames.map((f) => {
    const q = f.pts; if (!q || !fin(q[11]) || !fin(q[12]) || !fin(q[23]) || !fin(q[24])) return null;
    const hip = { x: (q[23].x + q[24].x) / 2, y: (q[23].y + q[24].y) / 2, z: (q[23].z + q[24].z) / 2 };
    const u0 = { x: (q[11].x + q[12].x) / 2 - hip.x, y: (q[11].y + q[12].y) / 2 - hip.y, z: (q[11].z + q[12].z) / 2 - hip.z }, ul = Math.hypot(u0.x, u0.y, u0.z);
    if (ul < 1e-6) return null;
    const u = { x: u0.x / ul, y: u0.y / ul, z: u0.z / ul };
    return { hip, u, tilt: Math.abs(u.y), fy: (q[12].z - q[11].z) * u.x - (q[12].x - q[11].x) * u.z };
  });
  // A LYING STRETCH, not a lying frame (c06: sitting up between sets read 'lying' for 2-4 frames, and frames just past
  // 30 degrees inside a set were left unturned between turned ones - pops 36 -> 305): a run of frames within 45 degrees
  // of level (two unreadable frames bridged) holding 1 s+ within 30. Only such stretches are turned, every wrong frame.
  const out = frames.slice(); let fixed = 0;
  for (let a = 0; a < frames.length;) {
    if (!info[a] || info[a].tilt >= 0.7) { a++; continue; }
    let b = a, miss = 0;
    // (bridging a moment past 45 degrees inside the set was measured and rejected: a tipped frame's chest sign is not
    // trustworthy - c06 pops 107 -> 148)
    for (let k = a + 1; k < frames.length; k++) { if (info[k] && info[k].tilt < 0.7) { b = k; miss = 0; } else if (!info[k] && ++miss <= 2) continue; else break; }
    let core = 0; for (let k = a; k <= b; k++) if (info[k] && info[k].tilt < 0.5) core++;
    const coreMs = core * ((frames[b].t - frames[a].t) / Math.max(1, b - a));
    if (coreMs >= 1000) {
      for (let k = a; k <= b; k++) {
        const I = info[k]; if (!I || Math.abs(I.fy) < 1e-4 || Math.sign(I.fy) === want) continue;
        const { hip, u } = I;
        const rot = (p0) => { if (!p0 || !fin(p0)) return p0; const v = { x: p0.x - hip.x, y: p0.y - hip.y, z: p0.z - hip.z }; const d = v.x * u.x + v.y * u.y + v.z * u.z; return { ...p0, x: hip.x + 2 * d * u.x - v.x, y: hip.y + 2 * d * u.y - v.y, z: hip.z + 2 * d * u.z - v.z }; };
        // the trunk, head and arms only (indices 0-22): the legs keep their own reading - turned with the trunk, legs
        // hanging below the bench line were lifted into the air (14.10 c06 video check)
        out[k] = { ...frames[k], pts: frames[k].pts.map((p0, idx) => (idx <= 22 || SUPINE === 3 ? rot(p0) : p0)), supineFixed: true }; fixed++;
      }
    }
    a = b + 1;
  }
  return { frames: out, fixed };
}

// ---- one captured frame -> 19 world rotations + where the hips are ---------------------------------------------------
// p: frameToPoints3D points (y up, metres). prev: the previous frame's result (holds a part that is not there).
export function poseFrame(p, prev = null, width = null, lying = false) {
  const Q = new Array(NSEG).fill(null), seen = new Uint8Array(NSEG);
  const has = (...k) => k.every((i) => fin(p[i]));
  const sees = (...k) => k.every((i) => vis(p[i]));
  if (!p || !has(11, 12, 23, 24)) return null;
  // A TRUNK THE CAMERA DID NOT SEE IS NOT A POSE (13.10, c38: hips at visibility 0.02-0.06 while he was out of the frame -
  // MediaPipe's guessed body rolled over, 147 degrees in one frame). No knot: the track bridges it, drawn faded.
  // (all four under 0.2: a hip hidden behind a bench or a rack still has its shoulders seen - c05 lost its frames at a mean)
  const tv = Math.max(...[11, 12, 23, 24].map((k) => (p[k].visibility == null ? 1 : p[k].visibility)));
  if (tv < 0.2) return null;
  // AN UPSIDE-DOWN TRUNK IS A MISREAD, not a lift (13.10, the app's c31 read: setting up the phone at 1.3 s, MediaPipe
  // read his body inverted - the replay opened on an upside-down skeleton): shoulders more than 20 cm BELOW the hips
  // is no frame - the track bridges it, faded; nor a spine pointing more than 30 degrees below level (c22 40.5 s:
  // standing upright, read 19 cm 'below' - the model stood on its head). The bottom of an RDL is ~10 degrees below.
  // ...except on a LYING lift (15.10 #717d, c06 bench 30-32.4 s: MediaPipe read the lying spine 25-32 degrees below level,
  // the shoulders 20-25 cm under the hips - a flat bench along the camera's depth, the head a little low - and every such
  // frame was dropped: the body vanished for 2.5 s mid-set). With a face-up / face-down exercise logged the limits are
  // 30 cm / 37 degrees (20 cm / 30 for a standing body). Measured, heavy captures: c06 in view 54.3 -> 56.5 s of 56.5,
  // pops 36 -> 3, fit 17.0 -> 13.3 cm; c27 (the depth-flipping bench) fit 17.5 -> 17.0 but pops 1429 -> 1706 - its extra
  // frames sit in the same band as c06's good ones (no limit separates them). LYING=0 / LYING_DY / LYING_MIN (node).
  { const sp = midV(p[11], p[12]).sub(midV(p[23], p[24])), l = sp.length(); if (lying ? (sp.y < (ENV.LYING_DY != null ? +ENV.LYING_DY : -0.3) || (l > 1e-6 && sp.y / l < (ENV.LYING_MIN != null ? +ENV.LYING_MIN : -0.6))) : (sp.y < -0.2 || (l > 1e-6 && sp.y / l < -0.5))) return null; }
  const hipC = midV(p[23], p[24]), shoC = midV(p[11], p[12]), up = shoC.clone().sub(hipC);
  const restUp = RJ.shoMid.clone().sub(RJ.hipMid);
  const trunkSeen = sees(11, 12, 23, 24) ? 1 : 0;
  // the trunk: pelvis from the hip line, chest from the shoulder line, both standing on the spine
  // the SPINE is the exact axis, the hip / shoulder line the approximate one (13.10, c31 8.8 s: the shoulders 8 cm over
  // the hips - a trunk leaned ~80 degrees - and the chest turned only 28: with the shoulder line held exact, a line not
  // square to the spine bent the spine away)
  // A LINE TOO SHORT TO TURN BY (13.10, c22 42.4 s: the hip line read 5 cm of its 20 - rolling the pelvis about the spine
  // by it was noise and the body spun): under 40% of its clip width, the segment keeps its last roll and only swings onto
  // the new spine
  const shortLine = (a, b, w) => prev && w > 0 && V(p[b]).sub(V(p[a])).length() < 0.4 * w;
  Q[S.pelvis] = (shortLine(23, 24, width && width.hip) ? swingFrom(prev.Q[S.pelvis], restUp, up) : basisQ(restUp, RJ.hipR.clone().sub(RJ.hipL), up, V(p[24]).sub(V(p[23])))) || (prev ? prev.Q[S.pelvis] : new Quaternion());
  Q[S.chest] = (shortLine(11, 12, width && width.sho) ? swingFrom(prev.Q[S.chest], restUp, up) : basisQ(restUp, RJ.shoulderR.clone().sub(RJ.shoulderL), up, V(p[12]).sub(V(p[11])))) || Q[S.pelvis].clone();
  Q[S.lumbar] = Q[S.pelvis].clone().slerp(Q[S.chest], 0.5);
  seen[S.pelvis] = sees(23, 24) ? 1 : 0; seen[S.lumbar] = seen[S.chest] = trunkSeen;
  // the head: the EAR LINE turns and tilts it, the nose only nods it - both inside what a neck can do. A basis on
  // ears + nose flipped the head over whenever the nose read behind the ears (a lifter facing away, #285).
  const qh = has(7, 8) ? headQ(Q[S.chest], V(p[7]), V(p[8]), has(0) ? V(p[0]) : null) : null;
  Q[S.head] = qh || (prev ? prev.Q[S.head].clone() : Q[S.chest].clone());
  Q[S.neck] = Q[S.chest].clone().slerp(Q[S.head], 0.5);
  seen[S.head] = seen[S.neck] = sees(0, 7, 8) ? 1 : 0;
  // limbs: a HINGE gives its upper segment's roll. The elbow and the knee bend one way only, so the plane they bend in
  // names the upper arm's / thigh's roll uniquely; as the joint straightens (no plane) the roll fades to the last one
  // measured, never to a snap. The lower segments, hands and feet take their own direction (swing) and no roll of their
  // own: the palm and heel points rolled them 180 degrees between frames (13.10, 5,433 frames measured).
  const tw = {};
  for (const [sd, sh, el, wr, pk, ix, hp, kn, an, he, to] of [['L', 11, 13, 15, 17, 19, 23, 25, 27, 29, 31], ['R', 12, 14, 16, 18, 20, 24, 26, 28, 30, 32]]) {
    const clav = S['clav' + sd], ua = S['uarm' + sd], fa = S['farm' + sd], hd = S['hand' + sd], th = S['thigh' + sd], sn = S['shin' + sd], ft = S['foot' + sd];
    Q[clav] = Q[S.chest].clone(); seen[clav] = trunkSeen;
    const J = (k) => RJ[k + sd].clone();
    const hold = (i, fb) => (prev ? prev.Q[i].clone() : fb.clone());
    const prevTw = (k) => (prev && prev.tw && Number.isFinite(prev.tw[k + sd]) ? prev.tw[k + sd] : 0);
    // arm: the elbow flexes the forearm FORWARD in the anatomical rest pose (the model faces +z)
    // A HANGING ARM'S FOREARM IS NOT BEHIND IT (13.10 #726, c08 26 s: a dumbbell carried at his side read 25 deg behind the
    // upper arm - depth noise; an elbow flexes inward, forward or out, never back. The roll then went 164 deg to call it a
    // bend forward, the shoulder's rotation limit stopped it at 100 and the elbow bent sideways at the camera). With the
    // upper arm within 45 deg of hanging (the chest's down) and the arm nearly straight, the forearm's part pointing behind the
    // chest is dropped.
    const lowerArm = has(el, wr) ? unBehind(V(p[wr]).sub(V(p[el])), V(p[el]).sub(V(p[sh])), Q[S.chest]) : null;
    if (has(sh, el)) {
      const h = hingeQ(Q[clav], J('elbow').sub(J('shoulder')), FWD, V(p[el]).sub(V(p[sh])), lowerArm, prevTw('uarm'), has(wr) ? Math.min(p[wr].visibility ?? 1, p[el].visibility ?? 1) : 0);
      Q[ua] = h.q; tw['uarm' + sd] = h.tau;
    } else { Q[ua] = hold(ua, Q[clav]); tw['uarm' + sd] = prevTw('uarm'); }
    seen[ua] = sees(sh, el) ? 1 : 0;
    Q[fa] = has(el, wr) ? swingFrom(Q[ua], J('wrist').sub(J('elbow')), inHinge(Q[ua], J('elbow').sub(J('shoulder')), FWD, J('wrist').sub(J('elbow')), lowerArm)) : Q[ua].clone();
    seen[fa] = sees(el, wr) ? 1 : 0;
    const knuckles = has(pk, ix) ? midV(p[pk], p[ix]) : null;
    Q[hd] = has(wr) && knuckles ? swingFrom(Q[fa], J('index').add(J('pinky')).multiplyScalar(0.5).sub(J('wrist')), knuckles.sub(V(p[wr]))) : Q[fa].clone();
    seen[hd] = sees(wr, pk, ix) ? 1 : 0;
    // leg: the knee flexes the shin BACKWARD
    if (has(hp, kn)) {
      const h = hingeQ(Q[S.pelvis], J('knee').sub(J('hip')), BACK, V(p[kn]).sub(V(p[hp])), has(an) ? V(p[an]).sub(V(p[kn])) : null, prevTw('thigh'), has(an) ? Math.min(p[an].visibility ?? 1, p[kn].visibility ?? 1) : 0);
      Q[th] = h.q; tw['thigh' + sd] = h.tau;
    } else { Q[th] = hold(th, Q[S.pelvis]); tw['thigh' + sd] = prevTw('thigh'); }
    seen[th] = sees(hp, kn) ? 1 : 0;
    Q[sn] = has(kn, an) ? swingFrom(Q[th], J('ankle').sub(J('knee')), inHinge(Q[th], J('knee').sub(J('hip')), BACK, J('ankle').sub(J('knee')), V(p[an]).sub(V(p[kn])))) : Q[th].clone();
    seen[sn] = sees(kn, an) ? 1 : 0;
    Q[ft] = has(he, to) ? swingFrom(Q[sn], J('toe').sub(J('heel')), V(p[to]).sub(V(p[he]))) : Q[sn].clone();
    seen[ft] = sees(an, he, to) ? 1 : 0;
  }
  // A LIMB FADES FROM WHERE IT WAS LOST (13.10: a seen foot under an unseen shin was drawn solid on its own and looked
  // cut off the leg; 14.10 #742 follow-up: the whole-limb rule then faded c01's near arm on every bar rep - shoulder 1.00,
  // elbow 0.83, but the hand on the bar behind the plate 0.31). Each limb is solid from the body out, up to its first part
  // the camera did not see; that part and everything past it fade. A solid piece never hangs below a faded one.
  for (const sd of ['L', 'R']) for (const chain of [['uarm', 'farm', 'hand'], ['thigh', 'shin', 'foot']]) {
    const ids = chain.map((c) => S[c + sd]);
    if (LIMB_ONE) { const all = ids.every((i) => seen[i]) ? 1 : 0; for (const i of ids) seen[i] = all; continue; }
    let ok = 1; for (const i of ids) { ok = ok && seen[i] ? 1 : 0; seen[i] = ok; }
  }
  // the lowest point of the captured feet (the sole), for the floor
  let sole = Infinity; for (const k of [29, 30, 31, 32]) if (fin(p[k]) && p[k].y < sole) sole = p[k].y;
  return { Q, seen, tw, hip: hipC, sole: Number.isFinite(sole) ? sole : null, held: false };
}

// ---- the body's measures: one scale for the clip + each long segment's own length ------------------------------------
// B = { scale, len: Float32Array(NSEG) } - len stretches a segment ALONG its axis only (its width stays), so the thigh of
// a long-legged lifter is long without a thick femur, and the joint still meets the next bone.
const AXIS_CHILD = { thighL: 'shinL', thighR: 'shinR', shinL: 'footL', shinR: 'footR', uarmL: 'farmL', uarmR: 'farmR', farmL: 'handL', farmR: 'handR', lumbar: 'chest', chest: 'neck' };
export const AXIS = SEGMENTS.map((n) => (AXIS_CHILD[n] ? PIVOT[S[AXIS_CHILD[n]]].clone().sub(PIVOT[S[n]]).normalize() : null));
const _d = new Vector3();
// v (a rest offset inside segment i) stretched along i's axis
function stretch(v, i, B) { const a = AXIS[i], f = B.len ? B.len[i] : 1; if (a && f !== 1) v.addScaledVector(a, (f - 1) * v.dot(a)); return v.multiplyScalar(B.scale); }
// forward kinematics: rotations -> each segment's pivot in the world
export function fk(Q, root, B, out = PIVOT.map(() => new Vector3())) {
  out[0].copy(root);
  for (let i = 1; i < NSEG; i++) { const pa = PARENT[i]; out[i].copy(out[pa]).add(stretch(_d.copy(PIVOT[i]).sub(PIVOT[pa]), pa, B).applyQuaternion(Q[pa])); }
  return out;
}
// a rest point carried by segment i
export function carry(i, restPoint, Q, piv, B, out = new Vector3()) { return stretch(out.copy(restPoint).sub(PIVOT[i]), i, B).applyQuaternion(Q[i]).add(piv[i]); }
// the skinning matrix of segment i: rest model space -> world
const _m = new Matrix4(), _a = new Matrix4();
export function segMatrix(i, Q, piv, B, out = new Matrix4()) {
  out.makeTranslation(-PIVOT[i].x, -PIVOT[i].y, -PIVOT[i].z);
  const a = AXIS[i], f = (B.len ? B.len[i] : 1) * 1;
  _a.identity();
  if (a && f !== 1) { const k = f - 1; _a.set(1 + k * a.x * a.x, k * a.x * a.y, k * a.x * a.z, 0, k * a.y * a.x, 1 + k * a.y * a.y, k * a.y * a.z, 0, k * a.z * a.x, k * a.z * a.y, 1 + k * a.z * a.z, 0, 0, 0, 0, 1); }
  _a.multiplyScalar(B.scale); _a.elements[15] = 1;
  out.premultiply(_a);
  out.premultiply(_m.makeRotationFromQuaternion(Q[i]));
  out.premultiply(_m.makeTranslation(piv[i].x, piv[i].y, piv[i].z));
  return out;
}

const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
export function clipBody(pts) {
  const segs = { thigh: [[23, 25, 'hip', 'knee']], shin: [[25, 27, 'knee', 'ankle']], uarm: [[11, 13, 'shoulder', 'elbow']], farm: [[13, 15, 'elbow', 'wrist']] };
  const r = {}; for (const k of [...Object.keys(segs), 'trunk']) r[k] = [];
  for (const p of pts) {
    if (!p) continue;
    for (const [k, list] of Object.entries(segs)) for (const [a, b, ja, jb] of list) for (const [sd, off] of [['L', 0], ['R', 1]]) {
      if (vis(p[a + off]) && vis(p[b + off])) r[k].push(V(p[a + off]).distanceTo(V(p[b + off])) / RJ[ja + sd].distanceTo(RJ[jb + sd]));
    }
    if (vis(p[11]) && vis(p[12]) && vis(p[23]) && vis(p[24])) r.trunk.push(midV(p[11], p[12]).distanceTo(midV(p[23], p[24])) / RJ.shoMid.distanceTo(RJ.hipMid));
  }
  const all = Object.values(r).flat();
  const scale = all.length ? Math.max(0.6, Math.min(1.4, median(all))) : 1;
  const len = new Float32Array(NSEG).fill(1);
  const f = (k) => { const m = median(r[k]); return Number.isFinite(m) && r[k].length >= 5 ? Math.max(0.85, Math.min(1.15, m / scale)) : 1; };
  for (const sd of ['L', 'R']) { len[S['thigh' + sd]] = f('thigh'); len[S['shin' + sd]] = f('shin'); len[S['uarm' + sd]] = f('uarm'); len[S['farm' + sd]] = f('farm'); }
  len[S.lumbar] = len[S.chest] = f('trunk');
  return { scale, len };
}

// ---- the 60-a-second track ---------------------------------------------------------------------------------------------
const gauss = (vals, ts, sigma, n, dims) => {   // zero-phase Gaussian in TIME (uneven frame spacing), per channel
  const out = new Float64Array(vals.length);
  for (let i = 0; i < n; i++) {
    let wsum = 0; const acc = new Float64Array(dims);
    for (let j = i; j >= 0 && ts[i] - ts[j] <= 3 * sigma; j--) { const w = Math.exp(-(((ts[i] - ts[j]) / sigma) ** 2) / 2); wsum += w; for (let k = 0; k < dims; k++) acc[k] += w * vals[j * dims + k]; }
    for (let j = i + 1; j < n && ts[j] - ts[i] <= 3 * sigma; j++) { const w = Math.exp(-(((ts[j] - ts[i]) / sigma) ** 2) / 2); wsum += w; for (let k = 0; k < dims; k++) acc[k] += w * vals[j * dims + k]; }
    for (let k = 0; k < dims; k++) out[i * dims + k] = acc[k] / wsum;
  }
  return out;
};
// a NATURAL CUBIC SPLINE through (t_i, v_i), every channel: position, velocity AND acceleration continuous at every
// captured frame (C2). The C1 Catmull-Rom left a step in acceleration at each frame - measured 1.4-1.9x the
// acceleration there vs between frames on 23 clips; a linear blend 15-20x. Returns the second derivatives.
function splineM(vals, ts, n, dims) {
  const M = new Float64Array(n * dims); if (n < 3) return M;
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n);
  for (let k = 0; k < dims; k++) {
    for (let i = 1; i < n - 1; i++) {
      const h0 = Math.max(1e-6, ts[i] - ts[i - 1]), h1 = Math.max(1e-6, ts[i + 1] - ts[i]);
      a[i] = h0; b[i] = 2 * (h0 + h1); c[i] = h1;
      d[i] = 6 * ((vals[(i + 1) * dims + k] - vals[i * dims + k]) / h1 - (vals[i * dims + k] - vals[(i - 1) * dims + k]) / h0);
    }
    // Thomas algorithm on rows 1..n-2 (M_0 = M_{n-1} = 0)
    for (let i = 2; i < n - 1; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
    const x = new Float64Array(n);
    for (let i = n - 2; i >= 1; i--) x[i] = (d[i] - (i + 1 < n - 1 ? c[i] * x[i + 1] : 0)) / b[i];
    for (let i = 0; i < n; i++) M[i * dims + k] = x[i];
    // restore the diagonals for the next channel
    for (let i = 1; i < n - 1; i++) { const h0 = Math.max(1e-6, ts[i] - ts[i - 1]), h1 = Math.max(1e-6, ts[i + 1] - ts[i]); b[i] = 2 * (h0 + h1); }
  }
  return M;
}
function splineAt(vals, M, ts, dims, t, i, out) {
  const h = Math.max(1e-6, ts[i + 1] - ts[i]), A = Math.max(0, Math.min(1, (ts[i + 1] - t) / h)), Bq = 1 - A, h2 = (h * h) / 6;
  for (let k = 0; k < dims; k++) out[k] = A * vals[i * dims + k] + Bq * vals[(i + 1) * dims + k] + ((A * A * A - A) * M[i * dims + k] + (Bq * Bq * Bq - Bq) * M[(i + 1) * dims + k]) * h2;
}

// JOINT LIMITS (research 13.10, RESEARCH-ANATOMY-RIG.md 7, lifting-sized clamps): each segment's turn against its parent,
// split into the swing of its bone and the twist about it, each held inside what that joint can do. A hand or a foot is
// a short landmark segment (8-20 cm) with noisy depth: measured 13.10 on 5,433 captured frames, the hands jumped > 60
// degrees between two frames in ~25% of frames, the feet ~20%, the forearms ~15% - a flipped limb, not a movement.
// [max swing, max twist] in degrees; the rest axis is the segment's own bone in the model.
const LIMIT = { lumbar: [45, 20], chest: [45, 35], neck: [50, 45], head: [50, 50], clavL: [30, 30], clavR: [30, 30],
  uarmL: [180, 100], uarmR: [180, 100], farmL: [155, 90], farmR: [155, 90], handL: [85, 20], handR: [85, 20],
  thighL: [140, 50], thighR: [140, 50], shinL: [160, 25], shinR: [160, 25], footL: [60, 25], footR: [60, 25] };
const OWN_AXIS = SEGMENTS.map((nm, i) => {
  if (AXIS[i]) return AXIS[i];
  const sd = nm.slice(-1), j = (k) => RJ[k + sd];
  if (nm.startsWith('hand')) return j('index').clone().add(j('pinky')).multiplyScalar(0.5).sub(j('wrist')).normalize();
  if (nm.startsWith('foot')) return j('toe').clone().sub(j('heel')).normalize();
  if (nm.startsWith('clav')) return j('shoulder').clone().sub(j('sc')).normalize();
  if (nm === 'neck') return RJ.c1.clone().sub(RJ.c7t1).normalize();
  if (nm === 'head') return RJ.crown.clone().sub(RJ.c1).normalize();
  return null;
});
const LIMIT_RAD = SEGMENTS.map((nm) => (LIMIT[nm] ? LIMIT[nm].map((d) => (d * Math.PI) / 180) : null));
// THE HIP DOES NOT CROSS THE MIDLINE (13.10, c38 far rear view: MediaPipe's collapsed picture crossed the legs). Real
// hip adduction stops at ~25 degrees (research 13.10, 7): the thigh's direction, in the pelvis's own frame, may not swing
// past that toward the other leg (the model's left is +x, its rest thigh points down -y).
const ADDUCT_MAX = 25 * Math.PI / 180;
function limitHip(L, s) {
  const left = SEGMENTS[s] === 'thighL'; if (!left && SEGMENTS[s] !== 'thighR') return L;
  const rest = AXIS[s]; const d = rest.clone().applyQuaternion(L);   // the thigh in the pelvis frame
  const medial = left ? -d.x : d.x, down = Math.hypot(d.y, d.z);
  const add = Math.atan2(medial, down);
  if (add <= ADDUCT_MAX) return L;
  const want = d.clone(); const k = Math.tan(ADDUCT_MAX) * down; want.x = left ? -k : k; want.normalize();
  return L.premultiply(new Quaternion().setFromUnitVectors(d.normalize(), want));
}
// THE WRIST BENDS LITTLE SIDEWAYS (13.10): the hand's one 85 degree cone let it turn 73 degrees toward the thumb - 16%
// of the corpus's wrist-deviation readings were past the human range (radial ~20, ulnar ~30-35, AAOS norms). In the
// forearm's own frame (rest = palms forward: +z the palm, x the thumb / little-finger side) the side bend is held to
// radial 25 / ulnar 40 by a turn about the forearm's front-back axis; flexion keeps its own wide range. Only with the
// hand below the wrist (a quarter of it pointing down) - flexed past 75 degrees a hand has no side bend to read.
const RAD_MAX = 25 * Math.PI / 180, ULN_MAX = 40 * Math.PI / 180, _zAx = new Vector3(0, 0, 1);
function limitWrist(L, s) {
  const nm = SEGMENTS[s]; if (nm !== 'handL' && nm !== 'handR') return L;
  const sd = nm === 'handL' ? 1 : -1, a = OWN_AXIS[s], d = a.clone().applyQuaternion(L);
  if (-d.y < 0.25) return L;
  const uln = Math.atan2(-sd * d.x, -d.y) - Math.atan2(-sd * a.x, -a.y);
  const want = Math.max(-RAD_MAX, Math.min(ULN_MAX, uln)); if (want === uln) return L;
  return L.premultiply(new Quaternion().setFromAxisAngle(_zAx, sd * (uln - want)));
}
export function limitLocal(L, s) {
  limitHip(L, s); limitWrist(L, s);
  const lim = LIMIT_RAD[s], ax = OWN_AXIS[s]; if (!lim || !ax) return L;
  const { sw, ang } = swingTwist(L, ax);
  const tw = Math.max(-lim[1], Math.min(lim[1], ang));
  const out = clampSwing(sw, lim[0]).multiply(new Quaternion().setFromAxisAngle(ax, tw));
  return L.copy(out);
}
// HAMPEL: one captured frame whose joint turn is far from its neighbours' (more than 3 MADs and more than 15 degrees
// from the median of +-3 frames) is a misread, not a movement - it takes the median (Pose2Sim's default, research 13.10)
function hampel(LW, ts, n, nseg, half = 3) {
  if (n < 2 * half + 1) return;
  const out = LW.slice(), d = new Float64Array(2 * half + 1), comp = [[], [], []];
  for (let s = 0; s < nseg; s++) for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n - 1, i + half);
    const med = [0, 0, 0];
    for (let c = 0; c < 3; c++) { comp[c].length = 0; for (let j = a; j <= b; j++) comp[c].push(LW[(j * nseg + s) * 3 + c]); comp[c].sort((x, y) => x - y); med[c] = comp[c][comp[c].length >> 1]; }
    let k = 0; for (let j = a; j <= b; j++) { const o = (j * nseg + s) * 3; d[k++] = Math.hypot(LW[o] - med[0], LW[o + 1] - med[1], LW[o + 2] - med[2]); }
    const dd = Array.from(d.subarray(0, k)).sort((x, y) => x - y), mad = 1.4826 * dd[dd.length >> 1];
    const o = (i * nseg + s) * 3, dev = Math.hypot(LW[o] - med[0], LW[o + 1] - med[1], LW[o + 2] - med[2]);
    if (dev > Math.max(3 * mad, (15 * Math.PI) / 180)) { out[o] = med[0]; out[o + 1] = med[1]; out[o + 2] = med[2]; }
  }
  LW.set(out);
}

// quaternion log / exp (unit quaternion <-> rotation vector, radians)
function qlog(q, out, o) {
  let { x, y, z, w } = q; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z), a = 2 * Math.atan2(s, w), f = s > 1e-9 ? a / s : 2;
  out[o] = x * f; out[o + 1] = y * f; out[o + 2] = z * f;
}
function qexp(v, o, q) {
  const x = v[o], y = v[o + 1], z = v[o + 2], a = Math.hypot(x, y, z);
  if (a < 1e-9) return q.set(x / 2, y / 2, z / 2, 1).normalize();
  const s = Math.sin(a / 2) / a; return q.set(x * s, y * s, z * s, Math.cos(a / 2));
}
// MONOTONE CUBIC HERMITE (Fritsch-Carlson / Fritsch-Butland tangents): C1, local, and it never overshoots between two
// captured frames - a natural spline is global (one wild frame rings through its neighbours) and overshoots at every
// fast turn (research 13.10, RESEARCH-ANATOMY-RIG.md 5.3).
function monoTangents(vals, ts, n, dims) {
  const T = new Float64Array(n * dims); if (n < 2) return T;
  const d = new Float64Array(n - 1);
  for (let k = 0; k < dims; k++) {
    for (let i = 0; i < n - 1; i++) d[i] = (vals[(i + 1) * dims + k] - vals[i * dims + k]) / Math.max(1e-6, ts[i + 1] - ts[i]);
    T[k] = d[0]; T[(n - 1) * dims + k] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) { T[i * dims + k] = 0; continue; }
      const h0 = ts[i] - ts[i - 1], h1 = ts[i + 1] - ts[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
      T[i * dims + k] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return T;
}
function hermiteAt(vals, T, ts, dims, t, i, out) {
  const h = Math.max(1e-6, ts[i + 1] - ts[i]), u = Math.max(0, Math.min(1, (t - ts[i]) / h)), u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let k = 0; k < dims; k++) out[k] = h00 * vals[i * dims + k] + h10 * h * T[i * dims + k] + h01 * vals[(i + 1) * dims + k] + h11 * h * T[(i + 1) * dims + k];
}

// PLANTED FEET STAY WHERE THEY ARE (research 13.10, 4.2-4.3): each planted stretch of a foot gets ONE spot - where its
// ankle was, on average, through the stretch, at the floor's ankle height - and every frame of the stretch reaches it with
// analytic two-bone leg IK (Holden): the knee bends in the plane it already bends in (his captured knee is the pole), the
// thigh and shin keep their lengths, the foot keeps its flat turn. No slide, no hover, both feet on the floor at once.
const TOES_PITCH = -50 * Math.PI / 180, FLAT_BIAS = -15 * Math.PI / 180;
// a gap in the readings up to this long is bridged by the curve (and counts as in view between two readings in view);
// a longer one holds the nearer real pose (13.10: 600 -> 800 ms - a 0.67 s blur in c21 was held, then snapped)
const GAP_HOLD = 800, VIEW_BRIDGE = 2500;   // the subject guard re-locks after 2 s - its gaps run to ~2.3 s
function footLock(QV, RV, n, contact, B, floor, toes, standOn = null) {
  const Qs = PIVOT.map(() => new Quaternion()), piv = PIVOT.map(() => new Vector3()), root = new Vector3();
  const load = (a) => { for (let s = 0; s < NSEG; s++) Qs[s].fromArray(QV, (a * NSEG + s) * 4); root.fromArray(RV, a * 3); fk(Qs, root, B, piv); };
  // two-bone IK on one frame: the ankle onto T, the knee in its own bend plane, the foot's world turn kept
  // THE ANGLES COME FIRST (13.10 #718, the new angle gate verify-anatomy-angles.mjs: with the ankle forced onto its
  // planted spot the knee read 5.6 deg median / 23.9 p90 off the picture on side-on frames - c29 RDL: 125 vs 168 - and
  // 2.9 / 11.3 without the lock). The ankle goes to its spot only as far as it bends the knee and swings the thigh by
  // under LOCK_MAX (8) degrees; beyond that the foot gives way by a few cm instead of the knee bending wrong.
  const LOCK_MAX = (+((typeof process !== "undefined" && process.env && process.env.LOCK_MAX) || 90) * Math.PI) / 180;
  const legIK = (Hp, K, A, T, l1, l2) => {
    const toT = T.clone().sub(Hp); let d = toT.length(); if (d < 1e-4) return null;
    d = Math.min(d, l1 + l2 - 1e-3); const u = toT.normalize();
    const pole = K.clone().sub(Hp); pole.addScaledVector(u, -pole.dot(u));
    if (pole.lengthSq() < 1e-10) return null; pole.normalize();
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    return { K2: Hp.clone().addScaledVector(u, x).addScaledVector(pole, h), A2: Hp.clone().addScaledVector(u, d) };
  };
  const kneeAng = (Hp, K, A) => Hp.clone().sub(K).angleTo(A.clone().sub(K));
  const solveLeg = (c, th, sn, ft, T0) => {
    load(c);
    const Hp = piv[th].clone(), K = piv[sn].clone(), A = piv[ft].clone();
    const l1 = K.distanceTo(Hp), l2 = A.distanceTo(K);
    if (l1 < 1e-4 || l2 < 1e-4) return;
    const k0 = kneeAng(Hp, K, A), t0 = K.clone().sub(Hp).normalize();
    const within = (s) => s && Math.abs(kneeAng(Hp, s.K2, s.A2) - k0) <= LOCK_MAX && t0.angleTo(s.K2.clone().sub(Hp).normalize()) <= LOCK_MAX;
    let T = T0, sol = legIK(Hp, K, A, T0, l1, l2);
    if (!within(sol)) {   // the largest step toward the spot that keeps both inside the limit
      let lo = 0, hi = 1, best = null;
      for (let it = 0; it < 7; it++) { const w = (lo + hi) / 2, Tw = A.clone().lerp(T0, w), s = legIK(Hp, K, A, Tw, l1, l2); if (within(s)) { lo = w; best = s; T = Tw; } else hi = w; }
      if (!best) return; sol = best;
    }
    if (!sol) return;
    const { K2, A2 } = sol; void T;
    const qT = new Quaternion().setFromUnitVectors(K.clone().sub(Hp).normalize(), K2.clone().sub(Hp).normalize());
    const newTh = qT.clone().multiply(Qs[th]);
    const shinDir = A.clone().sub(K).normalize().applyQuaternion(qT);
    const qS = new Quaternion().setFromUnitVectors(shinDir, A2.clone().sub(K2).normalize());
    const newSn = qS.multiply(qT).multiply(Qs[sn]);
    newTh.toArray(QV, (c * NSEG + th) * 4); newSn.toArray(QV, (c * NSEG + sn) * 4);
  };
  // PASS 1 - every planted stretch's spot: the median ankle, level, on the floor (or on the step it stands on)
  const spot = { L: new Array(n).fill(null), R: new Array(n).fill(null) };
  for (const sd of ['L', 'R']) {
    const ft = S['foot' + sd], ankleUp = (RJ['ankle' + sd].y - Math.min(RJ['heel' + sd].y, RJ['toe' + sd].y)) * B.scale;
    for (let a = 0; a < n;) {
      if (!contact[sd][a]) { a++; continue; }
      let b = a; while (b + 1 < n && contact[sd][b + 1]) b++;
      if (!(toes && toes[sd][a])) {
        const xs = [], zs = [], ys = [];
        for (let c = a; c <= b; c++) { load(c); xs.push(piv[ft].x); zs.push(piv[ft].z); ys.push(piv[ft].y); }
        xs.sort((x, y) => x - y); zs.sort((x, y) => x - y); ys.sort((x, y) => x - y);
        const yMed = ys[ys.length >> 1], yFloor = floor + ankleUp;
        const T = new Vector3(xs[xs.length >> 1], yMed - yFloor > 0.05 ? yMed : yFloor, zs[zs.length >> 1]);
        for (let c = a; c <= b; c++) spot[sd][c] = T;
      }
      a = b + 1;
    }
  }
  // PASS 2 - THE BODY MOVES, NOT THE KNEE (13.10 #718): the read hips and the planted spot disagree by a few cm with a
  // fixed-length leg; bending the knee to close that gap put the knee 24 deg off the picture (p90, side-on frames). The
  // whole body shifts, level, by the mean of its planted feet's gaps (at most 15 cm) - a pure shift costs no angle, and
  // the picture-match gate ignores it - then the capped leg solve below closes what is left.
  for (let c = 0; c < n; c++) {
    const ds = [];
    for (const sd of ['L', 'R']) if (spot[sd][c]) { load(c); const A = piv[S['foot' + sd]]; ds.push([spot[sd][c].x - A.x, spot[sd][c].z - A.z]); }
    if (!ds.length) continue;
    let dx = ds.reduce((q, d) => q + d[0], 0) / ds.length, dz = ds.reduce((q, d) => q + d[1], 0) / ds.length;
    const mg = Math.hypot(dx, dz), cap = 0.15 * B.scale; if (mg > cap) { dx *= cap / mg; dz *= cap / mg; }
    RV[c * 3] += dx; RV[c * 3 + 2] += dz;
  }
  // PASS 3 - NO FOOT PLANTED, A KNEE UNDER THE FLOOR: THE BODY RISES (13.10 #718, c35 Pendlay row: at each dead stop the
  // plate hid his shins, neither foot read planted, the body sat too low, and the knee lifts below folded his legs from a
  // read 84 degrees to 46 - he knelt on the floor while the video shows him bent over the bar). The whole body goes up by
  // its lowest knee / ankle's depth under the floor (at most 60 cm) before any leg is bent to clear it.
  {
    const kneeR0 = 0.045 * B.scale;
    for (let c = 0; c < n; c++) {
      if (contact.L[c] || contact.R[c]) continue;
      load(c);
      let low = Infinity;
      for (const sd of ['L', 'R']) {
        const up = (RJ['ankle' + sd].y - Math.min(RJ['heel' + sd].y, RJ['toe' + sd].y)) * B.scale;
        low = Math.min(low, piv[S['shin' + sd]].y - (floor + kneeR0), piv[S['foot' + sd]].y - (floor + up));
      }
      if (low < 0) RV[c * 3 + 1] += Math.min(-low, 0.6 * B.scale);
    }
  }
  for (const sd of ['L', 'R']) {
    const th = S['thigh' + sd], sn = S['shin' + sd], ft = S['foot' + sd];
    const ankleUp = (RJ['ankle' + sd].y - Math.min(RJ['heel' + sd].y, RJ['toe' + sd].y)) * B.scale;
    let a = 0;
    while (a < n) {
      if (!contact[sd][a]) { a++; continue; }
      let b = a; while (b + 1 < n && contact[sd][b + 1]) b++;
      // on its TOES the ankle swings about the toe through every push-up (c36): only the toe stays put - the body's height
      // already stands it on the floor, so the ankle is not pinned
      if (toes && toes[sd][a]) { a = b + 1; continue; }
      // the stretch's spot: the median ankle, level, on the floor
      const xs = [], zs = [];
      for (let c = a; c <= b; c++) { load(c); xs.push(piv[ft].x); zs.push(piv[ft].z); }
      xs.sort((x, y) => x - y); zs.sort((x, y) => x - y);
      // its height: the floor - or, a foot planted on a bench or a step (its ankle over 8 cm above the floor's ankle
      // height through the stretch), that height (c21: the rear foot of an RFESS was pulled down a bench)
      const ys = []; for (let c = a; c <= b; c++) { load(c); ys.push(piv[ft].y); } ys.sort((x, y) => x - y);
      const yMed = ys[ys.length >> 1], yFloor = floor + ankleUp;
      const T = new Vector3(xs[xs.length >> 1], yMed - yFloor > 0.05 ? yMed : yFloor, zs[zs.length >> 1]);   // (a foot on its toes keeps its ankle height too)
      for (let c = a; c <= b; c++) solveLeg(c, th, sn, ft, spot[sd][c] || T);
      a = b + 1;
    }
    // NOTHING GOES THROUGH THE FLOOR (13.10, c31: the rear foot 13 cm under it; then the kneeling knee and shin sank
    // into the floor and only the clamped foot showed - a foot cut off its leg). A leg in the air: its KNEE kept at its
    // own radius above the floor (the thigh turned about the hip), then its ANKLE (the shin turned about the knee).
    const kneeR = 0.045 * B.scale;
    // the hands' floor: the feet's - or lower, where the wrists keep resting (a push-up: on his toes the ankle floor sat
    // ~5 cm high and lifted hands that were on the floor - 13.10, c05 / c17); a brief dip under it is still lifted
    const wy = []; for (let c = 0; c < n; c++) { load(c); wy.push(piv[S['hand' + sd]].y - 0.02 * B.scale); } wy.sort((x, y) => x - y);
    const handFloor = floor;
    // A HAND THAT STAYS DOWN IS PLANTED (a push-up: lifting it bent his arms, 13.10 c05 / c17): a run of more than 3
    // frames with the hand at the floor is left where it is; only a brief dip under the floor (a reach) is lifted
    const handDown = new Uint8Array(n); { const hdS = S['hand' + sd]; for (let c = 0; c < n; c++) { load(c); handDown[c] = piv[hdS].y < floor + 0.06 ? 1 : 0; } }
    const handPlanted = new Uint8Array(n); for (let c = 0; c < n;) { if (!handDown[c]) { c++; continue; } let e = c; while (e + 1 < n && handDown[e + 1]) e++; if (e - c + 1 > 3) for (let k = c; k <= e; k++) handPlanted[k] = 1; c = e + 1; }
    const lift = (c, seg, child, minY, point = null) => {
      load(c); const P0 = piv[seg].clone(), C0 = point ? carry(seg, point, Qs, piv, B) : piv[child].clone(); if (C0.y >= minY) return;
      const v = C0.clone().sub(P0), l = v.length(); const dy = minY - P0.y; if (Math.abs(dy) >= l) return;
      const hzz = Math.hypot(v.x, v.z) || 1e-6, hz2 = Math.sqrt(l * l - dy * dy);
      const want = new Vector3((v.x / hzz) * hz2, dy, (v.z / hzz) * hz2);
      const q = new Quaternion().setFromUnitVectors(v.normalize(), want.normalize());
      // turn this segment and keep everything below it attached (their world turns follow)
      const below = [seg]; for (let k = 0; k < NSEG; k++) if (below.includes(PARENT[k])) below.push(k);
      for (const k of below) { const o = (c * NSEG + k) * 4; Qs[k].fromArray(QV, o).premultiply(q).toArray(QV, o); }
    };
    for (let c = 0; c < n; c++) {
      // A HIDDEN FOOT HE STANDS ON (#750, standOn: planted, not locked): set on the floor where the fill put it, by the same
      // two-bone solve - folded up by the lift below instead, c01's hidden leg stood like a flamingo, knee forward and the
      // foot up behind
      if (standOn && standOn[sd][c] && !contact[sd][c]) { load(c); const T = piv[ft].clone(); T.y = floor + ankleUp; solveLeg(c, th, sn, ft, T); continue; }
      if (!contact[sd][c]) {
        lift(c, th, sn, floor + kneeR);
        lift(c, sn, ft, floor + ankleUp);
        // and the foot's lowest point (toe or heel) on top of the floor - the foot turned about the ankle
        load(c);
        const toe = carry(ft, RJ['toe' + sd], Qs, piv, B), heel = carry(ft, RJ['heel' + sd], Qs, piv, B);
        lift(c, ft, null, floor, toe.y <= heel.y ? RJ['toe' + sd] : RJ['heel' + sd]);
      }
      // the hands too (c31 4.0 s: reaching down, the hand went through the floor): the elbow, then the wrist, then the
      // finger tips kept on top of it
      const ua = S['uarm' + sd], fa = S['farm' + sd], hd = S['hand' + sd];
      if (handPlanted[c]) {
        // A PLANTED HAND LIES FLAT (13.10, c36: at the top of a push-up the fingers pointed down through the floor), its
        // wrist ON the floor, not under it (the far hand sat 6-8 cm down): the arm reaches it with the same two-bone solve
        // as a planted leg - the elbow bends in its own plane, upper arm and forearm keep their lengths - then the hand is
        // turned about the wrist, its heading kept, so the finger tips sit level with the wrist, just under it
        load(c); if (piv[hd].y < handFloor + 0.03 * B.scale) { const T = piv[hd].clone(); T.y = handFloor + 0.03 * B.scale; solveLeg(c, ua, fa, hd, T); }
        load(c); const W0 = piv[hd].clone(), tip = carry(hd, RJ['handTip' + sd], Qs, piv, B), v = tip.clone().sub(W0), l = v.length(), hz = Math.hypot(v.x, v.z);
        if (l > 1e-4 && hz > 1e-4) {
          const want = new Vector3(v.x / hz, 0, v.z / hz).multiplyScalar(Math.sqrt(Math.max(0, l * l - (0.02 * B.scale) ** 2))).setY(-0.02 * B.scale);
          const q = new Quaternion().setFromUnitVectors(v.normalize(), want.normalize()); const o = (c * NSEG + hd) * 4; Qs[hd].fromArray(QV, o).premultiply(q).toArray(QV, o);
        }
        continue;
      }
      lift(c, ua, fa, handFloor + 0.03 * B.scale);
      lift(c, fa, hd, handFloor + 0.02 * B.scale);
      lift(c, hd, null, handFloor + 0.005, RJ['handTip' + sd]);
    }
  }
}

// CLEAN THE TURNS FIRST (13.10): each segment against its parent, held inside its joint limits and with one-frame misreads
// replaced (Hampel on the log turn), then rebuilt down the chain - BEFORE the feet. Done after them, the outlier filter
// took the planted-foot IK back out (contacts flicker, so an IK'd frame looked like an outlier) and the feet hovered.
function cleanWorld(QV, ts, n) {
  const L = new Float64Array(n * NSEG * 4), qp = new Quaternion(), qs = new Quaternion(), q = new Quaternion(), prev = PIVOT.map(() => null);
  for (let a = 0; a < n; a++) for (let s = 0; s < NSEG; s++) {
    qs.fromArray(QV, (a * NSEG + s) * 4);
    if (PARENT[s] >= 0) { qp.fromArray(QV, (a * NSEG + PARENT[s]) * 4); q.copy(qp).invert().multiply(qs); limitLocal(q, s); } else q.copy(qs);
    if (prev[s] && q.dot(prev[s]) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    prev[s] = q.clone(); q.toArray(L, (a * NSEG + s) * 4);
  }
  const LW = new Float64Array(n * NSEG * 3), REF = [];
  for (let s = 0; s < NSEG; s++) {
    let x = 0, y = 0, z = 0, w = 0; for (let a = 0; a < n; a++) { const o = (a * NSEG + s) * 4; x += L[o]; y += L[o + 1]; z += L[o + 2]; w += L[o + 3]; }
    const ref = new Quaternion(x, y, z, w); if (ref.lengthSq() < 1e-12) ref.set(0, 0, 0, 1); ref.normalize(); REF.push(ref);
    const inv = ref.clone().invert();
    for (let a = 0; a < n; a++) {
      q.fromArray(L, (a * NSEG + s) * 4); const o = (a * NSEG + s) * 3; qlog(inv.clone().multiply(q), LW, o);
      if (a > 0) { const p0 = o - NSEG * 3, len = Math.hypot(LW[o], LW[o + 1], LW[o + 2]); if (len > 1e-6) { let best = 0, bd = Infinity; for (const k of [-1, 0, 1]) { const f = 1 + (k * 2 * Math.PI) / len; const d = (LW[o] * f - LW[p0]) ** 2 + (LW[o + 1] * f - LW[p0 + 1]) ** 2 + (LW[o + 2] * f - LW[p0 + 2]) ** 2; if (d < bd) { bd = d; best = k; } } if (best) { const f = 1 + (best * 2 * Math.PI) / len; LW[o] *= f; LW[o + 1] *= f; LW[o + 2] *= f; } } }
    }
  }
  hampel(LW, ts, n, NSEG);
  const W = PIVOT.map(() => new Quaternion()), Lq = new Quaternion();
  for (let a = 0; a < n; a++) for (let s = 0; s < NSEG; s++) {
    qexp(LW, (a * NSEG + s) * 3, Lq); Lq.premultiply(REF[s]);
    if (PARENT[s] >= 0) W[s].copy(W[PARENT[s]]).multiply(Lq); else W[s].copy(Lq);
    W[s].toArray(QV, (a * NSEG + s) * 4);
  }
}

// HIS SIZE IN THE PICTURE, whichever way he lies (13.10, c36 push-ups: the nose-to-ankle HEIGHT of a horizontal body
// is 26 px of a 300 px man - every speed and distance measured in "body heights" was 10x too big, and no foot ever read
// planted). Standing, the nose-to-ankle height (median); lying or bent over, his length along the body - shoulder, hip,
// knee, ankle (75th percentile: turning toward the camera only shortens it) and the head on top.
export function bodyPx(n, px, alongBody = false) {
  const hs = [], ch = [], tilt = [];
  const d = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN);
  const mid = (a, b) => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null);
  for (let a = 0; a < n; a++) {
    const nz = px(a, 0), al = px(a, 27), ar = px(a, 28);
    if (nz && (al || ar)) hs.push(Math.max(al ? al[1] : -1e9, ar ? ar[1] : -1e9) - nz[1]);
    for (const [s, h, k, an] of [[11, 23, 25, 27], [12, 24, 26, 28]]) { const L = d(px(a, s), px(a, h)) + d(px(a, h), px(a, k)) + d(px(a, k), px(a, an)); if (Number.isFinite(L)) ch.push(L * 1.12); }
    // the slope in the picture of the trunk AND of the legs (the steeper of the two): 0 lying flat, 1 upright - bent over
    // a bar the trunk is level and the legs are not
    const sh = mid(px(a, 11), px(a, 12)), hp = mid(px(a, 23), px(a, 24)), an = mid(px(a, 27), px(a, 28));
    if (sh && hp && an && d(sh, hp) > 0 && d(hp, an) > 0) tilt.push(Math.max(Math.abs(sh[1] - hp[1]) / d(sh, hp), Math.abs(an[1] - hp[1]) / d(hp, an)));
  }
  hs.sort((x, y) => x - y); ch.sort((x, y) => x - y); tilt.sort((x, y) => x - y);
  const v = hs.length ? hs[hs.length >> 1] : 0, c = ch.length ? ch[Math.floor(0.75 * (ch.length - 1))] : 0;
  // only a body LYING down - trunk and legs within 30 degrees of level in most frames (a plank, a push-up) - is measured along it
  const lying = tilt.length && tilt[tilt.length >> 1] < 0.5;
  return alongBody || lying ? c : v;
}

// the frames within +-ms of each one, as [lo, hi] index ranges - the frames come sorted by time, so two pointers do in one
// pass what a scan of every frame per frame did (13.10 review: 5,400 frames = 0.8 s on a desktop, seconds on a phone)
function windows(times, ms) {
  const n = times.length, lo = new Int32Array(n), hi = new Int32Array(n); let a = 0, b = 0;
  for (let i = 0; i < n; i++) { while (times[a] < times[i] - ms) a++; if (b < i) b = i; while (b + 1 < n && times[b + 1] <= times[i] + ms) b++; lo[i] = a; hi[i] = b; }
  return { lo, hi };
}
// THE FLOOR IS LEVEL (13.10, research 2.1; c31 8.8 s: the camera sits low on the floor, so a foot planted nearer to it
// shows lower in the picture - in the rebuilt clip the floor was a TILTED plane, and pinning the body to one level
// floor dropped it 20 cm). The planted ankles (read from the picture: still, and near the floor line of the 3 s around)
// are fitted with a plane, y = a + b x + c z, and the clip is turned so that plane is level (1-25 degrees; else as is).
export function levelFloor(frames, dims) {
  if (!dims || !(dims.w > 0) || !(dims.h > 0) || frames.length < 10) return frames;
  const n = frames.length, W = dims.w, H = dims.h;
  const img = (i, k) => { const l = frames[i].img && frames[i].img[k]; return l && Number.isFinite(l.x) && Number.isFinite(l.y) ? [l.x * W, l.y * H] : null; };
  const sm = (i, k) => { const xs = [], ys = []; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { const q = img(j, k); if (q) { xs.push(q[0]); ys.push(q[1]); } } if (!xs.length) return null; xs.sort((a, b) => a - b); ys.sort((a, b) => a - b); return [xs[xs.length >> 1], ys[ys.length >> 1]]; };
  const hMed = bodyPx(n, img); if (!(hMed > 20)) return frames;
  const wl = windows(frames.map((f) => f.t), 1500);
  const S = []; // [x, y, z] of floor points under planted feet and hands
  for (let i = 0; i < n; i++) {
    const p = frames[i].pts; if (!p) continue;
    const ys = []; for (let j = wl.lo[i]; j <= wl.hi[i]; j++) { for (const k of [27, 28]) { const q = img(j, k); if (q) ys.push(q[1]); } }
    ys.sort((a, b) => a - b); const floorY = ys.length ? ys[Math.floor(0.95 * (ys.length - 1))] : Infinity;
    const dt = Math.max(1, frames[Math.min(n - 1, i + 2)].t - frames[Math.max(0, i - 2)].t) / 1000;
    const still = (k) => { const a = sm(i, k), b0 = sm(Math.max(0, i - 2), k), b1 = sm(Math.min(n - 1, i + 2), k); return a && b0 && b1 && Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) / dt / hMed < 0.5 ? a : null; };
    for (const [k, to] of [[27, 31], [28, 32]]) {
      const a = still(k); if (!a || !fin(p[k])) continue;
      // the floor under the foot: the ankle's height less the ankle - or the toe point, if lower (on his toes)
      if (a[1] >= floorY - 0.08 * hMed) S.push([p[k].x, fin(p[to]) ? Math.min(p[k].y - 0.08, p[to].y) : p[k].y - 0.08, p[k].z]);
    }
    // PLANTED HANDS ARE ON THE FLOOR TOO (13.10, c36 push-ups: both feet stood at one spot, so the plane could not see the
    // camera's tilt along his body - the hands sank 10-20 cm under the floor): a still wrist, level with the feet in the
    // picture and under both knees, is a floor point, 3 cm above it
    for (const k of [15, 16]) {
      const a = still(k), kn = [img(i, 25), img(i, 26)].filter(Boolean); if (!a || !fin(p[k]) || kn.length < 2) continue;
      if (a[1] >= floorY - 0.05 * hMed && kn.every((q) => a[1] > q[1])) S.push([p[k].x, p[k].y - 0.03, p[k].z]);
    }
  }
  if (S.length < 20) return frames;
  // least squares y = a + b x + c z
  let s1 = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, sy = 0, sxy = 0, szy = 0;
  for (const [x, y, z] of S) { s1++; sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; sy += y; sxy += x * y; szy += z * y; }
  const M = [[s1, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], r = [sy, sxy, szy];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (Math.abs(D) < 1e-12) return frames;
  const col = (c) => M.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)));
  const b = det(col(1)) / D, c = det(col(2)) / D;
  const nrm = new Vector3(-b, 1, -c).normalize(), ang = Math.acos(Math.min(1, nrm.y)) * 180 / Math.PI;
  if (!(ang >= 1 && ang <= 25)) return frames;
  const q = new Quaternion().setFromUnitVectors(nrm, new Vector3(0, 1, 0)), v = new Vector3();
  const out = frames.map((f) => (f.pts ? { ...f, pts: f.pts.map((pt) => { if (!fin(pt)) return pt; v.set(pt.x, pt.y, pt.z).applyQuaternion(q); return { ...pt, x: v.x, y: v.y, z: v.z }; }), levelled: ang } : f));
  out.levelQ = q; return out;
}

// AN UNSEEN LEG IS NOT READ (14.10 #748-#750, Ohad on the c01 demo: "He's lower limbs are not and should not be moving",
// "The left leg is not moving but is rising"). Behind a plate or behind the other leg MediaPipe still returns a leg - a
// guess, and it moves: on c01 the hidden knees bent 67-103 deg through Romanian deadlifts done on soft, still knees (37
// where the camera saw them), and the far leg lifted off the floor in a standing press. A leg part the camera did not see
// now takes its pose from what it DID see:
//  1. standing still on the other leg (seen, its foot planted, his hips not travelling in the picture): that leg,
//     mirrored - he stands on two legs alike. (The hidden foot's own 'planted' cannot be read: its picture point is a
//     guess too - c01 0% planted through a standing press). With both legs hidden the second follows the first one's
//     filled pose (c01 28.5 s: the near leg's own last reading was from walking in, mid-stride - held into the set, it
//     kicked forward under the bar);
//  2. otherwise the mocap gap fill: from what 1 and the camera gave either side of the gap (each the mean of the seen readings within
//     0.5 s of its edge - the last one before a leg goes behind something is often already a guess), eased across it;
//  3. a part never seen in the clip keeps its readings - there is nothing else to show.
// The knee and the ankle carry their own bend; the thigh carries its line against the hips' HEADING only - a hinge tips
// the trunk over still legs, a turn on the spot turns them with it.
const EDGE_MS = 500, EASE_MS = 250;
function gapFillLegs(QV, ts, n, seenAt, contact, still, asym = false) {
  const qA = new Quaternion(), qP = new Quaternion(), qY = new Quaternion(), qT = new Quaternion();
  const Y = new Vector3(0, 1, 0), lat = new Vector3(), LAT = RJ.hipR.clone().sub(RJ.hipL), latRest = Math.atan2(LAT.x, LAT.z);
  const nrm = LAT.clone().normalize();
  const THIGH_REST = { L: RJ.kneeL.clone().sub(RJ.hipL).normalize(), R: RJ.kneeR.clone().sub(RJ.hipR).normalize() };
  const upv = new Vector3(), pelvisUp = (a) => { qP.fromArray(QV, (a * NSEG + S.pelvis) * 4); return upv.set(0, 1, 0).applyQuaternion(qP).y > 0.7; };   // standing, not a plank (c05 / c17 / c36)
  // the hips' heading per knot (lying on a side the hip line stands up and has no heading: the last one holds)
  const HD = new Float64Array(n); let hd = 0;
  for (let a = 0; a < n; a++) { qP.fromArray(QV, (a * NSEG + S.pelvis) * 4); lat.copy(LAT).applyQuaternion(qP); if (Math.hypot(lat.x, lat.z) > 0.3 * LAT.length()) hd = Math.atan2(lat.x, lat.z) - latRest; HD[a] = hd; }
  const isThigh = (sg) => sg === S.thighL || sg === S.thighR;
  // what a part carries: the joint's own turn (shin, foot), or the thigh against the hips' heading
  const carried = (a, sg, out) => {
    qT.fromArray(QV, (a * NSEG + sg) * 4);
    if (!isThigh(sg)) { qP.fromArray(QV, (a * NSEG + PARENT[sg]) * 4); return out.copy(qP).invert().multiply(qT); }
    return out.copy(qY.setFromAxisAngle(Y, HD[a])).invert().multiply(qT);
  };
  const place = (a, sg, rel) => {   // back to a world turn at knot a
    if (isThigh(sg)) rel.premultiply(qY.setFromAxisAngle(Y, HD[a])); else { qP.fromArray(QV, (a * NSEG + PARENT[sg]) * 4); rel.premultiply(qP); }
    rel.toArray(QV, (a * NSEG + sg) * 4);
  };
  // the mirror of a turn across the body's middle plane (a reflection M: the turn M R M, axis -M v)
  const mirror = (q) => { const v = new Vector3(q.x, q.y, q.z), d = v.dot(nrm); v.addScaledVector(nrm, -2 * d).negate(); return q.set(v.x, v.y, v.z, q.w); };
  const mean = (list) => { const o = list[0].clone(); for (let k = 1; k < list.length; k++) { const q = list[k], sgn = o.dot(q) < 0 ? -1 : 1; o.x += sgn * q.x; o.y += sgn * q.y; o.z += sgn * q.z; o.w += sgn * q.w; } return o.normalize(); };
  // seen = seen for a second at least (the replay's own rule, #745): a shorter seen blip is a reading the replay draws
  // faded, and its guess must not steer the fill (c01 28.9 s: 0.35 s 'seen' put a knee bent backward into the gap)
  const SEEN1 = new Uint8Array(seenAt.length);
  for (let sg = 0; sg < NSEG; sg++) for (let a = 0; a < n;) {
    if (!seenAt[a * NSEG + sg]) { a++; continue; }
    let b = a; while (b + 1 < n && seenAt[(b + 1) * NSEG + sg]) b++;
    if (ts[b] - ts[a] >= 1000 || (a === 0 && b === n - 1)) for (let c = a; c <= b; c++) SEEN1[c * NSEG + sg] = 1;
    a = b + 1;
  }
  const seen = (a, sg) => SEEN1[a * NSEG + sg] === 1, filled = new Set();
  for (const sd of ['L', 'R']) {
    const od = sd === 'L' ? 'R' : 'L';
    for (const c of ['thigh', 'shin', 'foot']) {   // down the chain: a part's parent is final before it
      const sg = S[c + sd], og = S[c + od];
      // the anchors: his own reading where the camera saw it, the other leg mirrored where 1 holds
      const own = new Array(n); let any = false;
      for (let a = 0; a < n; a++) {
        if (seen(a, sg)) own[a] = carried(a, sg, new Quaternion());
        else if (!ENV.MIRROR_OFF && !asym && still[a] && (seen(a, og) ? contact[od][a] : filled.has(og))) {
          own[a] = mirror(carried(a, og, new Quaternion()));
          // the other thigh's SWING only, at hip width (c01 28.5 s: seen from the side, the seen thigh read 25 deg out to
          // the side - depth error - and the mirror stood the hidden one 25 deg out the other way, drawn as a leg kicked
          // forward): its sideways lean is dropped
          if (isThigh(sg) && pelvisUp(a)) { const dir = THIGH_REST[sd].clone().applyQuaternion(own[a]); dir.addScaledVector(nrm, THIGH_REST[sd].dot(nrm) - dir.dot(nrm)).normalize(); own[a].setFromUnitVectors(THIGH_REST[sd], dir); }
        }
        if (own[a]) any = true;
      }
      if (!any) continue;
      filled.add(sg);
      const edge = (a0, dir) => {   // the mean of the seen readings within EDGE_MS from knot a0 going dir
        const L = []; for (let a = a0; a >= 0 && a < n && Math.abs(ts[a] - ts[a0]) <= EDGE_MS; a += dir) if (own[a]) L.push(own[a]);
        return L.length ? mean(L) : null;
      };
      let prev = -1;
      for (let a = 0; a < n; a++) {
        if (own[a]) { prev = a; if (!seen(a, sg)) place(a, sg, qA.copy(own[a])); continue; }
        let next = a + 1; while (next < n && !own[next]) next++;
        const qa = prev >= 0 ? edge(prev, -1) : null, qb = next < n ? edge(next, 1) : null;
        for (let g = a; g < next; g++) {
          if (!qa && !qb) continue;   // nothing seen on either side: the readings stay
          if (!qa || !qb) { place(g, sg, qA.copy(qa || qb)); continue; }
          const u = (ts[g] - ts[prev]) / Math.max(1e-6, ts[next] - ts[prev]), e = u * u * (3 - 2 * u);
          place(g, sg, qA.copy(qa).slerp(qb, e));
        }
        a = next - 1;
      }
      // NO STEP WHERE THE CAMERA PICKS THE LEG UP AGAIN (c20: a mirrored or held leg met its own reading in one 60 Hz step
      // - leg pops 15 -> 56): over the EASE_MS before a seen stretch starts, and after one ends, the filled pose eases into
      // the reading
      const qC = new Quaternion(), qR = new Quaternion();
      if (!ENV.EASE_OFF) for (let a = 0; a < n; a++) {
        if (!seen(a, sg)) continue;
        const startRun = a === 0 || !seen(a - 1, sg), endRun = a === n - 1 || !seen(a + 1, sg);
        for (const [is, dir] of [[startRun, -1], [endRun, 1]]) {
          if (!is) continue;
          qR.copy(own[a]);
          for (let g = a + dir; g >= 0 && g < n && !seen(g, sg) && Math.abs(ts[g] - ts[a]) < EASE_MS; g += dir) {
            const u = 1 - Math.abs(ts[g] - ts[a]) / EASE_MS, w = u * u * (3 - 2 * u);
            carried(g, sg, qC); place(g, sg, qC.slerp(qR, w));
          }
        }
      }
      // one hemisphere along time again (q and -q are the same turn)
      for (let a = 1; a < n; a++) { const o0 = ((a - 1) * NSEG + sg) * 4, o1 = (a * NSEG + sg) * 4; if (QV[o1] * QV[o0] + QV[o1 + 1] * QV[o0 + 1] + QV[o1 + 2] * QV[o0 + 2] + QV[o1 + 3] * QV[o0 + 3] < 0) for (let d = 0; d < 4; d++) QV[o1 + d] = -QV[o1 + d]; }
    }
  }
}

// frames: [{ t, pts }] (pts = frameToPoints3D of a stabilised frame). Returns the track the body plays.
// opts.smoothMs: the Gaussian's sigma (0 = none) - mild: the frames are already filtered upstream.
// opts.interp: 'monotone' (the product) | 'natural' (C2, overshoots) | 'linear' (the June / mannequin way) - the last
// two are kept ONLY so the gate can prove it tells them apart
// opts.dims: the video's size - with each frame's .img (MediaPipe's image points) the feet are read from the picture
const LIMB_ONE = (typeof process !== 'undefined' && process.env && process.env.LIMB_ONE === '1') || (typeof window !== 'undefined' && window.__LIMB_ONE);   // the old whole-limb fade
const GAPFILL_OFF = (typeof process !== 'undefined' && process.env && process.env.GAPFILL_OFF === '1') || (typeof window !== 'undefined' && window.__GAPFILL_OFF);   // #750: the readings of unseen legs
const STILL_SPEED = +(ENV.STILL_SPEED || 0.5);
const SEEN_RAW = (typeof process !== 'undefined' && process.env && process.env.SEEN_RAW === '1') || (typeof window !== 'undefined' && window.__SEEN_RAW);   // #742: the old per-reading fade
// ONE LEG CARRIES HIM, BY THE EXERCISE (14.10 #753, Ohad: "2 obviously, if you can make it smarter always do"). The
// hidden leg copies the other one only in a stance where the two legs stand alike - the readings cannot tell a hidden
// free leg in a single-leg RDL (c31 15.4-17.4 s: off the floor behind him in the video, drawn standing) from a hidden
// standing leg in a two-legged RDL (c01), and three reading-based guards all broke one of them. The logged exercise
// name can: split, staggered, kneeling and single-leg stances are not mirrored (the gap fill still carries the leg).
export const ASYM_STANCE = /b[\s-]?stance|kick[\s-]?stand|stagger|split|lunge|rfess|bulgarian|step[\s-]?(up|down)|single[\s-]?leg|\bsl\b|one[\s-]?leg|\b1[\s-]?leg|pistol|shrimp|skater|curts(y|ey)|cossack|kneel/i;
export const asymStance = (title) => !!title && ASYM_STANCE.test(String(title));
export function buildTrack(frames, { smoothMs = 45, hz = TRACK_HZ, interp = 'c2', dims = null, exercise = '' } = {}) {
  const asym = asymStance(exercise);
  if (!frames.length) return null;
  let fb;
  if (ENV.SUPINE_ORDER === 'before') { frames = fixSupine(frames, exercise).frames; fb = fixFrontBack(frames); frames = fb.frames; }
  else { fb = fixFrontBack(frames); frames = fixSupine(fb.frames, exercise).frames; }   // after the front/back fixer: measured better (c27 face-down 157 vs 992)
  frames = steadyBarArms(frames, exercise);   // #717: a bar on the back holds the hands
  let levelQ = null;
  frames = levelFloor(frames, dims); levelQ = frames.levelQ || null;
  const B = clipBody(frames.map((f) => f.pts));
  const per = []; let prev = null;
  // OUT OF THE PICTURE IS NOT A POSE (13.10, the app's c31 read opens with him walking past the phone, only his legs in
  // the frame: MediaPipe invents the rest and the replay opened on a floating, folded body). A frame whose shoulders or
  // hips sit outside the picture (by more than 2% of it) is no knot - the track starts on the first frame he is in.
  // (the HIPS must be in it: a clip filmed low with the head and shoulders out of the frame - c14, a pogo jump - is still
  // his legs and hips, seen; the trunk and arms are then drawn faded, as guesses)
  // ...and his upper body in it (13.10, c08 end: walking up to the phone, only his legs in the picture - MediaPipe guessed
  // a trunk above the frame and the body lay on the floor): both shoulders and the nose outside the picture is no knot
  const inFrame = (l, k) => l[k] && l[k].x > -0.02 && l[k].x < 1.02 && l[k].y > -0.02 && l[k].y < 1.02;
  const inPicture = (f) => { const l = f.img; if (!l) return true; return [23, 24].every((k) => inFrame(l, k)) && [11, 12, 0].some((k) => inFrame(l, k)); };
  // A SPINE OF THE WRONG LENGTH IS A MISREAD (13.10, c22 32.8 s: the plate hid his hips, the spine read 1.08 m, then 0.36 -
  // a man of ~0.5 floated in the air with folded legs): a frame whose hip-to-shoulder length is under 55% or over 160% of
  // the clip's median is no knot
  const spineLen = (p) => (p && fin(p[11]) && fin(p[12]) && fin(p[23]) && fin(p[24]) ? midV(p[11], p[12]).distanceTo(midV(p[23], p[24])) : NaN);
  const spL = frames.map((f) => spineLen(f.pts)).filter(Number.isFinite).sort((x, y) => x - y), spMed = spL.length ? spL[spL.length >> 1] : NaN;
  const spineOk = (f) => { const l = spineLen(f.pts); return !Number.isFinite(spMed) || !Number.isFinite(l) || (l >= 0.55 * spMed && l <= 1.6 * spMed); };
  const lineW = (a, b) => { const v = frames.map((f) => (f.pts && fin(f.pts[a]) && fin(f.pts[b]) ? V(f.pts[a]).distanceTo(V(f.pts[b])) : NaN)).filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };
  const width = { hip: lineW(23, 24), sho: lineW(11, 12) };
  // (only a lifter LYING: the face-up / face-down list also names standing and seated lifts - a cable fly, a seated chest
  // press, a standing pullover, a bent-over reverse fly - and a standing body keeps the strict rule; 15.10 review)
  const lying = LYING_RULE && lyingFacing(exercise) !== 0 && (SURELY_LYING_EX.test(String(exercise || '')) || !NOT_LYING_EX.test(String(exercise || '')));   // #717d
  for (const f of frames) { const r = inPicture(f) && spineOk(f) ? poseFrame(f.pts, prev, width, lying) : null; per.push(r); if (r) prev = r; }
  // a LONE reading (no other within 0.4 s, 13.10: the app's c31 read opened on one frame then 1.8 s of misreads) is noise
  const kept0 = per.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  const keep = kept0.filter((i, j) => (j > 0 && frames[i].t - frames[kept0[j - 1]].t <= 400) || (j + 1 < kept0.length && frames[kept0[j + 1]].t - frames[i].t <= 400) || kept0.length < 3);
  if (keep.length < 1) return null;
  const n = keep.length, ts = Float64Array.from(keep, (i) => frames[i].t);
  // quaternions: one hemisphere along time (q and -q are the same turn; a sign flip would spin the bone through 360)
  const QV = new Float64Array(n * NSEG * 4), RV = new Float64Array(n * 3), seenAt = new Uint8Array(n * NSEG);
  for (let a = 0; a < n; a++) {
    const r = per[keep[a]];
    for (let s = 0; s < NSEG; s++) {
      const q = r.Q[s]; let x = q.x, y = q.y, z = q.z, w = q.w;
      if (a > 0) { const b = ((a - 1) * NSEG + s) * 4; if (x * QV[b] + y * QV[b + 1] + z * QV[b + 2] + w * QV[b + 3] < 0) { x = -x; y = -y; z = -z; w = -w; } }
      const o = (a * NSEG + s) * 4; QV[o] = x; QV[o + 1] = y; QV[o + 2] = z; QV[o + 3] = w;
      seenAt[a * NSEG + s] = r.seen[s];
    }
  }
  // ONE FADE DECISION PER STRETCH, NOT PER READING (13.10 #742, Ohad on the demo: "very glitchy"): a limb half hidden
  // behind the body reads 0.4 / 0.6 visibility from frame to frame, so it flipped solid / faded on every other reading -
  // 672 flips a minute over the heavy corpus, 39% of them held under 300 ms. Each segment's seen is now the share of
  // readings within 250 ms that saw it, with a hysteresis: it turns solid at 60%, fades at 30%. The body's in-view test
  // keeps the raw readings (what it was measured on).
  const seenRaw = seenAt.slice();
  if (!SEEN_RAW) {
    const WIN = 250;
    for (let sg = 0; sg < NSEG; sg++) {
      let lo = 0, hi = 0, sum = 0, state = 1;
      for (let a = 0; a < n; a++) {
        while (hi < n && ts[hi] <= ts[a] + WIN) { sum += seenRaw[hi * NSEG + sg]; hi++; }
        while (ts[lo] < ts[a] - WIN) { sum -= seenRaw[lo * NSEG + sg]; lo++; }
        const f = sum / Math.max(1, hi - lo);
        state = a === 0 ? (f >= 0.5 ? 1 : 0) : state ? (f <= 0.3 ? 0 : 1) : (f >= 0.6 ? 1 : 0);
        seenAt[a * NSEG + sg] = state;
      }
    }
  }
  cleanWorld(QV, ts, n);
  // FEET ON THE FLOOR (13.10, measured on c31: MediaPipe's heel / toe points tilt a flat foot 25-70 degrees toes-down,
  // and a floor at the clip's single lowest sole sat 10-15 cm under where he stood - a floating, tip-toed body).
  //  - the floor is the 5th percentile of the lower sole over the clip (research 13.10, RESEARCH-ANATOMY-RIG.md 4.1);
  //  - a foot is PLANTED when its sole is within 6 cm of the floor and its ankle moves under 0.35 m/s;
  //  - a planted foot lies flat (the model's own flat-foot pitch), heading kept;
  //  - in the air, each foot's pitch loses the bias measured on its planted frames;
  //  - while a foot is planted the body's height puts that sole ON the floor; in the air it follows the captured sole.
  const piv = PIVOT.map(() => new Vector3()), Qs = PIVOT.map(() => new Quaternion());
  const soleRest = ['heelL', 'toeL', 'heelR', 'toeR'].map((k) => RJ[k]), soleSeg = [S.footL, S.footL, S.footR, S.footR];
  const P = keep.map((ix) => frames[ix].pts);
  const FEETI = { L: [29, 31, 27], R: [30, 32, 28] };
  // the ANKLE is the foot point to trust: MediaPipe puts its heel / toe points too high on the foot (the same bias that
  // tips it toes-down), so a floor from them sat ~10 cm under the athlete. Planted = the ankle within 5 cm of its low
  // band (10th percentile) and slow; the floor = the planted ankles' median height less the model's ankle height.
  const ankY = (p, sd) => (fin(p[FEETI[sd][2]]) ? p[FEETI[sd][2]].y : NaN);
  const lowAnk = P.map((p) => Math.min(ankY(p, 'L'), ankY(p, 'R'))).filter(Number.isFinite).sort((x, y) => x - y);
  const ankBand = lowAnk.length ? lowAnk[Math.floor(0.1 * (lowAnk.length - 1))] : 0;
  const ankleH = { L: (RJ.ankleL.y - Math.min(RJ.heelL.y, RJ.toeL.y)), R: (RJ.ankleR.y - Math.min(RJ.heelR.y, RJ.toeR.y)) };
  const pitchOf = (d) => Math.atan2(d.y, Math.hypot(d.x, d.z));
  const contact = { L: new Uint8Array(n), R: new Uint8Array(n) }, bias = {};
  // PLANTED, READ FROM THE PICTURE when the frames carry it (13.10): a planted foot does not move in the frame and sits at
  // its lowest recent point there; the 3D ankle height is noisy under the camera's perspective (c31 15.0 s: the stance
  // foot read 6 cm up and the body floated). Image ankle speed under 0.4 body-heights a second, and within 3.5% of a
  // body height of its lowest point in the second around it.
  const IMG = dims && dims.w > 0 && dims.h > 0 ? keep.map((ix) => frames[ix].img || null) : null;
  const imgOk = IMG && IMG.filter(Boolean).length > n * 0.8;
  const pxRaw = (a, k) => { const l = IMG && IMG[a] && IMG[a][k]; return l && Number.isFinite(l.x) && Number.isFinite(l.y) ? [l.x * dims.w, l.y * dims.h] : null; };
  // the image ankle jitters ~10 px on a 190 px body (c31): a 5-frame median first
  const SM = {};
  const px = (a, k) => {
    if (k !== 27 && k !== 28) return pxRaw(a, k);
    const key = a + ':' + k; if (SM[key] !== undefined) return SM[key];
    const xs = [], ys = []; for (let b = Math.max(0, a - 2); b <= Math.min(n - 1, a + 2); b++) { const q = pxRaw(b, k); if (q) { xs.push(q[0]); ys.push(q[1]); } }
    xs.sort((x, y) => x - y); ys.sort((x, y) => x - y);
    return (SM[key] = xs.length ? [xs[xs.length >> 1], ys[ys.length >> 1]] : null);
  };
  let hMed = 0;
  if (imgOk) hMed = bodyPx(n, px);
  const useImg = imgOk && hMed > 20;
  // the floor in the picture around frame a: the 95th percentile of both ankles' image height over 3 s
  const FLOORY = {}; let WF = null;
  const floorY = (a) => {
    if (FLOORY[a] !== undefined) return FLOORY[a];
    if (!WF) WF = windows(Array.from(ts), 1500);
    const ys = []; for (let b = WF.lo[a]; b <= WF.hi[a]; b++) { for (const k of [27, 28]) { const q = pxRaw(b, k); if (q) ys.push(q[1]); } }
    ys.sort((x, y) => x - y); return (FLOORY[a] = ys.length ? ys[Math.floor(0.95 * (ys.length - 1))] : -Infinity);
  };
  for (const sd of ['L', 'R']) {
    const [he, to, an] = FEETI[sd], pitches = [];
    for (let a = 0; a < n; a++) {
      const p = P[a], q0 = P[Math.max(0, a - 1)], q1 = P[Math.min(n - 1, a + 1)];
      const dt = Math.max(1, ts[Math.min(n - 1, a + 1)] - ts[Math.max(0, a - 1)]) / 1000;
      let planted;
      if (useImg) {
        const b0 = Math.max(0, a - 2), b1 = Math.min(n - 1, a + 2);
        const i0 = px(b0, an), i1 = px(b1, an), ia = px(a, an), other = px(a, an === 27 ? 28 : 27);
        if (!ia || !i0 || !i1) planted = false;
        else {
          const sp = Math.hypot(i1[0] - i0[0], i1[1] - i0[1]) / (Math.max(1, ts[b1] - ts[b0]) / 1000) / hMed;
          let low = -Infinity; for (let b = Math.max(0, a - 10); b <= Math.min(n - 1, a + 10); b++) { const q = px(b, an); if (q && q[1] > low) low = q[1]; }
          // still and at its lowest - or, slow and clearly the lower foot (the one carrying him) - and in both cases NEAR
          // THE FLOOR in the picture: within 10% of a body height of the lowest ankles of the 3 s around (a rear foot held
          // still in the air, c31 9.0 s, passed "still and at its own low" and pinned the body 30 cm down)
          planted = ((sp < 0.5 && ia[1] >= low - 0.06 * hMed) || (sp < 0.9 && other && ia[1] >= other[1] + 0.08 * hMed)) && ia[1] >= floorY(a) - 0.1 * hMed;
        }
      } else {
        const sp = fin(q0[an]) && fin(q1[an]) ? Math.hypot(q1[an].x - q0[an].x, q1[an].y - q0[an].y, q1[an].z - q0[an].z) / dt : Infinity;
        const ay = ankY(p, sd);
        planted = Number.isFinite(ay) && ay < ankBand + 0.05 && sp < 0.35;
      }
      if (planted) {
        contact[sd][a] = 1;
        // the bias of a FLAT foot only - a foot on its toes (steeper than 50 degrees) is not flat
        if (fin(p[he]) && fin(p[to])) { const pt = pitchOf(new Vector3(p[to].x - p[he].x, p[to].y - p[he].y, p[to].z - p[he].z)); if (pt > TOES_PITCH) pitches.push(pt); }
      }
    }
    pitches.sort((x, y) => x - y);
    bias[sd] = pitches.length >= 5 ? pitches[pitches.length >> 1] : FLAT_BIAS;   // the landmarks' pitch of a foot that is flat
  }
  // a planted foot's floor: under its ankle by the model's ankle height - or its TOE point, if that is lower (on his toes
  // in a push-up or a lunge's rear foot the ankle stands high; MediaPipe's toe point rests on the floor either way)
  const planted = []; for (let a = 0; a < n; a++) for (const sd of ['L', 'R']) if (contact[sd][a]) { const to = P[a][FEETI[sd][1]]; planted.push(Math.min(ankY(P[a], sd) - ankleH[sd] * B.scale, fin(to) ? to.y : Infinity)); }
  planted.sort((x, y) => x - y);
  const floorLm = planted.length ? planted[planted.length >> 1] : (lowAnk.length ? lowAnk[0] - ankleH.L * B.scale : 0);
  // A FOOT THAT STAYS PUT (research 13.10, 4.1; c31 9.5 s: the stance foot read as "in the air" from ankle jitter and
  // the body floated 10 cm): a foot whose ankle travels under 10 cm across the clip (10th-90th percentile, level) is
  // planted wherever it is low; and a gap of up to 3 frames inside a planted stretch, with the ankle within 5 cm, is
  // still planted.
  for (const sd of ['L', 'R']) {
    const an = FEETI[sd][2], xs = [], zs = [];
    for (let a = 0; a < n; a++) if (fin(P[a][an])) { xs.push(P[a][an].x); zs.push(P[a][an].z); }
    const span = (v) => { const q = v.slice().sort((x, y) => x - y); return q.length ? q[Math.floor(0.9 * (q.length - 1))] - q[Math.floor(0.1 * (q.length - 1))] : Infinity; };
    if (Math.hypot(span(xs), span(zs)) < 0.1) for (let a = 0; a < n; a++) { const ay = ankY(P[a], sd); if (Number.isFinite(ay) && ay < ankBand + 0.08) contact[sd][a] = 1; }
    for (let a = 1; a < n; a++) {
      if (contact[sd][a] || !contact[sd][a - 1]) continue;
      let b = a; while (b < n && !contact[sd][b] && b - a < 3) b++;
      if (b < n && contact[sd][b] && fin(P[a - 1][an]) && fin(P[b][an]) && Math.hypot(P[b][an].x - P[a - 1][an].x, P[b][an].z - P[a - 1][an].z) < 0.05) for (let c = a; c < b; c++) contact[sd][c] = 1;
    }
  }
  // SOMEONE IS STANDING (13.10, c31 9.5 / 15.0 s: the stance foot blurred, its image ankle jumped 10-17 px a frame and
  // neither foot read planted - the body floated): with neither foot planted, the LOWER foot in the picture carries him
  // unless it is clearly off its low point (over 8% of a body height above its lowest in the second around it) - a
  // real flight lifts both feet further than that.
  if (useImg) for (let a = 0; a < n; a++) {
    if (contact.L[a] || contact.R[a]) continue;
    const al = px(a, 27), ar = px(a, 28); if (!al || !ar) continue;
    const sd = al[1] >= ar[1] ? 'L' : 'R', k = sd === 'L' ? 27 : 28, me = sd === 'L' ? al : ar;
    let low = -Infinity; for (let b = Math.max(0, a - 10); b <= Math.min(n - 1, a + 10); b++) { const q = px(b, k); if (q && q[1] > low) low = q[1]; }
    if (me[1] >= low - 0.08 * hMed && me[1] >= floorY(a) - 0.1 * hMed) contact[sd][a] = 1;
  }
  // A PLANTED FOOT ON ITS TOES (13.10, c36 / c05 / c17 push-ups: every planted foot was laid flat, so the ankle dropped
  // to the floor and the knees bent down to it - he knelt instead of a plank): a planted stretch whose captured foot is
  // steeper than 50 degrees (median) keeps its own pitch - the toes on the floor, the heel up.
  const toes = { L: new Uint8Array(n), R: new Uint8Array(n) };
  for (const sd of ['L', 'R']) {
    const [he, to] = FEETI[sd];
    for (let a = 0; a < n;) {
      if (!contact[sd][a]) { a++; continue; }
      let b = a; while (b + 1 < n && contact[sd][b + 1]) b++;
      const ps = []; for (let c = a; c <= b; c++) { const p = P[c]; if (fin(p[he]) && fin(p[to])) ps.push(pitchOf(new Vector3(p[to].x - p[he].x, p[to].y - p[he].y, p[to].z - p[he].z))); }
      ps.sort((x, y) => x - y);
      if (ps.length && ps[ps.length >> 1] < TOES_PITCH) for (let c = a; c <= b; c++) toes[sd][c] = 1;
      a = b + 1;
    }
  }
  // STANDING, NOT GOING ANYWHERE (#750): his hips' point moves ACROSS the picture under half his height a second over
  // the half second around (a walk moves ~1; a Romanian deadlift's hips going back ~0.3 - c01 28.5 s at a quarter: the
  // hidden leg kicked forward). Up and down does not count: c39's squats failed a total-speed test and the hidden knee
  // froze at 135 deg while the picture bent it 175 -> 90. No picture, no test
  const still = new Uint8Array(n).fill(1);
  if (useImg) for (let a = 0; a < n; a++) {
    let b0 = a, b1 = a; while (b0 > 0 && ts[a] - ts[b0 - 1] <= 250) b0--; while (b1 + 1 < n && ts[b1 + 1] - ts[a] <= 250) b1++;
    const h0 = px(b0, 23), h1 = px(b0, 24), g0 = px(b1, 23), g1 = px(b1, 24);
    if (!h0 || !h1 || !g0 || !g1 || b1 === b0) continue;
    const sp = Math.abs((g0[0] + g1[0] - h0[0] - h1[0]) / 2) / ((ts[b1] - ts[b0]) / 1000) / hMed;   // ACROSS the picture only: a squat's hips go down, a walk's go along
    still[a] = sp < STILL_SPEED ? 1 : 0;
  }
  if (!GAPFILL_OFF) gapFillLegs(QV, ts, n, seenAt, contact, still, asym);
  const restFoot = { L: RJ.toeL.clone().sub(RJ.heelL), R: RJ.toeR.clone().sub(RJ.heelR) };
  const restPitch = { L: pitchOf(restFoot.L), R: pitchOf(restFoot.R) };
  const UP = new Vector3(0, 1, 0), fq = new Quaternion(), dv = new Vector3();
  for (let a = 0; a < n; a++) for (const sd of ['L', 'R']) {
    const o = (a * NSEG + S['foot' + sd]) * 4; fq.fromArray(QV, o);
    dv.copy(restFoot[sd]).applyQuaternion(fq);
    const h = new Vector3(dv.x, 0, dv.z); if (h.lengthSq() < 1e-10) continue; h.normalize();
    const want = contact[sd][a] && !toes[sd][a] ? restPitch[sd] : pitchOf(dv) - (bias[sd] - restPitch[sd]);
    const target = h.multiplyScalar(Math.cos(want)).addScaledVector(UP, Math.sin(want));
    fq.premultiply(new Quaternion().setFromUnitVectors(dv.normalize(), target)).toArray(QV, o);
  }
  // the body's height: a planted sole on the floor; in the air the captured sole (less its planted offset)
  // in the air: the lower captured ankle, less the model's ankle height, is where the lower sole is
  const lowFrame = (a) => Math.min(ankY(P[a], 'L') - ankleH.L * B.scale, ankY(P[a], 'R') - ankleH.R * B.scale);
  const plantOff = 0;
  const dyRaw = new Float64Array(n), _c = new Vector3();
  for (let a = 0; a < n; a++) {
    const r = per[keep[a]];
    for (let s = 0; s < NSEG; s++) Qs[s].fromArray(QV, (a * NSEG + s) * 4);
    fk(Qs, r.hip, B, piv);
    const lowOf = (segL) => { let lo = Infinity; soleRest.forEach((pt, k) => { if (segL != null && soleSeg[k] !== segL) return; const y = carry(soleSeg[k], pt, Qs, piv, B, _c).y; if (y < lo) lo = y; }); return lo; };
    let target = NaN, modelLow = lowOf(null);
    if (contact.L[a] || contact.R[a]) {
      // the planted foot stands on the floor - of two planted, the HIGHER one: it needs the most reach, and the lower one
      // then always reaches by bending its knee (pinned to the lower, the other leg was too short even straight, 13.10)
      // - unless one of them is up: on a bench or a step, or on its TOES with the heel up (a lunge's rear foot, c31 8.8 s:
      // its ankle 9 cm over the front one) - captured ankles over 6 cm apart in height: the lower, flat foot carries him
      const ankGap = ankY(P[a], 'L') - ankY(P[a], 'R');
      const sd = contact.L[a] && contact.R[a] ? (Math.abs(ankGap) > 0.06 ? (ankGap < 0 ? 'L' : 'R') : (lowOf(S.footL) > lowOf(S.footR) ? 'L' : 'R')) : contact.L[a] ? 'L' : 'R';
      modelLow = lowOf(S['foot' + sd]); target = floorLm;
    } else if (Number.isFinite(lowFrame(a))) target = lowFrame(a) - plantOff;
    dyRaw[a] = Number.isFinite(target) ? target - modelLow : NaN;
    RV[a * 3] = r.hip.x; RV[a * 3 + 1] = r.hip.y; RV[a * 3 + 2] = r.hip.z;
  }
  // a frame without feet keeps its neighbours' correction
  let last = 0; for (let a = 0; a < n; a++) { if (Number.isFinite(dyRaw[a])) last = dyRaw[a]; else dyRaw[a] = last; }
  for (let a = 0; a < n; a++) RV[a * 3 + 1] += dyRaw[a];
  // A HIDDEN FOOT IS NOT LOCKED (#750, c01 28.6 s): its spot is the median of where its guessed readings put it, and
  // the lock swings the leg up to 90 deg to reach it - the hidden leg stood under him, filled, and the lock kicked it
  // forward. The fill already stands it beside the other foot; the body's height still counts it as planted.
  // Whole planted stretches only: a stance the camera saw that foot in under half of is not locked. (Knot by knot, one
  // stance became fragments with their own spots and the lock jumped between them - c20 thigh pops 3 -> 16; a spot from
  // the seen knots of the whole stance measured worse on the picture angles, p90 16.8 vs 15.8.)
  let lockContact = contact;
  if (!GAPFILL_OFF && !ENV.LOCKSKIP_OFF) {
    lockContact = { L: contact.L.slice(), R: contact.R.slice() };
    for (const sd of ['L', 'R']) for (let a = 0; a < n;) {
      if (!contact[sd][a]) { a++; continue; }
      let b = a, sn = 0; while (b + 1 < n && contact[sd][b + 1]) b++;
      for (let c = a; c <= b; c++) sn += seenAt[c * NSEG + S['foot' + sd]];
      if (sn < 0.5 * (b - a + 1)) for (let c = a; c <= b; c++) lockContact[sd][c] = 0;
      a = b + 1;
    }
  }
  // ...and a hidden foot he stands on - planted but not locked, or (its own 'planted' is a guess too: c01 0% through a
  // standing press) hidden while he stands still on the other, planted foot - is set on the floor, not folded off it
  let standOn = null;
  if (lockContact !== contact && !ENV.STANDON_OFF) {
    standOn = { L: new Uint8Array(n), R: new Uint8Array(n) };
    // (upright, the other foot flat: c05 / c17 / c36 push-ups - feet on their toes were pulled flat, fit 8 -> 15 cm)
    const upq = new Quaternion(), upv = new Vector3(), upright = (a) => upv.set(0, 1, 0).applyQuaternion(upq.fromArray(QV, (a * NSEG + S.pelvis) * 4)).y > 0.7;
    for (const sd of ['L', 'R']) { const od = sd === 'L' ? 'R' : 'L'; for (let a = 0; a < n; a++) if (!(toes && (toes[sd][a] || toes[od][a])) && upright(a) && ((contact[sd][a] && !lockContact[sd][a]) || (!asym && !seenAt[a * NSEG + S['foot' + sd]] && contact[od][a] && still[a]))) standOn[sd][a] = 1; }
  }
  footLock(QV, RV, n, lockContact, B, floorLm, toes, standOn);
  // mild smoothing in time, then normalise the quaternions again
  const QS = smoothMs > 0 ? gauss(QV, ts, smoothMs, n, NSEG * 4) : QV, RS = smoothMs > 0 ? gauss(RV, ts, smoothMs, n, 3) : RV;
  for (let a = 0; a < n * NSEG; a++) { const o = a * 4, l = Math.hypot(QS[o], QS[o + 1], QS[o + 2], QS[o + 3]) || 1; for (let k = 0; k < 4; k++) QS[o + k] /= l; }
  // PARENT-RELATIVE, IN LOG SPACE (research 13.10, RESEARCH-ANATOMY-RIG.md 5.3): each segment's turn against its parent,
  // as a 3-vector around the clip's mean turn - a joint is interpolated as a joint (no cascade down the chain), and a big
  // step between two captured frames turns at an even speed (a quaternion's components do not).
  // ONE CHART PER RUN (13.10, c26 21.3 s: the hips turned 45 degrees between two readings and the replay spun them 300
  // degrees the other way). One log chart per segment for the whole clip cannot hold a body that turns past 180 degrees
  // from its average (walking to the rack and back): the unwrapped values climb onto the 2-pi shell, and coming back near
  // the average with another tilt there is no value left close to the last one - the curve swung round the long way.
  // So each segment's knots are cut into RUNS, each with its own chart centred on its first turn: a run ends where a
  // turn strays over 150 degrees from where it began. Inside a run every value is the plain (under 180 degree) log -
  // continuous with no unwrapping; the one interval across two runs turns the short way (below).
  const LW = new Float64Array(n * NSEG * 3), RUN = new Int32Array(n * NSEG), REFS = [];
  {
    const qp = new Quaternion(), qs = new Quaternion(), L = new Quaternion(), prevL = PIVOT.map(() => null);
    const loc = new Float64Array(n * NSEG * 4);
    for (let a2 = 0; a2 < n; a2++) for (let s2 = 0; s2 < NSEG; s2++) {
      qs.fromArray(QS, (a2 * NSEG + s2) * 4);
      if (PARENT[s2] >= 0) { qp.fromArray(QS, (a2 * NSEG + PARENT[s2]) * 4); L.copy(qp).invert().multiply(qs); } else L.copy(qs);   // limits: already held by cleanWorld (again here they took the planted-foot IK back)
      if (prevL[s2] && L.dot(prevL[s2]) < 0) L.set(-L.x, -L.y, -L.z, -L.w);
      prevL[s2] = L.clone(); L.toArray(loc, (a2 * NSEG + s2) * 4);
    }
    const SPLIT = (150 * Math.PI) / 180, ang = (x, y) => 2 * Math.acos(Math.min(1, Math.abs(x.dot(y))));
    for (let s2 = 0; s2 < NSEG; s2++) {
      let a2 = 0;
      while (a2 < n) {
        const first = new Quaternion().fromArray(loc, (a2 * NSEG + s2) * 4); let b2 = a2;
        while (b2 + 1 < n && ang(first, L.fromArray(loc, ((b2 + 1) * NSEG + s2) * 4)) <= SPLIT) b2++;
        // the run's chart: centred on its first knot, so every knot in it is under 150 degrees away - far from the 180 degree
        // edge where the log of two near turns can lie far apart (centred on the run's mean, one could reach it: c41 23.3 s)
        const ref = first.clone(); REFS.push(ref);
        const inv = ref.clone().invert(), rid = REFS.length - 1;
        for (let c = a2; c <= b2; c++) { RUN[c * NSEG + s2] = rid; L.fromArray(loc, (c * NSEG + s2) * 4); qlog(inv.clone().multiply(L), LW, (c * NSEG + s2) * 3); }
        a2 = b2 + 1;
      }
    }
  }
  // a curve's coefficients, computed run by run (no curve through a change of chart)
  const perRun = (fn) => {
    const out = new Float64Array(n * NSEG * 3);
    for (let s2 = 0; s2 < NSEG; s2++) for (let a2 = 0; a2 < n;) {
      let b2 = a2; while (b2 + 1 < n && RUN[(b2 + 1) * NSEG + s2] === RUN[a2 * NSEG + s2]) b2++;
      const len = b2 - a2 + 1, sub = new Float64Array(len * 3), tsub = ts.slice(a2, b2 + 1);
      for (let c = 0; c < len; c++) for (let d = 0; d < 3; d++) sub[c * 3 + d] = LW[((a2 + c) * NSEG + s2) * 3 + d];
      const co = fn(sub, tsub, len, 3);
      for (let c = 0; c < len; c++) for (let d = 0; d < 3; d++) out[((a2 + c) * NSEG + s2) * 3 + d] = co[c * 3 + d];
      a2 = b2 + 1;
    }
    return out;
  };
  const DL = NSEG * 3;
  const curve = interp === 'linear' ? null : interp === 'natural' || interp === 'c2' ? { M: perRun(splineM), MR: splineM(RS, ts, n, 3) } : { T: perRun(monoTangents), TR: monoTangents(RS, ts, n, 3) };
  // sample at hz
  const t0 = ts[0], t1 = ts[n - 1], step = 1000 / hz, m = Math.max(1, Math.floor((t1 - t0) / step) + 1);
  const quats = new Float32Array(m * NSEG * 4), root = new Float32Array(m * 3), seen = new Uint8Array(m * NSEG);
  const tmpL = new Float64Array(DL), tmpR = new Float64Array(3), Lq = new Quaternion(), W = PIVOT.map(() => new Quaternion()), qa2 = new Quaternion(), qb2 = new Quaternion();
  const qInv = new Quaternion(), qGir = new Quaternion(), armL = new Vector3(), FWD_AXIS = new Vector3(0, 0, 1);
  const ARM_REST = { L: RJ.elbowL.clone().sub(RJ.shoulderL), R: RJ.elbowR.clone().sub(RJ.shoulderR) };
  const uK = new Vector3(), lK = new Vector3(), nK = new Vector3(), aK = new Vector3(), cK = new Vector3(), qK = new Quaternion();
  const KNEE_REST = Object.fromEntries(['L', 'R'].map((sd) => { const u = RJ['knee' + sd].clone().sub(RJ['hip' + sd]); return [sd, { u, l: RJ['ankle' + sd].clone().sub(RJ['knee' + sd]), a: new Vector3().crossVectors(u, BACK).normalize() }]; }));
  let i = 0;
  for (let k = 0; k < m; k++) {
    const t = Math.min(t1, t0 + k * step);
    while (i + 1 < n - 1 && ts[i + 1] <= t) i++;
    let jHeld = -1;
    if (n === 1) { jHeld = 0; tmpL.set(LW.subarray(0, DL)); tmpR.set(RS.subarray(0, 3)); }
    // across a GAP of over GAP_HOLD (0.8 s) nothing was read: the body holds the nearer real pose, it never sweeps through invented
    // ones (faded - nothing seen)
    else if (ts[i + 1] - ts[i] > GAP_HOLD) { const j = t - ts[i] <= ts[i + 1] - t ? i : i + 1; jHeld = j; tmpL.set(LW.subarray(j * DL, j * DL + DL)); tmpR.set(RS.subarray(j * 3, j * 3 + 3)); }
    else if (interp === 'linear') {
      const i2 = Math.min(n - 1, i + 1), u = ts[i2] > ts[i] ? Math.max(0, Math.min(1, (t - ts[i]) / (ts[i2] - ts[i]))) : 0;
      for (let c = 0; c < DL; c++) tmpL[c] = LW[i * DL + c] + (LW[i2 * DL + c] - LW[i * DL + c]) * u;
      for (let c = 0; c < 3; c++) tmpR[c] = RS[i * 3 + c] + (RS[i2 * 3 + c] - RS[i * 3 + c]) * u;
    } else if (interp === 'natural' || interp === 'c2') {
      splineAt(LW, curve.M, ts, DL, t, i, tmpL); splineAt(RS, curve.MR, ts, 3, t, i, tmpR);
      // C2, held to its interval (13.10): the natural spline is smooth to the second derivative (no tick at a captured
      // frame) but rings past the frames on a fast turn; each value is kept within the two frames it lies between, plus 8% of
      // their step - most intervals are untouched, so the motion stays C2 almost everywhere
      if (interp === 'c2') {
        const hold = (vals, out, dims) => { for (let c = 0; c < dims; c++) { const a = vals[i * dims + c], b = vals[(i + 1) * dims + c], m = Math.abs(b - a) * 0.08 + 1e-4; const lo = Math.min(a, b) - m, hi = Math.max(a, b) + m; if (out[c] < lo) out[c] = lo; else if (out[c] > hi) out[c] = hi; } };
        hold(LW, tmpL, DL); hold(RS, tmpR, 3);
      }
    }
    else { hermiteAt(LW, curve.T, ts, DL, t, i, tmpL); hermiteAt(RS, curve.TR, ts, 3, t, i, tmpR); }
    // back to world turns, down the chain (parents come first in SEGMENTS)
    for (let s2 = 0; s2 < NSEG; s2++) {
      if (jHeld >= 0) { qexp(tmpL, s2 * 3, Lq); Lq.premultiply(REFS[RUN[jHeld * NSEG + s2]]); }
      else if (RUN[i * NSEG + s2] !== RUN[(i + 1) * NSEG + s2]) {
        // across two runs: from one knot's turn to the next, the short way, eased in and out
        qexp(LW, (i * NSEG + s2) * 3, qa2); qa2.premultiply(REFS[RUN[i * NSEG + s2]]);
        qexp(LW, ((i + 1) * NSEG + s2) * 3, qb2); qb2.premultiply(REFS[RUN[(i + 1) * NSEG + s2]]);
        const u0 = Math.max(0, Math.min(1, (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i]))); Lq.copy(qa2).slerp(qb2, u0 * u0 * (3 - 2 * u0));
      } else { qexp(tmpL, s2 * 3, Lq); Lq.premultiply(REFS[RUN[i * NSEG + s2]]); }
      if (PARENT[s2] >= 0) W[s2].copy(W[PARENT[s2]]).multiply(Lq); else W[s2].copy(Lq);
      W[s2].toArray(quats, (k * NSEG + s2) * 4);
    }
    // THE SHOULDER GIRDLE RISES WITH THE ARM (13.10): the clavicle was fixed to the chest, so an arm overhead hung from a
    // shoulder that never moved. In the picture the shoulder rises toward the ear as the arm goes up - ear-to-shoulder
    // over the torso -6 / -12 / -16 % at 60-90 / 90-120 / 120-150 deg of elevation (24 clips, the model -1 / -3 / 0).
    // The clavicle (and the scapula it carries) now turns up about the chest's forward axis, a smooth function of the
    // arm's elevation from 40 deg, gain fitted to those numbers. The arm keeps its own direction (its world turn is stored).
    for (const sd of ['L', 'R']) {
      const cl = S['clav' + sd], ua = S['uarm' + sd];
      qInv.copy(W[S.chest]).invert(); armL.copy(ARM_REST[sd]).applyQuaternion(W[ua]).applyQuaternion(qInv);
      const x = Math.max(0, (Math.acos(Math.max(-1, Math.min(1, -armL.y / (armL.length() || 1)))) * 180) / Math.PI - 40);
      const th = Math.min(GIRDLE_MAX, (GIRDLE_GAIN * x * x) / (x + 15)) * (Math.PI / 180) * (sd === 'L' ? 1 : -1);
      if (th === 0) continue;
      qGir.setFromAxisAngle(FWD_AXIS, th); W[cl].copy(W[S.chest]).multiply(qGir).toArray(quats, (k * NSEG + cl) * 4);
    }

    root.set(tmpR, k * 3);
    const near = t - ts[i] <= ts[Math.min(n - 1, i + 1)] - t ? i : Math.min(n - 1, i + 1);
    // a bridged gap (no knot within 300 ms): nothing was seen there
    if (Math.abs(t - ts[near]) <= 300) seen.set(seenAt.subarray(near * NSEG, near * NSEG + NSEG), k * NSEG);
  }
  // NO LIMB BLINKS, EVER (13.10 #745, Ohad: "100% reduction perfect smooth no glitching limb flickering is needed"): the
  // vote above left 626 runs under 300 ms over the corpus, and a gap between readings (no knot within 300 ms) faded a
  // limb for a moment on its own. On the final track every stretch of solid or faded now lasts at least 1 s: a shorter
  // one takes the state of the stretch before it (the clip's first stretch, of the one after). The replay then
  // crossfades each change (AnatomyBody), so a limb never snaps.
  if (!SEEN_RAW) {
    const MINK = Math.max(1, Math.round(hz * 1.0));
    for (let sg = 0; sg < NSEG; sg++) {
      for (let pass = 0; pass < 4; pass++) {
        let changed = false, a0 = 0;
        while (a0 < m) {
          let a1 = a0; const v = seen[a0 * NSEG + sg];
          while (a1 + 1 < m && seen[(a1 + 1) * NSEG + sg] === v) a1++;
          const len = a1 - a0 + 1;
          if (len < MINK && !(a0 === 0 && a1 === m - 1)) {
            const to = a0 > 0 ? seen[(a0 - 1) * NSEG + sg] : seen[(a1 + 1) * NSEG + sg];
            if (to !== v) { for (let k = a0; k <= a1; k++) seen[k * NSEG + sg] = to; changed = true; }
          }
          a0 = a1 + 1;
        }
        if (!changed) break;
      }
    }
  }
  // THE KNEE STAYS A HINGE THROUGH THE FOOT LOCK (13.10): the lock moves the knee and swings the thigh and the shin
  // each the shortest way, so the hip-knee-ankle plane turned and the thigh's hinge did not - the knee bent sideways
  // (out of its own plane p90 22 deg after the lock, 8 before). On the 60 Hz track the thigh now rolls about its own line
  // until its hinge is square to the hip-knee-ankle plane: no joint moves (knee, ankle, foot stay put), only the thigh's
  // turn - a hip rotation. Weighted by the bend (none under 20 deg, all from 45: a near-straight knee's plane is noise);
  // none where it would take over 60-90 deg (the knee bends the wrong way there); the roll smoothed in time (60 ms, both
  // ways). Measured: knee out-of-plane p90 22 -> 0.5. Rejected: inside the lock, knot by knot (pops x2), unsmoothed.
  if (!ENV.KNEE_ROLL_OFF) for (const sd of ['L', 'R']) {
    const th = S['thigh' + sd], sn = S['shin' + sd], R = new Float64Array(m), qT = new Quaternion(), qS = new Quaternion();
    for (let k = 0; k < m; k++) {
      qT.fromArray(quats, (k * NSEG + th) * 4); qS.fromArray(quats, (k * NSEG + sn) * 4);
      uK.copy(KNEE_REST[sd].u).applyQuaternion(qT).normalize(); lK.copy(KNEE_REST[sd].l).applyQuaternion(qS);
      nK.crossVectors(uK, lK); const bendK = Math.atan2(nK.length(), uK.dot(lK)), wK = smooth(20 * DEG, 45 * DEG, bendK);
      if (wK <= 0 || uK.dot(lK) < -0.999) continue;
      aK.copy(KNEE_REST[sd].a).applyQuaternion(qT); aK.addScaledVector(uK, -aK.dot(uK)); if (aK.lengthSq() < 1e-10) continue;
      aK.normalize(); nK.normalize();
      const rK = Math.atan2(cK.crossVectors(aK, nK).dot(uK), aK.dot(nK)), fK = 1 - smooth(60 * DEG, 90 * DEG, Math.abs(rK));
      R[k] = wK * fK * rK;
    }
    const a1 = Math.exp(-(1000 / hz) / 60); let y = 0;
    for (let k = 0; k < m; k++) { y = a1 * y + (1 - a1) * R[k]; R[k] = y; }
    y = 0; for (let k = m - 1; k >= 0; k--) { y = a1 * y + (1 - a1) * R[k]; R[k] = y; }
    // ...never turning the hip past HIP_ROT_MAX (a hip turns ~45 deg; uncapped, 3.6% of frames read past 60): there the
    // roll stops at the cap (or where the hip already was) and the knee keeps the rest of its side bend
    const qP = new Quaternion(), qL = new Quaternion(), hipTw = (q) => { qL.copy(qP).invert().multiply(q); return swingTwist(qL, AXIS[th]).ang; };
    for (let k = 0; k < m; k++) {
      if (!R[k]) continue;
      qT.fromArray(quats, (k * NSEG + th) * 4); qP.fromArray(quats, (k * NSEG + S.pelvis) * 4); uK.copy(KNEE_REST[sd].u).applyQuaternion(qT).normalize();
      const at = (r) => hipTw(qS.copy(qT).premultiply(qK.setFromAxisAngle(uK, r)));
      const t0 = Math.abs(hipTw(qT)), lim = Math.max(t0, HIP_ROT_MAX);
      let r = R[k];
      if (Math.abs(at(r)) > lim) { let lo = 0, hi = 1; for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (Math.abs(at(R[k] * mid)) > lim) hi = mid; else lo = mid; } r = R[k] * lo; }
      if (r) qT.premultiply(qK.setFromAxisAngle(uK, r)).toArray(quats, (k * NSEG + th) * 4);
    }
  }
  // the floor the planted feet stand on
  const floor = floorLm;
  // WHERE HE IS IN VIEW (13.10, the app's c31 replay opened on 1.3 s of a man walking past the phone): a reading within
  // 0.3 s with his trunk seen. inView(t) for the replay; firstInView = the start of the first second of it.
  const inViewKnot = (a) => seenRaw[a * NSEG + S.pelvis] && (seenRaw[a * NSEG + S.chest] || seenRaw[a * NSEG + S.thighL] || seenRaw[a * NSEG + S.thighR]);   // his hips and his trunk or a leg
  let firstInView = ts[0];
  for (let a = 0; a < n; a++) { if (!inViewKnot(a)) continue; let b = a; while (b + 1 < n && inViewKnot(b + 1) && ts[b + 1] - ts[b] <= 300) b++; if (ts[b] - ts[a] >= 1000) { firstInView = ts[a]; break; } }
  // ... or inside a short gap (up to GAP_HOLD) between two readings in view (13.10, c21 19.9-20.2 s: three blurred
  // readings dropped as misreads left 0.67 s - he was hidden as 'not in view' with the picture full of him)
  // (13.10 #728, c21 61.0-62.8 s: the subject guard dropped 1.8 s of readings - he was alone in the picture - and the replay
  // went EMPTY. Up to VIEW_BRIDGE between two readings in view the body stays: faded, holding the nearer real pose.)
  const inView = (t) => { let lo = 0, hi = n - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] < t) lo = mid + 1; else hi = mid; } for (const a of [lo - 1, lo]) if (a >= 0 && a < n && Math.abs(ts[a] - t) <= 300 && inViewKnot(a)) return true; return lo > 0 && lo < n && ts[lo] >= t && ts[lo] - ts[lo - 1] <= VIEW_BRIDGE && inViewKnot(lo) && inViewKnot(lo - 1); };
  // HOW BIG HE IS IN THE PICTURE (13.10, c34 setup: about a fifth of the frame tall, behind the plates - every reading was
  // a guess): his body's length over the frame's long side; under 0.36 the replay says so (the four clips under it are
  // among the corpus's least accurate)
  const bodyFrac = useImg ? bodyPx(n, px, true) / Math.max(dims.w, dims.h) : null;
  return { _run: RUN, bodyFrac, inView, firstInView, t0, t1, hz, m, scale: B.scale, len: B.len, quats, root, seen, floor: Number.isFinite(floor) ? floor : 0, captured: n, contact, knotT: ts, frontBackFixed: fb.fixed, mirroredT: new Set(frames.filter((f) => f.mirrored).map((f) => f.t)), levelQ };
}

// the pose at time t (ms, the frames' own clock): rotations + root, blended between the two nearest 60 Hz samples
export function sampleTrack(tr, t, Q = PIVOT.map(() => new Quaternion()), root = new Vector3()) {
  const f = Math.max(0, Math.min(tr.m - 1, (t - tr.t0) / (1000 / tr.hz)));
  const a = Math.floor(f), b = Math.min(tr.m - 1, a + 1), u = f - a;
  const qa = new Quaternion(), qb = new Quaternion();
  for (let s = 0; s < NSEG; s++) { qa.fromArray(tr.quats, (a * NSEG + s) * 4); qb.fromArray(tr.quats, (b * NSEG + s) * 4); Q[s].copy(qa).slerp(qb, u); }
  root.set(tr.root[a * 3] + (tr.root[b * 3] - tr.root[a * 3]) * u, tr.root[a * 3 + 1] + (tr.root[b * 3 + 1] - tr.root[a * 3 + 1]) * u, tr.root[a * 3 + 2] + (tr.root[b * 3 + 2] - tr.root[a * 3 + 2]) * u);
  return { Q, root, seen: tr.seen.subarray(Math.round(f) * NSEG, Math.round(f) * NSEG + NSEG) };
}

// EVERY JOINT, READ FROM THE BODY ON SCREEN (13.10 #709 / #710, Ohad: "Measure the foot and ankle joint (plantar &
// dorsiflexion)" + "Not joint should be skipped. All should be analyzed"). The angles come from the model's own joints
// at time t, so the number and the bones you see always agree; MediaPipe's raw foot points tip a flat foot 25-70 degrees
// toes-down, the model's foot is the corrected one. Degrees:
//   knee / hip / elbow / shoulder: the angle AT the joint (180 = straight; the shoulder's = arm against the trunk side)
//   ankle: dorsiflexion (+) / plantarflexion (-) from the model's standing neutral
//   wrist: how far the hand is bent off the forearm line
//   trunk: lean from vertical; neck: the head's tilt against the chest
// seen: whether the camera saw that joint's parts (a guess is shown as one).
const ang3 = (a, b, c) => { const u = a.clone().sub(b), v = c.clone().sub(b), d = u.length() * v.length(); return d > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, u.dot(v) / d))) * 180 / Math.PI : null; };
const angV = (u, v) => { const d = u.length() * v.length(); return d > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, u.dot(v) / d))) * 180 / Math.PI : null; };
const REST_ANKLE = { L: angV(RJ.kneeL.clone().sub(RJ.ankleL), RJ.toeL.clone().sub(RJ.heelL)), R: angV(RJ.kneeR.clone().sub(RJ.ankleR), RJ.toeR.clone().sub(RJ.heelR)) };
export function modelAngles(tr, t) {
  if (!tr) return null;
  const Q = PIVOT.map(() => new Quaternion()), root = new Vector3(), piv = PIVOT.map(() => new Vector3());
  const { seen } = sampleTrack(tr, t, Q, root); fk(Q, root, tr, piv);
  const c = (seg, pt) => carry(seg, pt, Q, piv, tr);
  const out = {};
  const shoMid = piv[S.uarmL].clone().add(piv[S.uarmR]).multiplyScalar(0.5), hipMid = piv[S.thighL].clone().add(piv[S.thighR]).multiplyScalar(0.5);
  for (const sd of ['L', 'R']) {
    const sh = piv[S['uarm' + sd]], el = piv[S['farm' + sd]], wr = piv[S['hand' + sd]], hp = piv[S['thigh' + sd]], kn = piv[S['shin' + sd]], an = piv[S['foot' + sd]];
    const knuck = c(S['hand' + sd], RJ['index' + sd].clone().add(RJ['pinky' + sd]).multiplyScalar(0.5));
    const heel = c(S['foot' + sd], RJ['heel' + sd]), toe = c(S['foot' + sd], RJ['toe' + sd]);
    const sArm = seen[S['uarm' + sd]] && seen[S['farm' + sd]], sLeg = seen[S['thigh' + sd]] && seen[S['shin' + sd]];
    out['knee' + sd] = { v: ang3(hp, kn, an), seen: !!sLeg };
    out['hip' + sd] = { v: ang3(sh, hp, kn), seen: !!(sLeg && seen[S.chest]) };
    out['elbow' + sd] = { v: ang3(sh, el, wr), seen: !!sArm };
    out['shoulder' + sd] = { v: ang3(el, sh, hp), seen: !!(sArm && seen[S.chest]) };
    const a = angV(kn.clone().sub(an), toe.clone().sub(heel));
    out['ankle' + sd] = { v: a == null ? null : REST_ANKLE[sd] - a, seen: !!(sLeg && seen[S['foot' + sd]]), signed: true };
    const w = angV(wr.clone().sub(el), knuck.clone().sub(wr));
    out['wrist' + sd] = { v: w, seen: !!(sArm && seen[S['hand' + sd]]) };
  }
  out.trunk = { v: angV(shoMid.clone().sub(hipMid), new Vector3(0, 1, 0)), seen: !!seen[S.chest] };
  out.neck = { v: angV(new Vector3(0, 1, 0).applyQuaternion(Q[S.head]), new Vector3(0, 1, 0).applyQuaternion(Q[S.chest])), seen: !!seen[S.head] };
  return out;
}
