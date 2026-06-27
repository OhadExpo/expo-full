// anatomyRig.js — the Z-Anatomy skeleton chunk-rig, extracted as PURE functions
// so both the offline Movement Lab and the LIVE camera overlay can pose the SAME
// real skeleton.glb. Bucket the GLB's many meshes into anatomical bones, derive a
// model joint table, scale the model to the captured body, then drive a CONNECTED
// forward-kinematic rig that follows captured limb directions (with axial twist
// where the bend-plane supports it; degrades to swing otherwise).
//
// Coordinates are CALLER-defined: pass joint points (`fp`, indexed by MediaPipe
// landmark) in whatever space you render in — capture metres (Y-up, hip-centred)
// for the Lab, or screen-overlay units for the live feed — and the rig poses in
// that space. `cg(fp, key)` resolves a joint index or a derived centre point.
//
// Models © Z-Anatomy (Creative Commons Attribution-ShareAlike 4.0). Skeleton only
// (muscle écorché dropped — muscles cross joints, which a rigid chunk-rig tears).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ZERO = new THREE.Vector3(0, 0, 0);

// classify a Z-Anatomy node name into a bone bucket key (side-suffixed), or null
// for soft tissue / muscle / markers that ship inside skeleton.glb.
export function classifyBone(name, region, cx) {
  const n = name.toLowerCase().replace(/_/g, ' '); const s = cx < 0 ? 'L' : 'R';
  if (/cartilage|ligament|membrane|meniscus|\bdisc|tendon|fontanelle|capsule|labrum|bursa|muscle|fascia|aponeuros|raphe/.test(n)) return null;
  if (/flexor|extensor|abductor|adductor|opponens|lumbrical|interosse|pronator|supinator|levator|depressor|\btensor\b|digitorum|hallucis|digiti|pollicis|indicis|biceps|triceps|brachii|brachialis|brachioradialis|deltoid|anconeus|palmaris|gastrocn|soleus|plantaris|popliteus|tibialis|fibularis|peroneus|gluteus|piriformis|gemellus|quadratus|psoas|iliacus|sartorius|gracilis|pectineus|vastus|semitendinosus|semimembranosus|gracil|masseter|buccinator|orbicularis|frontalis|occipitalis|temporalis|pterygoid|scalene|sternocleido|trapezius|\brectus\b|obliquus/.test(n)) return null;
  if (/skull|crani|mandible|maxilla|occipital|parietal|frontal bone|temporal bone|sphenoid|ethmoid|zygomatic|palatine|vomer|lacrimal|nasal bone|hyoid|teeth|dent|facial|mental|greater wing|lesser wing|sella|orbit|nuchal|nasal|nasion|glabella|squamous|petrous|mastoid|temporal line|frontal|tempora/.test(n)) return 'skull';
  if (/pelvi|ilium|ischium|pubis|hip bone|coxal|innominate|acetabul|iliac/.test(n)) return 'pelvis';
  if (/vertebr|cervical|thoracic|lumbar|sacr|coccyx|\brib\b|costal|sternum|thorax|atlas|\baxis\b|spinal|spinous|transverse process|xiphoid|manubrium/.test(n)) return 'spine';
  if (/clavicle|scapula|acromion|glenoid|coracoid/.test(n)) return 'clav' + s;
  if (/humerus|humeral/.test(n)) return 'uarm' + s;
  if (/radius|ulna|radial|ulnar/.test(n)) return 'farm' + s;
  if (/femur|femoral|patella/.test(n)) return 'thigh' + s;
  if (/tibia|fibula|tibial|fibular/.test(n)) return 'shin' + s;
  if (/calcaneus|talus|tars|metatars|cuboid|cuneiform|hallux/.test(n) || (region === 'lower' && /phalan|sesamoid|navicular/.test(n))) return 'foot' + s;
  if (/carp|metacarp/.test(n) || (region === 'upper' && /phalan|sesamoid/.test(n))) return 'hand' + s;
  return null;
}

const regionOf = (obj) => {
  let p = obj;
  while (p) { const n = (p.name || '').toLowerCase().replace(/_/g, ' '); if (n.includes('upper limb')) return 'upper'; if (n.includes('lower limb')) return 'lower'; p = p.parent; }
  return 'core';
};

// principal-axis endpoints of a merged geometry + its centroid.
function ends(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox; const size = new THREE.Vector3(); bb.getSize(size);
  const ax = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
  const c = bb.getCenter(new THREE.Vector3());
  const e0 = c.clone(), e1 = c.clone(); e0[ax] = bb.min[ax]; e1[ax] = bb.max[ax];
  return { e0, e1, centroid: c };
}
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);

// resolve a joint index or a derived centre from a points array.
export const cg = (fp, key) => {
  if (key === 'hipCenter') { const a = fp[23], b = fp[24]; return a && b ? a.clone().add(b).multiplyScalar(0.5) : null; }
  if (key === 'shoCenter') { const a = fp[11], b = fp[12]; return a && b ? a.clone().add(b).multiplyScalar(0.5) : null; }
  if (key === 'headRef') {
    const n = fp[0], l = fp[7], r = fp[8];
    if (l && r) { const m = l.clone().add(r).multiplyScalar(0.5); return n ? m.multiplyScalar(0.7).add(n.clone().multiplyScalar(0.3)) : m; }
    return n ? n.clone() : null;
  }
  return fp[key] ? fp[key].clone() : null;
};

// group a GLB's meshes into named bone buckets (geometry baked to world space).
export function bucketGeos(root, classify) {
  const buckets = {}; const c = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (o.geometry.attributes.position.count < 50) return;   // drop tiny landmark pins
    const region = regionOf(o);
    o.getWorldPosition(c);
    const key = classify(o.name || o.parent?.name || '', region, c.x, c.y);
    if (!key) return;
    const g = o.geometry.clone();
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', g.attributes.position);
    if (g.attributes.normal) ng.setAttribute('normal', g.attributes.normal);
    if (g.index) ng.setIndex(g.index);
    o.updateWorldMatrix(true, false);
    ng.applyMatrix4(o.matrixWorld);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    (buckets[key] ||= []).push(ng);
  });
  return buckets;
}

const mergeBucket = (geos, mat) => {
  const g = mergeGeometries(geos, false); if (!g) return null;
  if (!g.attributes.normal) g.computeVertexNormals();
  return { mesh: new THREE.Mesh(g, mat), ...ends(g) };
};

// derive the model-space joint table from the merged bone meshes.
function deriveJoints(M, mode, bodyCenter) {
  const J = {}; const h = key => M[key];
  const near = (m, t) => (m.e0.distanceToSquared(t) <= m.e1.distanceToSquared(t) ? m.e0 : m.e1);
  const far = (m, t) => (m.e0.distanceToSquared(t) > m.e1.distanceToSquared(t) ? m.e0 : m.e1);
  const limb = (uK, fK, hK, jSho, jElb, jWri, jTip) => {
    const u = M[uK], f = M[fK], hnd = M[hK];
    if (u) {
      const ref = f ? f.centroid : (hnd ? hnd.centroid : bodyCenter);
      J[jSho] = far(u, ref).clone();
      J[jElb] = f ? mid(near(u, f.centroid), near(f, u.centroid)) : near(u, ref).clone();
    }
    if (f) {
      if (!u) J[jElb] = far(f, hnd ? hnd.centroid : bodyCenter).clone();
      J[jWri] = hnd ? mid(near(f, hnd.centroid), near(hnd, f.centroid)) : far(f, u ? u.centroid : bodyCenter).clone();
    }
    if (hnd) {
      const ref = f ? f.centroid : (u ? u.centroid : bodyCenter);
      if (!J[jWri]) J[jWri] = near(hnd, ref).clone();
      J[jTip] = far(hnd, ref).clone();
    }
  };
  limb('uarmL', 'farmL', 'handL', 'shoulderL', 'elbowL', 'wristL', 'handTipL');
  limb('uarmR', 'farmR', 'handR', 'shoulderR', 'elbowR', 'wristR', 'handTipR');
  limb('thighL', 'shinL', 'footL', 'hipL', 'kneeL', 'ankleL', 'footTipL');
  limb('thighR', 'shinR', 'footR', 'hipR', 'kneeR', 'ankleR', 'footTipR');
  const up = (v, d) => v.clone().add(new THREE.Vector3(0, d, 0));
  J.hipCenter = h('pelvis') ? M.pelvis.centroid.clone() : (J.hipL && J.hipR ? mid(J.hipL, J.hipR) : new THREE.Vector3());
  J.shoCenter = (J.shoulderL && J.shoulderR) ? mid(J.shoulderL, J.shoulderR) : (h('spine') ? M.spine.centroid.clone() : up(J.hipCenter, 0.5));
  J.headTip = h('skull') ? M.skull.centroid.clone() : up(J.shoCenter, 0.22);
  return J;
}

// build a rig from one GLB's buckets: merge → joints → centre+scale to body.
// fp0 = the joint points of a reference frame (the capture the model scales to).
export function buildRig(buckets, mat, group, mode, fp0) {
  const M = {};
  for (const key of Object.keys(buckets)) { const r = mergeBucket(buckets[key], mat); if (r) { M[key] = r; group.add(r.mesh); } }
  const keys = Object.keys(M);
  if (!keys.length) return null;
  const bc = new THREE.Vector3(); for (const key of keys) bc.add(M[key].centroid); bc.multiplyScalar(1 / keys.length);
  const J = deriveJoints(M, mode, bc);
  const ratios = [];
  const r = (ca, cb, ja, jb) => { const A = cg(fp0, ca), B = cg(fp0, cb); if (A && B && J[ja] && J[jb]) { const cl = A.distanceTo(B), ml = J[ja].distanceTo(J[jb]); if (ml > 1e-4 && cl > 1e-4) ratios.push(cl / ml); } };
  r('hipCenter', 'shoCenter', 'hipCenter', 'shoCenter');
  r(23, 25, 'hipL', 'kneeL'); r(24, 26, 'hipR', 'kneeR');
  r(11, 13, 'shoulderL', 'elbowL'); r(12, 14, 'shoulderR', 'elbowR');
  r(25, 27, 'kneeL', 'ankleL'); r(26, 28, 'kneeR', 'ankleR');
  ratios.sort((a, b) => a - b); const gs = ratios.length ? ratios[ratios.length >> 1] : 1;
  const hipM = J.hipCenter.clone();
  for (const key of Object.keys(M)) { const g = M[key].mesh.geometry; g.translate(-hipM.x, -hipM.y, -hipM.z); g.scale(gs, gs, gs); M[key].mesh.matrixAutoUpdate = false; }
  for (const key of Object.keys(J)) { J[key].sub(hipM).multiplyScalar(gs); }
  return { J, M, mode };
}

// ---- pose math ----
const sub = (a, b) => (a && b) ? a.clone().sub(b) : null;
const add = (a, b) => a.clone().add(b);
const app = (v, q) => v.clone().applyQuaternion(q);
const _va = new THREE.Vector3(), _vb = new THREE.Vector3();
const alignQ = (from, to) => {
  if (!from || !to) return new THREE.Quaternion();
  _va.copy(from); _vb.copy(to);
  if (_va.lengthSq() < 1e-9 || _vb.lengthSq() < 1e-9) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(_va.normalize(), _vb.normalize());
};
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const _tmpS = new THREE.Vector3();
const _mRest = new THREE.Matrix4(), _mPose = new THREE.Matrix4(), _mRot = new THREE.Matrix4();
const _qb = new THREE.Quaternion();
const SEC_MIN = 0.12;
const buildFrame = (primary, secondary) => {
  if (!primary || !secondary) return false;
  _X.copy(primary); const pl = _X.length(); if (pl < 1e-6) return false; _X.divideScalar(pl);
  _tmpS.copy(secondary); const sl = _tmpS.length(); if (sl < 1e-6) return false; _tmpS.divideScalar(sl);
  _Z.crossVectors(_X, _tmpS);
  if (_Z.length() < SEC_MIN) return false;
  _Z.normalize(); _Y.crossVectors(_Z, _X).normalize();
  return true;
};
const basisQ = (pRest, sRest, pPose, sPose) => {
  if (!buildFrame(pRest, sRest)) return alignQ(pRest, pPose);
  _mRest.makeBasis(_X, _Y, _Z);
  if (!buildFrame(pPose, sPose)) return alignQ(pRest, pPose);
  _mPose.makeBasis(_X, _Y, _Z);
  _mRest.transpose();
  _mRot.multiplyMatrices(_mPose, _mRest);
  return _qb.setFromRotationMatrix(_mRot).clone();
};
const _t1 = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t2 = new THREE.Matrix4(), _mScale = new THREE.Matrix4();
// scale (default 1 → identity, so offline callers are byte-for-byte unchanged) grows
// the bone about its proximal joint so the live overlay can resize the whole skeleton
// with the athlete's distance (paired with the same scale on the joint advances below).
const setBone = (mesh, prox, q, restProx, scale = 1) => {
  if (!mesh || !prox || !q) return;
  const rp = restProx || ZERO;
  _t1.makeTranslation(prox.x, prox.y, prox.z);
  _r.makeRotationFromQuaternion(q);
  _t2.makeTranslation(-rp.x, -rp.y, -rp.z);
  mesh.matrix.copy(_t1).multiply(_r);
  if (scale !== 1) mesh.matrix.multiply(_mScale.makeScale(scale, scale, scale));
  mesh.matrix.multiply(_t2);
  mesh.matrixAutoUpdate = false; mesh.visible = true;
};

// CONNECTED FK pose: anchor each bone at its parent's posed joint, rotate to the
// captured segment direction, advance, recurse. `twist` adds axial roll from the
// bend-plane with the segment below; falls back to swing where unreliable.
export function poseRig(fp, rig, twist = true, scale = 1) {
  const { J, M, mode } = rig;
  const hipC = cg(fp, 'hipCenter'), shoC = cg(fp, 'shoCenter'); if (!hipC || !shoC) return;
  const wj = {};
  // Each rig segment is laid out at the model's BUILD size; multiplying every
  // joint advance (and the bone mesh in setBone) by `scale` resizes the whole
  // skeleton about the hip so the live overlay tracks the athlete's distance.
  // scale === 1 leaves every value identical to before (offline Lab path).
  const upPose = sub(shoC, hipC);
  const shoLinePose = sub(cg(fp, 12), cg(fp, 11)), hipLinePose = sub(cg(fp, 24), cg(fp, 23));
  const qSpine = twist
    ? basisQ(J.shoCenter, sub(J.shoulderR, J.shoulderL), upPose, shoLinePose)
    : alignQ(J.shoCenter, upPose);
  wj.shoCenter = add(hipC, app(J.shoCenter, qSpine).multiplyScalar(scale));
  let qPel = qSpine;
  if (mode === 'skel' && hipLinePose && J.hipR && J.hipL) {
    qPel = twist
      ? basisQ(sub(J.hipR, J.hipL), J.shoCenter, hipLinePose, upPose)
      : alignQ(sub(J.hipR, J.hipL), hipLinePose);
  }
  if (J.hipL) wj.hipL = add(hipC, app(J.hipL, qPel).multiplyScalar(scale));
  if (J.hipR) wj.hipR = add(hipC, app(J.hipR, qPel).multiplyScalar(scale));
  let qSho = qSpine;
  if (mode === 'skel' && shoLinePose && J.shoulderR && J.shoulderL) {
    qSho = twist
      ? basisQ(sub(J.shoulderR, J.shoulderL), J.shoCenter, shoLinePose, upPose)
      : alignQ(sub(J.shoulderR, J.shoulderL), shoLinePose);
  }
  if (J.shoulderL) wj.shoulderL = add(wj.shoCenter, app(sub(J.shoulderL, J.shoCenter), qSho).multiplyScalar(scale));
  if (J.shoulderR) wj.shoulderR = add(wj.shoCenter, app(sub(J.shoulderR, J.shoCenter), qSho).multiplyScalar(scale));
  const ch = sub(cg(fp, 'headRef'), wj.shoCenter);
  const qHead = (ch && J.headTip) ? alignQ(sub(J.headTip, J.shoCenter), ch) : qSpine;

  if (mode === 'skel') {
    setBone(M.pelvis && M.pelvis.mesh, hipC, qPel, ZERO, scale);
    setBone(M.spine && M.spine.mesh, hipC, qSpine, ZERO, scale);
    setBone(M.clavL && M.clavL.mesh, wj.shoCenter, qSpine, J.shoCenter, scale);
    setBone(M.clavR && M.clavR.mesh, wj.shoCenter, qSpine, J.shoCenter, scale);
    setBone(M.skull && M.skull.mesh, wj.shoCenter, qHead, J.shoCenter, scale);
  }

  const chain = (prox, idxs, jk, mk) => {
    let p = prox;
    for (let i = 0; i < mk.length; i++) {
      const ca = cg(fp, idxs[i]), cb = cg(fp, idxs[i + 1]);
      const ja = J[jk[i]], jb = J[jk[i + 1]];
      if (!p || !ca || !cb || !ja || !jb) { if (p && ja && jb) p = add(p, sub(jb, ja).multiplyScalar(scale)); continue; }
      let q;
      if (twist) {
        const jc = J[jk[i + 2]], cc = cg(fp, idxs[i + 2]);
        const sRest = jc ? sub(jc, jb) : null, sPose = cc ? sub(cc, cb) : null;
        q = (sRest && sPose) ? basisQ(sub(jb, ja), sRest, sub(cb, ca), sPose) : alignQ(sub(jb, ja), sub(cb, ca));
      } else {
        q = alignQ(sub(jb, ja), sub(cb, ca));
      }
      setBone(M[mk[i]] && M[mk[i]].mesh, p, q, ja, scale);
      p = add(p, app(sub(jb, ja), q).multiplyScalar(scale));
    }
  };
  if (wj.shoulderL) chain(wj.shoulderL, [11, 13, 15, 19], ['shoulderL', 'elbowL', 'wristL', 'handTipL'], ['uarmL', 'farmL', 'handL']);
  if (wj.shoulderR) chain(wj.shoulderR, [12, 14, 16, 20], ['shoulderR', 'elbowR', 'wristR', 'handTipR'], ['uarmR', 'farmR', 'handR']);
  if (wj.hipL) chain(wj.hipL, [23, 25, 27, 31], ['hipL', 'kneeL', 'ankleL', 'footTipL'], ['thighL', 'shinL', 'footL']);
  if (wj.hipR) chain(wj.hipR, [24, 26, 28, 32], ['hipR', 'kneeR', 'ankleR', 'footTipR'], ['thighR', 'shinR', 'footR']);
}
