// EVERY JOINT, EVERY PLANE (13.10 #716, Ohad: "all joints and all possible axises"). Read off the body on screen (the
// track's segment rotations - the same as the joint box and the centre of mass), in the parent segment's own frame:
//  - the SWING of the child segment (where its long axis points, seen from the parent) gives the angles in the sagittal
//    and frontal planes, each the angle of that axis projected on the plane - what a goniometer reads;
//  - the TWIST about its long axis (a swing-twist split of the relative rotation) gives the rotation in the
//    transverse plane - free of the gimbal lock a Cardan sequence has with the arm overhead.
// The rig's rest pose is the anatomical frame (facing +z, his left +x, up +y), and every axis is the REST axis of the
// segment, so the model's own rest posture (arms 11.5 deg out, feet 8.6 deg toe-out) reads as what it is, not as zero.
// Signs: flexion, abduction, internal rotation, dorsiflexion, inversion, valgus, ulnar deviation, pronation = +;
// the trunk / neck: forward flexion +, side bend and rotation + toward his LEFT.
// Theoretical limit, stated: a monocular camera sees a limb's twist only through the joints around it (the knee and
// foot for the thigh, the hand for the forearm) - transverse-plane values are estimates, marked so in the UI.
import { Vector3, Quaternion } from 'three';
import { PIVOT, RJ, S, sampleTrack } from './rig.js';

const DEG = 180 / Math.PI;
const unit = (a, b) => b.clone().sub(a).normalize();
// each segment's rest long axis (pointing away from its pivot)
const AX = (() => {
  const a = {};
  for (const sd of ['L', 'R']) {
    a['thigh' + sd] = unit(RJ['hip' + sd], RJ['knee' + sd]);
    a['shin' + sd] = unit(RJ['knee' + sd], RJ['ankle' + sd]);
    a['foot' + sd] = unit(RJ['heel' + sd], RJ['toe' + sd]);
    a['uarm' + sd] = unit(RJ['shoulder' + sd], RJ['elbow' + sd]);
    a['farm' + sd] = unit(RJ['elbow' + sd], RJ['wrist' + sd]);
    a['hand' + sd] = unit(RJ['wrist' + sd], RJ['index' + sd].clone().add(RJ['pinky' + sd]).multiplyScalar(0.5));
  }
  a.chest = unit(PIVOT[S.chest], PIVOT[S.neck]);
  a.head = unit(PIVOT[S.head], RJ.crown);
  return a;
})();

// the twist of q about the unit axis a, in degrees (swing-twist decomposition)
export function twistAbout(q, a) {
  const p = q.x * a.x + q.y * a.y + q.z * a.z;
  let t = 2 * Math.atan2(p, q.w) * DEG;
  if (t > 180) t -= 360; if (t < -180) t += 360;
  return t;
}
const VALGUS_MAX = 30;
const relQ = (Qp, Qc) => Qp.clone().invert().multiply(Qc);
const at = (y, x) => Math.atan2(y, x) * DEG;
// a FRONTAL-plane angle only where the limb lies near enough that plane to have one: its shadow on the plane at least 40%
// of its length - a thigh or an arm pointing forward has no abduction to read (13.10: the atan2 of a short shadow swung
// 360 degrees between frames - hip abduction p99 step 241 deg, knee 358, shoulder 357 on c31) -> null, shown as —
// (an arm overhead reads past 180, never -180: from -150 to 210 - an arm across the chest (-90) and overhead (180) both inside, no wrap)
const atF = (y, x, cut = -150) => { if (Math.hypot(x, y) < 0.4) return null; const v = at(y, x); return v < cut ? v + 360 : v; };
// the hip and the wrist hang below their joint to have an abduction / a deviation at all: their down share at least 25%
// (a thigh pointing forward at the squat's bottom, angled in, read 'adduction 90' and wrapped to 270 between frames)
const atDown = (y, x) => (x >= 0.25 ? atF(y, x) : null);

// one joint's angles from the parent / child rotations. sd: +1 his left, -1 his right
const READ = {
  // hip: the thigh hangs (-y); forward = flexion, out to his side = abduction, the knee turned in = internal rotation
  hip: (q, a, sd) => { const d = a.clone().applyQuaternion(q); return { flex: at(d.z, -d.y), abd: atDown(sd * d.x, -d.y), rot: sd * twistAbout(q, a) }; },
  // knee: the shin bends back = flexion; turned in = internal rotation (valgus: jointAxesFromQ, in the pelvis's frame)
  // (a knee turns ~40 degrees at most: a twist over 45 is a misread shin, shown as —)
  knee: (q, a, sd) => { const d = a.clone().applyQuaternion(q), r = sd * twistAbout(q, a); return { flex: at(-d.z, -d.y), rot: Math.abs(r) <= 45 ? r : null }; },
  // ankle: the foot points +z; toes up = dorsiflexion, toes out = abduction (toe-out), the sole turned in = inversion
  // (toe-out only with the foot pointing forward, within 60: a foot read reversed - hidden behind a plate, c35 - flipped
  // it through 180 between frames; inversion only within 60 - a foot reads past that only where the shin's own roll is
  // misread, hidden legs, c35 43.9 s: 110 then -107, a 217 degree jump)
  ankle: (q, a, sd) => { const d = a.clone().applyQuaternion(q), to = at(sd * d.x, d.z); const iv = -sd * twistAbout(q, AX0.z); return { dorsi: at(d.y, Math.hypot(d.x, d.z)) - at(a.y, Math.hypot(a.x, a.z)), toeOut: d.z >= 0.3 && Math.abs(to) <= 60 ? to : null, inv: Math.abs(iv) <= 60 ? iv : null }; },
  // shoulder (vs the chest): forward = flexion, out to his side = abduction, the forearm turned in = internal rotation
  // (abduction only with the arm more to the side than to the front: an arm overhead IN FRONT is flexion - its frontal
  // shadow read 'abduction 180' and wrapped between frames, c31 9-15 s)
  shoulder: (q, a, sd) => { const d = a.clone().applyQuaternion(q); return { flex: at(d.z, -d.y), abd: Math.abs(d.x) >= Math.abs(d.z) ? atF(sd * d.x, -d.y) : null, rot: sd * twistAbout(q, a) }; },
  // forearm (vs the upper arm): the hand turned palm-down = pronation
  forearm: (q, a, sd) => ({ pron: sd * twistAbout(q, a) }),
  // wrist (vs the forearm): the palm toward the forearm's front = flexion, toward the little finger = ulnar deviation
  wrist: (q, a, sd) => { const d = a.clone().applyQuaternion(q); const u = atDown(-sd * d.x, -d.y); return { flex: at(d.z, -d.y) - at(a.z, -a.y), ulnar: u == null ? null : u - at(-sd * a.x, -a.y) }; },
  // trunk (chest vs pelvis) and neck (head vs chest): forward flexion, side bend to his left +, rotation to his left +
  spine: (q, a) => { const d = a.clone().applyQuaternion(q); return { flex: at(d.z, d.y) - at(a.z, a.y), side: at(d.x, d.y) - at(a.x, a.y), rot: twistAbout(q, a) }; },
};
const AX0 = { y: new Vector3(0, -1, 0), z: new Vector3(0, 0, 1) };

export const JOINTS = [
  ...['L', 'R'].flatMap((sd) => [
    ['hip' + sd, 'hip', 'pelvis', 'thigh' + sd, sd],
    ['knee' + sd, 'knee', 'thigh' + sd, 'shin' + sd, sd],
    ['ankle' + sd, 'ankle', 'shin' + sd, 'foot' + sd, sd],
    ['shoulder' + sd, 'shoulder', 'chest', 'uarm' + sd, sd],
    ['forearm' + sd, 'forearm', 'farm' + sd, 'hand' + sd, sd],
    ['wrist' + sd, 'wrist', 'farm' + sd, 'hand' + sd, sd],
  ]),
  ['trunk', 'spine', 'pelvis', 'chest', null],
  ['neck', 'spine', 'chest', 'head', null],
];

// every joint's planes from the segment rotations Q (world, from rest); seen[] from the track
export function jointAxesFromQ(Q, seen = null) {
  const out = {};
  for (const [key, kind, p, c, sd] of JOINTS) {
    const q = relQ(Q[S[p]], Q[S[c]]);
    const a = AX[c] || (kind === 'forearm' ? AX[p] : null) || new Vector3(0, -1, 0);
    const axis = kind === 'forearm' ? AX[p] : a;   // the forearm's twist is about the forearm, read at the hand
    const v = READ[kind](q, axis, sd === 'R' ? -1 : 1);
    // KNEE VALGUS = the frontal-plane projection angle (FPPA, the clinical knee-valgus measure): hip-knee-ankle seen
    // from the front of the PELVIS, the shin's line against the thigh's; + = the knee in (the foot out); both lines'
    // shadows at least 50% of their length (a thigh pointing forward has none; measured vs the picture: 30% -> 50%
    // took the p90 error from 27.2 to 25.6 deg for 5% fewer readings)
    if (kind === 'knee') {
      const qp = Q[S.pelvis].clone().invert(), t = AX['thigh' + sd].clone().applyQuaternion(qp.clone().multiply(Q[S['thigh' + sd]])), sh = AX['shin' + sd].clone().applyQuaternion(qp.clone().multiply(Q[S['shin' + sd]]));
      const sg = sd === 'R' ? -1 : 1;
      let dv = at(sh.x, -sh.y) - at(t.x, -t.y); while (dv > 180) dv -= 360; while (dv < -180) dv += 360;
      // past 30 the reading is not his knee (13.10, vs the front camera on 2,600 front-facing frames: where the model read
      // 30-44 its error was median 25-30 deg - the picture's knee at 16-20 - and 45-59 median 43; under 15 it is 6.5).
      // A stricter front view (shadows 0.6 / 0.7) did not help (p90 25.6 -> 24.9 / 24.5). Shown as — (blank over wrong);
      // a real collapse past 30 shows — too, and the replay's picture beside it is the reading then.
      v.valgus = Math.hypot(t.x, t.y) >= 0.5 && Math.hypot(sh.x, sh.y) >= 0.5 && Math.abs(dv) <= VALGUS_MAX ? sg * dv : null;
    }
    out[key] = { ...v, seen: !seen || (!!seen[S[p]] && !!seen[S[c]]) };
  }
  return out;
}
const _Q = PIVOT.map(() => new Quaternion()), _root = new Vector3();
export function modelJointAxes(tr, t) {
  if (!tr) return null;
  const { seen } = sampleTrack(tr, t, _Q, _root);
  return jointAxesFromQ(_Q, seen);
}
