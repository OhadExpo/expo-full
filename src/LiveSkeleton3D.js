// LiveSkeleton3D.js — a real-time 3D skeleton OVERLAID on the Live Coach camera
// feed, fitted to the athlete's body. Two layers, best-of-both:
//   • PRIMARY: the real Z-Anatomy skeleton.glb (the same model the Movement Lab
//     uses), posed live with the shared chunk-rig (anatomyRig.js). Loads async;
//     once the rig is built it replaces the fallback.
//   • FALLBACK: lit bone-cylinders + joint spheres drawn straight from the pose —
//     shown instantly while the GLB downloads/builds, and kept if the GLB fails.
//
// Alignment trick (both layers): X/Y come from the IMAGE landmarks (screen space)
// so a bone sits exactly where the limb is on the feed; Z (depth) comes from the
// worldLandmarks so limbs nearer the camera pop forward and occlude correctly.
// An OrthographicCamera spanning normalized screen space renders it flat-aligned.
//
// createLiveSkeleton(canvas) → { update(landmarks, world, mirrored), resize(), dispose() }
// Caller drives it from the same rAF loop that runs MediaPipe.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { classifyBone, bucketGeos, buildRig, poseRig } from './anatomyRig';

const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/';
const Z_SCALE = 1.4;           // how strongly depth pushes toward/away from camera

// Fallback cylinder rig: MediaPipe Pose bone pairs (torso + limbs) + a head/neck.
const BONES = [
  [11, 13], [13, 15], [12, 14], [14, 16],     // arms
  [11, 12], [11, 23], [12, 24], [23, 24],      // shoulders + torso
  [23, 25], [25, 27], [24, 26], [26, 28],      // legs
  [11, 0], [12, 0],                            // neck → head
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // 0 = head

export function createLiveSkeleton(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x1a1d22, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(1.2, 1.6, 2.0); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd6ff, 0.7); rim.position.set(-1.5, 0.5, -1.0); scene.add(rim);

  // ---- fallback cylinder rig ----
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xeef6ff, roughness: 0.45, metalness: 0.1 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x39bdff, roughness: 0.3, metalness: 0.2, emissive: 0x0a3550 });
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphGeo = new THREE.SphereGeometry(1, 16, 12);
  const cylGroup = new THREE.Group(); scene.add(cylGroup);
  const bones = BONES.map(() => { const m = new THREE.Mesh(cylGeo, boneMat); m.visible = false; cylGroup.add(m); return m; });
  const joints = JOINTS.map(() => { const m = new THREE.Mesh(sphGeo, jointMat); m.visible = false; cylGroup.add(m); return m; });

  // ---- real GLB skeleton (Z-Anatomy), posed via the shared chunk-rig ----
  const skelGroup = new THREE.Group(); skelGroup.visible = false; scene.add(skelGroup);
  // Bone tone that reads on a live (variable) video background: warm ivory with a
  // lift of emissive so it doesn't vanish against a bright wall.
  const glbMat = new THREE.MeshStandardMaterial({ color: 0xede6d6, roughness: 0.7, metalness: 0.0, emissive: 0x14110a, emissiveIntensity: 0.4, side: THREE.FrontSide });
  let glbScene = null, rig = null, glbFailed = false, buildSpan = 0;
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.loadAsync('/anatomy/skeleton.glb')
    .then(g => { glbScene = g.scene; })
    .catch(e => { glbFailed = true; console.warn('live skeleton GLB load failed — keeping bone-cylinder fallback', e); });

  let aspect = 1;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mid = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
  // overlay-space joint points for the rig, reused across frames (the rig clones).
  const fpArr = new Array(33).fill(null);

  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.left = -aspect; camera.right = aspect; camera.top = 1; camera.bottom = -1;
    camera.updateProjectionMatrix();
  }
  resize();

  // image landmark (x,y 0..1) + world z (metres) → overlay space (screen-aligned).
  const ox = (im, mir) => ((mir ? (1 - im.x) : im.x) - 0.5) * 2 * aspect;
  const oy = (im) => -(im.y - 0.5) * 2;
  const oz = (wz) => (wz != null ? -wz : 0) * Z_SCALE;
  const toVec = (out, im, wz, mir) => { out.set(ox(im, mir), oy(im), oz(wz)); return out; };

  function toFp(landmarks, world, mir) {
    for (let i = 0; i < 33; i++) {
      const im = landmarks[i];
      if (!im) { fpArr[i] = null; continue; }
      const v = fpArr[i] || (fpArr[i] = new THREE.Vector3());
      v.set(ox(im, mir), oy(im), oz(world?.[i]?.z));
    }
    return fpArr;
  }

  function poseCylinders(landmarks, world, mir) {
    let boneR = 0.018, jointR = 0.03;
    if (landmarks?.[11] && landmarks?.[23]) {
      const span = Math.hypot(landmarks[11].x - landmarks[23].x, landmarks[11].y - landmarks[23].y) * 2;
      boneR = Math.max(0.012, span * 0.06);
      jointR = Math.max(0.02, span * 0.10);
    }
    bones.forEach((mesh, i) => {
      const [ia, ib] = BONES[i];
      const la = landmarks?.[ia], lb = landmarks?.[ib];
      if (!la || !lb) { mesh.visible = false; return; }
      toVec(_a, la, world?.[ia]?.z, mir);
      toVec(_b, lb, world?.[ib]?.z, mir);
      const len = _a.distanceTo(_b);
      if (!(len > 0)) { mesh.visible = false; return; }
      _mid.addVectors(_a, _b).multiplyScalar(0.5);
      _dir.subVectors(_b, _a).normalize();
      _q.setFromUnitVectors(_up, _dir);
      mesh.position.copy(_mid); mesh.quaternion.copy(_q); mesh.scale.set(boneR, len, boneR);
      mesh.visible = true;
    });
    joints.forEach((mesh, i) => {
      const j = JOINTS[i]; const lj = landmarks?.[j];
      if (!lj) { mesh.visible = false; return; }
      toVec(_a, lj, world?.[j]?.z, mir);
      mesh.position.copy(_a);
      mesh.scale.setScalar(j === 0 ? jointR * 2.6 : jointR);
      mesh.visible = true;
    });
  }
  const hideCylinders = () => { bones.forEach(m => (m.visible = false)); joints.forEach(m => (m.visible = false)); };

  // shoulder-centre → hip-centre distance in the overlay plane: a stable proxy for
  // the athlete's apparent size, so the rig (built once) can be re-scaled to it.
  const spanOf = (fp) => {
    const a = fp[11], b = fp[12], c = fp[23], d = fp[24];
    if (!a || !b || !c || !d) return 0;
    return Math.hypot((a.x + b.x) / 2 - (c.x + d.x) / 2, (a.y + b.y) / 2 - (c.y + d.y) / 2);
  };

  function update(landmarks, world, mirrored = false) {
    if (!landmarks) { hideCylinders(); skelGroup.visible = false; renderer.render(scene, camera); return; }
    const fp = toFp(landmarks, world, mirrored);
    // build the GLB rig once, off the first frame that has the core joints.
    if (!rig && glbScene && fp[23] && fp[24] && fp[11] && fp[12] && fp[25] && fp[26]) {
      try { rig = buildRig(bucketGeos(glbScene, classifyBone), glbMat, skelGroup, 'skel', fp); buildSpan = spanOf(fp); }
      catch (e) { glbFailed = true; console.warn('live skeleton rig build failed — keeping fallback', e); }
      if (!rig) glbFailed = true;
    }
    if (rig) {
      hideCylinders(); skelGroup.visible = true;
      // resize to current distance: clamp so a bad frame can't blow the rig up.
      const s = buildSpan > 1e-4 ? Math.max(0.55, Math.min(1.9, spanOf(fp) / buildSpan)) : 1;
      try { poseRig(fp, rig, true, s); } catch { /* keep last good pose */ }
    } else {
      skelGroup.visible = false; poseCylinders(landmarks, world, mirrored);
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    cylGeo.dispose(); sphGeo.dispose(); boneMat.dispose(); jointMat.dispose(); glbMat.dispose();
    if (rig) { for (const k of Object.keys(rig.M)) { try { rig.M[k].mesh.geometry.dispose(); } catch { /* noop */ } } }
    try { draco.dispose(); } catch { /* noop */ }
    renderer.dispose();
  }

  return { update, resize, dispose, get usingGlb() { return !!rig; }, get glbFailed() { return glbFailed; } };
}
