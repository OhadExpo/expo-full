// AnatomyModelViewer.jsx — REAL Z-Anatomy 3D models (CC BY-SA), posed from a
// captured rep. Loads the anatomical skeleton + muscle GLBs, groups their many
// meshes into anatomical bones (by name + side), then drives them with a
// CONNECTED forward-kinematic rig: every bone is anchored at its parent's joint
// and only ROTATED to follow the captured limb — so the figure stays connected
// (no gaps) and bends like a real body. Peel SKIN-less: MUSCLE → BONE.
//
// Models © Z-Anatomy (Creative Commons Attribution-ShareAlike 4.0).

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, FN } from './theme';
import { frameToPoints3D } from './poseLab';

const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/';
const ZERO = new THREE.Vector3(0, 0, 0);

function classifyBone(name, region, cx) {
  const n = name.toLowerCase(); const s = cx < 0 ? 'L' : 'R';
  // soft tissue that spans/protrudes when posed onto a rigid bone — drop it.
  if (/cartilage|ligament|membrane|meniscus|\bdisc|tendon|fontanelle|capsule|labrum|bursa/.test(n)) return null;
  if (/skull|crani|mandible|maxilla|occipital|parietal|frontal bone|temporal bone|sphenoid|ethmoid|zygomatic|palatine|vomer|lacrimal|nasal bone|hyoid|teeth|dent|facial|mental/.test(n)) return 'skull';
  if (/pelvi|ilium|ischium|pubis|hip bone|coxal|innominate|acetabul/.test(n)) return 'pelvis';
  if (/vertebr|cervical|thoracic|lumbar|sacr|coccyx|\brib\b|costal|sternum|thorax|atlas|\baxis\b|spinal/.test(n)) return 'spine';
  if (/clavicle|scapula|acromion|glenoid|coracoid/.test(n)) return 'clav' + s;
  if (/humerus|humeral/.test(n)) return 'uarm' + s;
  if (/radius|ulna|radial|ulnar/.test(n)) return 'farm' + s;
  if (/femur|femoral|patella/.test(n)) return 'thigh' + s;
  if (/tibia|fibula|tibial|fibular/.test(n)) return 'shin' + s;
  if (/calcaneus|talus|tars|metatars/.test(n) || (region === 'lower' && /phalan|sesamoid/.test(n))) return 'foot' + s;
  if (/carp|metacarp/.test(n) || (region === 'upper' && /phalan|sesamoid/.test(n))) return 'hand' + s;
  if (region === 'lower') return /thigh|femur/.test(n) ? 'thigh' + s : 'shin' + s;
  if (region === 'upper') return 'farm' + s;
  return 'spine';
}
// The muscle GLB has no limb hierarchy, but every mesh carries an anatomical
// name + an l/r side and sits in a known standing pose. Classify by name, with
// one height guard: arm rules only apply above the hip line, so an ambiguous
// "flexor_digitorum_longus" in the calf is read as a leg, not an arm.
function classifyMuscle(name, region, cx, cy) {
  const n = name.toLowerCase();
  const s = cx < 0 ? 'L' : 'R';
  // thin connective-tissue bands + long multi-joint tendons + scalp/ear sheets
  // protrude as spikes/horns when posed onto one rigid bone — drop them.
  if (/retinaculum|aponeuros|ligament|septum|raphe|sheath|tendinous_arch|interosseous_membrane|annular|digitorum_longus|hallucis_longus|digiti_minimi|pollicis_longus|extensor_digitorum|flexor_digitorum|auricular|temporoparietal|epicranial|galea|bursa|iliotibial|(^|_)tract/.test(n)) return null;
  // hands & feet are many small structures that splay when rigidly posed and add
  // nothing to lift mechanics — the muscle layer ends at the wrist/ankle (the
  // skeleton layer keeps them).
  if (/hand|metacarp|palmar|thenar|hypothenar|lumbrical|interosse|finger|phalan|foot|metatars|plantar|tarsal|hallucis|pedis/.test(n)) return null;
  const armOK = cy > 0.9;                              // arms live above the hip line
  if (armOK && /antebrach|forearm|wrist|radial|ulnar|pronator|supinator|brachioradialis|flexor_carpi|extensor_carpi|palmaris/.test(n)) return 'farm' + s;
  if (armOK && /brachial|brachii|deltoid|axilla|triceps|biceps|coracobrach|anconeus|(^|_)arm/.test(n)) return 'uarm' + s;
  if (/crural|popliteal|tibial|gastrocn|soleus|peroneal|fibular|(^|_)leg|calf|plantaris/.test(n)) return 'shin' + s;
  if (/femoral|femur|fascia_lata|thigh|quadriceps|rectus_femoris|vastus|hamstring|biceps_femoris|semitendinosus|semimembranosus|adductor|sartorius|gracilis|tensor_fasciae/.test(n)) return 'thigh' + s;
  if (/temporal|masseter|facial|cranial|occipito|scalp|buccinator|orbicularis|nasal|zygomatic|frontalis|pterygoid/.test(n)) return 'headM';
  // neck stays with the trunk so it doesn't swing off the head bone
  return 'trunk';
}
const regionOf = (obj) => {
  let p = obj;
  while (p) { const n = (p.name || '').toLowerCase(); if (n.includes('upper limb')) return 'upper'; if (n.includes('lower limb')) return 'lower'; p = p.parent; }
  return 'core';
};

// principal-axis endpoints of a merged geometry (the two ends of its longest
// dimension) plus its centroid. Proximal/distal are decided later by distance
// to the body centre — orientation-independent, so it survives an A/T-posed model.
function ends(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox; const size = new THREE.Vector3(); bb.getSize(size);
  const ax = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
  const c = bb.getCenter(new THREE.Vector3());
  const e0 = c.clone(), e1 = c.clone(); e0[ax] = bb.min[ax]; e1[ax] = bb.max[ax];
  return { e0, e1, centroid: c };
}
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);

export default function AnatomyModelViewer({ frames }) {
  const mountRef = useRef(null);
  const poseFrames = useRef(frames.filter(f => f.worldLandmarks)).current;
  const [status, setStatus] = useState('loading');   // loading | ready | error
  const [peel, setPeel] = useState(0);                // 0 muscle · 1 bone
  const [playing, setPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);
  const peelRef = useRef(0), playRef = useRef(true), frameRef = useRef(0);
  useEffect(() => { peelRef.current = peel; }, [peel]);
  useEffect(() => { playRef.current = playing; }, [playing]);
  useEffect(() => { frameRef.current = frameIdx; }, [frameIdx]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !poseFrames.length) return;
    const W = mount.clientWidth || 340, H = 460;
    let disposed = false, raf;

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0b0d);
    const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 100);
    camera.position.set(0.65, -0.05, 2.55);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
    mount.appendChild(renderer.domElement);
    // studio 3-point + soft sky/ground hemisphere for anatomical depth
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a1a18, 0.85));
    const k = new THREE.DirectionalLight(0xffffff, 1.5); k.position.set(2.2, 3, 2.5); scene.add(k);
    const fl = new THREE.DirectionalLight(0x9fc4ff, 0.7); fl.position.set(-2.6, 0.6, 1.2); scene.add(fl);
    const rim = new THREE.DirectionalLight(0xffd9c2, 0.65); rim.position.set(-0.5, 1.5, -3); scene.add(rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 0.7; controls.maxDistance = 8;
    controls.target.set(0, -0.12, 0);
    controls.saveState();                              // so reset() returns to this framing
    // slow showcase spin on load; stops the instant the coach grabs it
    controls.autoRotate = true; controls.autoRotateSpeed = 0.9;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    // double-tap / double-click recenters the view (and resumes the spin)
    const onReset = () => { controls.reset(); controls.autoRotate = true; };
    renderer.domElement.addEventListener('dblclick', onReset);

    const boneMat = new THREE.MeshStandardMaterial({ color: 0xeae3d2, roughness: 0.52, metalness: 0.03, side: THREE.DoubleSide });
    // wet-muscle look: deep anatomical red with a clearcoat sheen
    const muscleMat = new THREE.MeshPhysicalMaterial({ color: 0xbe4537, roughness: 0.55, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0x6a1812), emissive: 0x220807, emissiveIntensity: 0.28, side: THREE.DoubleSide });

    const skelGroup = new THREE.Group(), muscGroup = new THREE.Group();
    scene.add(skelGroup); scene.add(muscGroup);
    let skelRig = null, muscRig = null;

    const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH);
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

    // ---- capture-space joints (post frameToPoints3D = metres, Y-up) ----
    const rawPts = poseFrames.map(f => { const p = frameToPoints3D(f.worldLandmarks); return p.map(q => q ? new THREE.Vector3(q.x, q.y, q.z) : null); });
    // light temporal smoothing (0.25 / 0.5 / 0.25) damps MediaPipe's per-frame
    // jitter on real video; null landmarks fall back to the centre frame.
    const framePts = rawPts.map((cur, i) => {
      const prev = rawPts[i - 1], next = rawPts[i + 1];
      return cur.map((c, j) => {
        if (!c) return null;
        const p = prev && prev[j], n = next && next[j];
        if (!p && !n) return c.clone();
        const out = c.clone().multiplyScalar(0.5); let w = 0.5;
        if (p) { out.add(p.clone().multiplyScalar(0.25)); w += 0.25; }
        if (n) { out.add(n.clone().multiplyScalar(0.25)); w += 0.25; }
        return out.multiplyScalar(1 / w);
      });
    });
    const cg = (fp, key) => {
      if (key === 'hipCenter') { const a = fp[23], b = fp[24]; return a && b ? a.clone().add(b).multiplyScalar(0.5) : null; }
      if (key === 'shoCenter') { const a = fp[11], b = fp[12]; return a && b ? a.clone().add(b).multiplyScalar(0.5) : null; }
      // stable head point: ear midpoint biased slightly to the nose. The bare
      // nose landmark's depth is noisy, which makes the skull tilt on real video.
      if (key === 'headRef') {
        const n = fp[0], l = fp[7], r = fp[8];
        if (l && r) { const m = l.clone().add(r).multiplyScalar(0.5); return n ? m.multiplyScalar(0.7).add(n.clone().multiplyScalar(0.3)) : m; }
        return n ? n.clone() : null;
      }
      return fp[key] ? fp[key].clone() : null;
    };

    // ---- math helpers ----
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
    const _t1 = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t2 = new THREE.Matrix4();
    const setBone = (mesh, prox, q, restProx) => {
      if (!mesh || !prox || !q) return;
      const rp = restProx || ZERO;
      _t1.makeTranslation(prox.x, prox.y, prox.z);
      _r.makeRotationFromQuaternion(q);
      _t2.makeTranslation(-rp.x, -rp.y, -rp.z);
      mesh.matrix.copy(_t1).multiply(_r).multiply(_t2);
      mesh.matrixAutoUpdate = false; mesh.visible = true;
    };

    // group a GLB's meshes into named buckets (geometry baked to world space)
    const bucketGeos = (root, classify) => {
      const buckets = {}; const c = new THREE.Vector3();
      root.updateWorldMatrix(true, true);
      root.traverse(o => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
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
    };

    // merge each bucket into one bone mesh; record its principal endpoints.
    const mergeBucket = (geos, mat) => {
      const g = mergeGeometries(geos, false); if (!g) return null;
      if (!g.attributes.normal) g.computeVertexNormals();
      return { mesh: new THREE.Mesh(g, mat), ...ends(g) };
    };

    // derive the model-space joint table from the merged bone meshes. Each limb
    // is a chain (upper→fore→hand): the proximal joint is the segment end FARTHEST
    // from the next segment, and shared joints sit BETWEEN neighbouring segments.
    // Neighbour-relative, so it survives any model pose or odd body centre.
    const deriveJoints = (M, mode, bodyCenter) => {
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
      if (mode === 'skel') {
        J.hipCenter = h('pelvis') ? M.pelvis.centroid.clone() : (J.hipL && J.hipR ? mid(J.hipL, J.hipR) : new THREE.Vector3());
        J.shoCenter = (J.shoulderL && J.shoulderR) ? mid(J.shoulderL, J.shoulderR) : (h('spine') ? M.spine.centroid.clone() : up(J.hipCenter, 0.5));
        J.headTip = h('skull') ? M.skull.centroid.clone() : up(J.shoCenter, 0.22);
      } else {
        // muscle 'trunk' is one blob — its Y-extremes are unreliable, so take
        // the body centres from the limb joints (shoulders/hips), not the trunk.
        J.hipCenter = (J.hipL && J.hipR) ? mid(J.hipL, J.hipR) : (h('trunk') ? M.trunk.centroid.clone() : new THREE.Vector3());
        J.shoCenter = (J.shoulderL && J.shoulderR) ? mid(J.shoulderL, J.shoulderR) : up(J.hipCenter, 0.5);
        J.headTip = h('headM') ? M.headM.centroid.clone() : up(J.shoCenter, 0.22);
      }
      return J;
    };

    // build a rig from one GLB: bucket → merge → joints → center+scale to body
    const buildRig = (buckets, mat, group, mode) => {
      const M = {};
      for (const key of Object.keys(buckets)) { const r = mergeBucket(buckets[key], mat); if (r) { M[key] = r; group.add(r.mesh); } }
      const keys = Object.keys(M);
      if (!keys.length) return null;
      const bc = new THREE.Vector3(); for (const key of keys) bc.add(M[key].centroid); bc.multiplyScalar(1 / keys.length);
      const J = deriveJoints(M, mode, bc);
      // one global scale so real model proportions match the captured body
      const fp0 = framePts[0]; const ratios = [];
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
    };

    // CONNECTED FK pose: anchor each bone at its parent's posed joint, rotate to
    // follow the captured segment, advance the joint, recurse down the chain.
    const poseRig = (fp, rig) => {
      const { J, M, mode } = rig;
      const hipC = cg(fp, 'hipCenter'), shoC = cg(fp, 'shoCenter'); if (!hipC || !shoC) return;
      const wj = {};
      const qSpine = alignQ(J.shoCenter, sub(shoC, hipC));
      wj.shoCenter = add(hipC, app(J.shoCenter, qSpine));
      let qPel = qSpine;
      if (mode === 'skel') { const cl = sub(cg(fp, 24), cg(fp, 23)); if (cl && J.hipR && J.hipL) qPel = alignQ(sub(J.hipR, J.hipL), cl); }
      if (J.hipL) wj.hipL = add(hipC, app(J.hipL, qPel));
      if (J.hipR) wj.hipR = add(hipC, app(J.hipR, qPel));
      let qSho = qSpine;
      if (mode === 'skel') { const cl = sub(cg(fp, 12), cg(fp, 11)); if (cl && J.shoulderR && J.shoulderL) qSho = alignQ(sub(J.shoulderR, J.shoulderL), cl); }
      if (J.shoulderL) wj.shoulderL = add(wj.shoCenter, app(sub(J.shoulderL, J.shoCenter), qSho));
      if (J.shoulderR) wj.shoulderR = add(wj.shoCenter, app(sub(J.shoulderR, J.shoCenter), qSho));
      const ch = sub(cg(fp, 'headRef'), wj.shoCenter);
      const qHead = (ch && J.headTip) ? alignQ(sub(J.headTip, J.shoCenter), ch) : qSpine;

      if (mode === 'skel') {
        setBone(M.pelvis && M.pelvis.mesh, hipC, qPel, ZERO);
        setBone(M.spine && M.spine.mesh, hipC, qSpine, ZERO);
        setBone(M.clavL && M.clavL.mesh, wj.shoCenter, qSho, J.shoCenter);
        setBone(M.clavR && M.clavR.mesh, wj.shoCenter, qSho, J.shoCenter);
        setBone(M.skull && M.skull.mesh, wj.shoCenter, qHead, J.shoCenter);
      } else {
        setBone(M.trunk && M.trunk.mesh, hipC, qSpine, ZERO);
        setBone(M.headM && M.headM.mesh, wj.shoCenter, qHead, J.shoCenter);
      }

      const chain = (prox, idxs, jk, mk) => {
        let p = prox;
        for (let i = 0; i < mk.length; i++) {
          const ca = cg(fp, idxs[i]), cb = cg(fp, idxs[i + 1]);
          const ja = J[jk[i]], jb = J[jk[i + 1]];
          if (!p || !ca || !cb || !ja || !jb) { if (p && ja && jb) p = add(p, sub(jb, ja)); continue; }
          const q = alignQ(sub(jb, ja), sub(cb, ca));
          setBone(M[mk[i]] && M[mk[i]].mesh, p, q, ja);
          p = add(p, app(sub(jb, ja), q));
        }
      };
      if (wj.shoulderL) chain(wj.shoulderL, [11, 13, 15, 19], ['shoulderL', 'elbowL', 'wristL', 'handTipL'], ['uarmL', 'farmL', 'handL']);
      if (wj.shoulderR) chain(wj.shoulderR, [12, 14, 16, 20], ['shoulderR', 'elbowR', 'wristR', 'handTipR'], ['uarmR', 'farmR', 'handR']);
      if (wj.hipL) chain(wj.hipL, [23, 25, 27, 31], ['hipL', 'kneeL', 'ankleL', 'footTipL'], ['thighL', 'shinL', 'footL']);
      if (wj.hipR) chain(wj.hipR, [24, 26, 28, 32], ['hipR', 'kneeR', 'ankleR', 'footTipR'], ['thighR', 'shinR', 'footR']);
    };

    const applyPose = (fi) => { const fp = framePts[Math.min(fi, framePts.length - 1)]; if (skelRig) poseRig(fp, skelRig); if (muscRig) poseRig(fp, muscRig); };

    Promise.all([
      loader.loadAsync('/anatomy/skeleton.glb').then(g => { if (!disposed) skelRig = buildRig(bucketGeos(g.scene, classifyBone), boneMat, skelGroup, 'skel'); }),
      loader.loadAsync('/anatomy/muscles.glb').then(g => { if (!disposed) muscRig = buildRig(bucketGeos(g.scene, classifyMuscle), muscleMat, muscGroup, 'musc'); }).catch(() => {}),
    ]).then(() => {
      if (disposed) return;
      applyPose(0); setStatus('ready');
      muscGroup.visible = peelRef.current === 0; skelGroup.visible = peelRef.current === 1;
      let last = performance.now(), acc = 0, lastPosed = -1, lastPeel = peelRef.current; const fps = 24;
      const loop = (now) => {
        acc += now - last; last = now;
        if (playRef.current && poseFrames.length > 1 && acc >= 1000 / fps) { acc = 0; frameRef.current = (frameRef.current + 1) % poseFrames.length; setFrameIdx(frameRef.current); }
        if (frameRef.current !== lastPosed) { applyPose(frameRef.current); lastPosed = frameRef.current; }
        if (peelRef.current !== lastPeel) { muscGroup.visible = peelRef.current === 0; skelGroup.visible = peelRef.current === 1; lastPeel = peelRef.current; }
        controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }).catch(e => { console.warn('anatomy load failed', e); if (!disposed) setStatus('error'); });

    const onResize = () => { const w = mount.clientWidth || W; renderer.setSize(w, H); camera.aspect = w / H; camera.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('dblclick', onReset);
      controls.dispose(); renderer.dispose(); draco.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      try { mount.removeChild(renderer.domElement); } catch {}
    };
  }, [poseFrames]);

  if (!poseFrames.length) return <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: 20 }}>No 3D pose captured in that clip.</div>;
  const f = Math.min(frameIdx, poseFrames.length - 1);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <Pill active={peel === 0} onClick={() => setPeel(0)}>MUSCLE</Pill>
        <Pill active={peel === 1} onClick={() => setPeel(1)}>BONE</Pill>
        <Pill active={playing} onClick={() => setPlaying(p => !p)}>{playing ? '❚❚ PAUSE' : '▶ PLAY'}</Pill>
      </div>
      <div ref={mountRef} style={{ position: 'relative', width: '100%', maxWidth: 340, height: 460, margin: '0 auto', background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', touchAction: 'none' }}>
        {status !== 'ready' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: FN, fontSize: 12, letterSpacing: '0.12em' }}>
            {status === 'error' ? 'COULD NOT LOAD MODEL' : 'LOADING ANATOMY…'}
          </div>
        )}
      </div>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textAlign: 'center', marginTop: 6 }}>DRAG ORBIT · WHEEL / PINCH ZOOM · Z-ANATOMY (CC BY-SA)</div>
      <input type="range" min={0} max={poseFrames.length - 1} value={f} onChange={e => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
        style={{ width: '100%', maxWidth: 340, display: 'block', margin: '10px auto 0', accentColor: C.ac }} />
      <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>FRAME {f + 1} / {poseFrames.length}</div>
    </div>
  );
}

const Pill = ({ onClick, active, children }) => (
  <button onClick={onClick} style={{ padding: '6px 12px', background: active ? C.ac : 'transparent', color: '#FFF', border: `1px solid ${active ? C.ac : 'rgba(255,255,255,0.25)'}`, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 0 }}>{children}</button>
);
