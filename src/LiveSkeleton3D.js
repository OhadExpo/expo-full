// LiveSkeleton3D.js — a real-time, depth-shaded 3D skeleton (bone cylinders +
// joint spheres) rendered with three.js into a transparent canvas OVERLAID on
// the Live Coach camera feed, fitted to the athlete's body.
//
// Why bones-from-landmarks and not the Movement-Lab skeleton.glb: the GLB needs
// a heavy per-frame chunk-rig retarget that's built for offline playback. For a
// LIVE overlay we draw lit 3D cylinders straight from the pose — genuinely 3D
// (depth from the world landmarks, real lighting) and it aligns to the body
// because the X/Y come from the IMAGE landmarks (screen space), so a bone sits
// exactly where the limb is on the feed. Z (depth) comes from worldLandmarks so
// limbs nearer the camera pop forward.
//
// createLiveSkeleton(canvas) → { update(landmarks, world, mirrored), resize(), dispose() }
// Caller drives it from the same rAF loop that runs MediaPipe.

import * as THREE from 'three';

// MediaPipe Pose bone pairs (torso + limbs). Hands/feet tips dropped — noisy.
const BONES = [
  [11, 13], [13, 15], [12, 14], [14, 16],     // arms
  [11, 12], [11, 23], [12, 24], [23, 24],      // shoulders + torso
  [23, 25], [25, 27], [24, 26], [26, 28],      // legs
  [11, 0], [12, 0],                            // neck → head
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // 0 = head (bigger sphere)

export function createLiveSkeleton(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // Orthographic camera spanning normalized screen space ([-aspect..aspect] x
  // [-1..1]); depth runs along Z so cylinders can lean toward/away from camera.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x1a1d22, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1.2, 1.6, 2.0); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd6ff, 0.7); rim.position.set(-1.5, 0.5, -1.0); scene.add(rim);

  const boneMat = new THREE.MeshStandardMaterial({ color: 0xeef6ff, roughness: 0.45, metalness: 0.1 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x39bdff, roughness: 0.3, metalness: 0.2, emissive: 0x0a3550 });

  // Unit cylinder along +Y, recycled per bone via per-frame transforms.
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphGeo = new THREE.SphereGeometry(1, 16, 12);
  const bones = BONES.map(() => { const m = new THREE.Mesh(cylGeo, boneMat); m.visible = false; scene.add(m); return m; });
  const joints = JOINTS.map(() => { const m = new THREE.Mesh(sphGeo, jointMat); m.visible = false; scene.add(m); return m; });

  let aspect = 1;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mid = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();

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

  // image landmark (x,y in 0..1) + world z (metres, ~-0.5..0.5) → ortho space.
  const Z_SCALE = 1.4;          // how strongly depth pushes toward/away from camera
  const toVec = (out, im, wz, mir) => {
    const x = (mir ? (1 - im.x) : im.x) - 0.5;
    out.set(x * 2 * aspect, -(im.y - 0.5) * 2, (wz != null ? -wz : 0) * Z_SCALE);
    return out;
  };

  function update(landmarks, world, mirrored = false) {
    // size things relative to the body (shoulder→hip span) so it's frame-distance
    // independent — closer athlete = thicker bones.
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
      toVec(_a, la, world?.[ia]?.z, mirrored);
      toVec(_b, lb, world?.[ib]?.z, mirrored);
      const len = _a.distanceTo(_b);
      if (!(len > 0)) { mesh.visible = false; return; }
      _mid.addVectors(_a, _b).multiplyScalar(0.5);
      _dir.subVectors(_b, _a).normalize();
      _q.setFromUnitVectors(_up, _dir);
      mesh.position.copy(_mid);
      mesh.quaternion.copy(_q);
      mesh.scale.set(boneR, len, boneR);
      mesh.visible = true;
    });
    joints.forEach((mesh, i) => {
      const j = JOINTS[i]; const lj = landmarks?.[j];
      if (!lj) { mesh.visible = false; return; }
      toVec(_a, lj, world?.[j]?.z, mirrored);
      mesh.position.copy(_a);
      mesh.scale.setScalar(j === 0 ? jointR * 2.6 : jointR);   // 0 = head skull
      mesh.visible = true;
    });
    renderer.render(scene, camera);
  }

  function dispose() {
    cylGeo.dispose(); sphGeo.dispose(); boneMat.dispose(); jointMat.dispose();
    renderer.dispose();
  }

  return { update, resize, dispose };
}
