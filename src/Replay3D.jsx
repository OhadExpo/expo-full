// REPLAY 3D (5.10 #556, Ohad: "Do 23" - "spin the athlete's landing to any angle
// after filming"). A real 3D scene of the pose the clip already gave us
// (MediaPipe world landmarks, metres): a solid body standing on a measured floor,
// 3D trails of the hands (the bar path) and the hips, front / side / top / behind
// and free orbit, slow motion, and the true 3D knee / hip / elbow angles at the
// frame on screen. It follows the video's playhead when the clip plays. No new
// model, no server: the same frames the metrics use.
//
// The geometry rules are poseLab's (frameToPoints3D: y up, a proper rotation;
// lmVisible: a point MediaPipe is unsure of is not drawn). If WebGL is not there
// the caller keeps the flat viewer (onUnsupported).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { frameToPoints3D, stabilizeWorldFrames, lmVisible } from './poseLab';
import { C, FN } from './theme';
import { useT } from './i18n';
import { ChipGrid } from './ui';

const ACCENT = 0x39bdff, HIP_TRAIL = 0xf5a524, BODY = 0xe8eef5;
const FEET = [27, 28, 29, 30, 31, 32];

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

// the true 3D angle at b (a-b-c), degrees
function angle3(a, b, c) {
  if (!a || !b || !c) return null;
  const u = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }, v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const d = Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z);
  if (!d) return null;
  return Math.round((Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / d))) * 180) / Math.PI);
}

export default function Replay3D({ frames, playheadT = null, onUnsupported, onSeek = null }) {
  const tt = useT();
  const hostRef = useRef(null), wrapRef = useRef(null);
  const stateRef = useRef(null);
  const [supported] = useState(() => webglOk());
  const poseFrames = useMemo(() => stabilizeWorldFrames((frames || []).filter((f) => f && f.worldLandmarks)), [frames]);   // 5.10 #558
  const pts = useMemo(() => poseFrames.map((f) => frameToPoints3D(f.worldLandmarks)), [poseFrames]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [trails, setTrails] = useState(true);
  const idxRef = useRef(0); idxRef.current = idx;

  useEffect(() => { if (!supported && onUnsupported) onUnsupported(); }, [supported, onUnsupported]);

  // the floor: the lowest a foot gets anywhere in the clip (the body never sinks into it)
  const floorY = useMemo(() => {
    let m = Infinity;
    for (const p of pts) for (const k of FEET) { const q = p && p[k]; if (q && lmVisible(q) && q.y < m) m = q.y; }
    return isFinite(m) ? m : -0.95;
  }, [pts]);

  // build the scene once per clip
  useEffect(() => {
    if (!supported || !hostRef.current || !pts.length) return undefined;
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // filmic tone + sRGB: the body reads as a lit form, not flat grey (10.10 #640)
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d10);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
    const centreY = floorY + 0.95;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, centreY, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 1.2; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.495;
    camera.position.set(2.1, centreY + 0.5, 2.6);

    scene.add(new THREE.HemisphereLight(0xdfefff, 0x141820, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
    scene.add(key);
    // a cool fill from the other side and a cyan rim from behind: the silhouette separates from the dark
    const fill = new THREE.DirectionalLight(0x9fc7ff, 0.45); fill.position.set(-3, 2, 1.5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa8dcff, 0.5); rim.position.set(-1.5, 2.6, -3.5); scene.add(rim);

    // the floor: a grid on a plane that takes the body's shadow
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.35 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = floorY; plane.receiveShadow = true; scene.add(plane);
    // a lit floor disc under him, so he stands somewhere rather than in a void
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), new THREE.MeshStandardMaterial({ color: 0x161d25, roughness: 0.95 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = floorY - 0.002; disc.receiveShadow = true; scene.add(disc);
    const grid = new THREE.GridHelper(6, 24, 0x2a3a4a, 0x1a242e); grid.position.y = floorY + 0.001; scene.add(grid);

    // THE MANNEQUIN (10.10 #640, Ohad: "all the skeleton and 3d lab are currently awful : can be
    // 10x better"). Not sticks: tapered limbs - thick at the hip and shoulder, thin at the ankle and
    // wrist - a chest, belly and pelvis with volume built on HIS spine and shoulder line, a neck, a
    // head with a visor that shows where he faces, hands and feet. Left joints cyan, right joints
    // orange: the angle box's L and R. Every part is placed from the same stable world landmarks.
    const skin = new THREE.MeshPhysicalMaterial({ color: BODY, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5 });
    const trunkMat = new THREE.MeshPhysicalMaterial({ color: 0xc6d0db, roughness: 0.5, metalness: 0, clearcoat: 0.25 });
    const LEFT_MAT = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.35, emissive: 0x06283a });
    const RIGHT_MAT = new THREE.MeshStandardMaterial({ color: HIP_TRAIL, roughness: 0.35, emissive: 0x3a2405 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.2, metalness: 0.3 });
    const addMesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    // a limb: an open tapered tube, radius r0 at the joint it leaves and r1 at the one it reaches
    const LIMBS = [[11, 13, 0.050, 0.041], [13, 15, 0.040, 0.030], [12, 14, 0.050, 0.041], [14, 16, 0.040, 0.030],
      [23, 25, 0.085, 0.058], [25, 27, 0.056, 0.040], [24, 26, 0.085, 0.058], [26, 28, 0.056, 0.040]];
    const limbs = LIMBS.map(([a, b, r0, r1]) => ({ a, b, m: addMesh(new THREE.CylinderGeometry(r1, r0, 1, 24, 1, true), skin) }));
    // the joint balls close the tubes; odd MediaPipe indices are his LEFT side
    const JOINT_R = { 11: 0.054, 12: 0.054, 13: 0.043, 14: 0.043, 15: 0.032, 16: 0.032, 23: 0.074, 24: 0.074, 25: 0.06, 26: 0.06, 27: 0.042, 28: 0.042 };
    const joints = Object.entries(JOINT_R).map(([k, r]) => ({ k: +k, m: addMesh(new THREE.SphereGeometry(r, 24, 16), +k % 2 ? LEFT_MAT : RIGHT_MAT) }));
    const unit = new THREE.SphereGeometry(1, 32, 24);
    // the core is one smooth capsule along his spine; the chest (wider, flatter) blends over its top
    const core = addMesh(new THREE.CapsuleGeometry(1, 1, 8, 24), trunkMat);
    const chest = addMesh(unit, trunkMat), pelvis = addMesh(unit, trunkMat);
    const neck = addMesh(new THREE.CylinderGeometry(0.045, 0.056, 1, 20, 1, true), skin);
    const head = addMesh(unit, skin), visor = addMesh(unit, visorMat);
    const hands = [0, 1].map(() => addMesh(unit, skin));
    const feet = [0, 1].map(() => addMesh(unit, skin));

    // 3D trails over the whole clip, revealed up to the frame on screen
    const mid = (p, i, j) => (p && lmVisible(p[i]) && lmVisible(p[j]) ? new THREE.Vector3((p[i].x + p[j].x) / 2, (p[i].y + p[j].y) / 2, (p[i].z + p[j].z) / 2) : null);
    const mkTrail = (pick, color) => {
      const arr = new Float32Array(pts.length * 3); let last = null;
      pts.forEach((p, i) => { const v = pick(p) || last; last = v; if (v) { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      scene.add(line); return line;
    };
    const handTrail = mkTrail((p) => mid(p, 15, 16), ACCENT);
    const hipTrail = mkTrail((p) => mid(p, 23, 24), HIP_TRAIL);

    const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), q = new THREE.Quaternion();
    const V = (P) => new THREE.Vector3(P.x, P.y, P.z);
    const basis = new THREE.Matrix4();
    // an ellipsoid on its own right-handed axes x (side), y (along), z (front), radii sx sy sz
    const place = (m, c, ax, ay, az, sx, sy, sz) => { basis.makeBasis(ax, ay, az); m.quaternion.setFromRotationMatrix(basis); m.position.copy(c); m.scale.set(sx, sy, sz); m.visible = true; };
    // axes from a side vector and an up vector: y = up, x = side without its up part, z = x * y
    const axesOf = (side, upv) => { const y = upv.clone().normalize(); const x = side.clone().addScaledVector(y, -side.dot(y)).normalize(); return [x, y, new THREE.Vector3().crossVectors(x, y).normalize()]; };
    const pose = (i) => {
      const p = pts[Math.max(0, Math.min(pts.length - 1, i))] || [];
      const ok = (k) => lmVisible(p[k]);
      for (const o of limbs) {
        if (!ok(o.a) || !ok(o.b)) { o.m.visible = false; continue; }
        const a = V(p[o.a]), b = V(p[o.b]); const len = a.distanceTo(b);
        if (len < 1e-4) { o.m.visible = false; continue; }
        o.m.visible = true; o.m.position.copy(a).add(b).multiplyScalar(0.5); o.m.scale.set(1, len, 1);
        q.setFromUnitVectors(up, tmp.copy(b).sub(a).normalize()); o.m.quaternion.copy(q);
      }
      for (const j of joints) { j.m.visible = ok(j.k); if (j.m.visible) j.m.position.copy(V(p[j.k])); }
      // the trunk, on his own spine and shoulder line
      const trunk = ok(11) && ok(12) && ok(23) && ok(24);
      let spineUp = null;
      if (trunk) {
        const S = V(p[11]).add(V(p[12])).multiplyScalar(0.5), H = V(p[23]).add(V(p[24])).multiplyScalar(0.5);
        const spine = S.clone().sub(H); const L = Math.max(0.2, spine.length());
        const sideS = V(p[12]).sub(V(p[11])), sideH = V(p[24]).sub(V(p[23]));
        const sw = sideS.length(), hw = sideH.length();
        const [sx, sy, sz] = axesOf(sideS, spine);
        const [hx, hy, hz] = axesOf(sideH, spine);
        const [bx, by, bz] = axesOf(sideS.clone().normalize().add(sideH.clone().normalize()), spine);
        place(chest, H.clone().addScaledVector(sy, L * 0.74), sx, sy, sz, Math.max(0.12, sw * 0.55), L * 0.25, 0.105);
        // capsule height = 3 x its y scale (length 1 + two radii): shoulders to hips
        place(core, H.clone().addScaledVector(by, L * 0.47), bx, by, bz, Math.max(0.10, Math.max(hw * 0.95, sw * 0.8) * 0.5), L * 0.29, 0.095);
        place(pelvis, H.clone().addScaledVector(hy, 0.02), hx, hy, hz, Math.max(0.12, hw * 0.8), 0.115, 0.12);
        neck.visible = true; neck.position.copy(S).addScaledVector(sy, 0.065); neck.scale.set(1, 0.15, 1); neck.quaternion.setFromUnitVectors(up, sy);
        spineUp = sy;
      } else { chest.visible = core.visible = pelvis.visible = neck.visible = false; }
      // the head from the face, never from the shoulder line (poseLab's rule); the visor faces his nose
      const ears = [7, 8].filter(ok);
      head.visible = visor.visible = ears.length > 0 || ok(0);
      if (head.visible) {
        const E = ears.length ? ears.reduce((acc, k) => acc.add(V(p[k])), new THREE.Vector3()).multiplyScalar(1 / ears.length) : V(p[0]);
        const hy = (spineUp || up).clone();
        const hf = ok(0) && ears.length ? V(p[0]).sub(E) : new THREE.Vector3(0, 0, 1);
        hf.addScaledVector(hy, -hf.dot(hy)); if (hf.lengthSq() < 1e-8) hf.set(0, 0, 1); hf.normalize();
        const hx = new THREE.Vector3().crossVectors(hy, hf).normalize();
        const c = E.clone().addScaledVector(hy, 0.03);
        place(head, c, hx, hy, hf, 0.085, 0.115, 0.1);
        place(visor, c.clone().addScaledVector(hf, 0.072).addScaledVector(hy, 0.012), hx, hy, hf, 0.068, 0.028, 0.034);
      }
      // hands: from the wrist toward the knuckles (index + pinky), or along the forearm
      [[15, 17, 19, 13], [16, 18, 20, 14]].forEach(([w, pk, ix, el], n) => {
        const m = hands[n];
        if (!ok(w)) { m.visible = false; return; }
        const W = V(p[w]);
        const dir = ok(pk) && ok(ix) ? V(p[pk]).add(V(p[ix])).multiplyScalar(0.5).sub(W) : ok(el) ? W.clone().sub(V(p[el])) : null;
        if (!dir || dir.lengthSq() < 1e-8) { m.visible = false; return; }
        dir.normalize(); m.visible = true;
        m.position.copy(W).addScaledVector(dir, 0.062); m.quaternion.setFromUnitVectors(up, dir); m.scale.set(0.036, 0.072, 0.036);
      });
      // feet: heel to toe, resting on the floor line
      [[29, 31], [30, 32]].forEach(([he, to], n) => {
        const m = feet[n];
        if (!ok(he) || !ok(to)) { m.visible = false; return; }
        const Hh = V(p[he]), T = V(p[to]); const d = T.clone().sub(Hh); const len = d.length();
        if (len < 1e-3) { m.visible = false; return; }
        d.normalize(); m.visible = true;
        m.position.copy(Hh).add(T).multiplyScalar(0.5).addScaledVector(up, 0.022);
        m.quaternion.setFromUnitVectors(up, d); m.scale.set(0.042, len * 0.58, 0.042);
      });
      handTrail.geometry.setDrawRange(0, i + 1); hipTrail.geometry.setDrawRange(0, i + 1);
    };

    const size = () => {
      const w = host.clientWidth || 320, h = Math.round(Math.min(560, w * 1.15));
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(host);
    let raf = 0, alive = true;
    const loop = () => { if (!alive) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    stateRef.current = { pose, camera, controls, centreY, handTrail, hipTrail };
    pose(idxRef.current);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [supported, pts, floorY]);

  // the frame on screen
  useEffect(() => { const s = stateRef.current; if (s) s.pose(idx); }, [idx]);
  useEffect(() => { const s = stateRef.current; if (s) { s.handTrail.visible = trails; s.hipTrail.visible = trails; } }, [trails]);

  // follow the clip while not playing on its own
  useEffect(() => {
    if (playing || playheadT == null || !poseFrames.length) return;
    const t0 = poseFrames[0].t; let best = 0, bd = Infinity;
    for (let i = 0; i < poseFrames.length; i++) { const d = Math.abs((poseFrames[i].t - t0) - playheadT); if (d < bd) { bd = d; best = i; } }
    setIdx(best);
  }, [playheadT, playing, poseFrames]);

  // own playback, at the chosen speed, on the clip's real timeline
  useEffect(() => {
    if (!playing || poseFrames.length < 2) return undefined;
    let raf = 0, last = performance.now(), clock = poseFrames[idxRef.current].t;
    const end = poseFrames[poseFrames.length - 1].t;
    const tick = (now) => {
      clock += (now - last) * speed; last = now;
      if (clock > end) clock = poseFrames[0].t;
      let i = idxRef.current; while (i + 1 < poseFrames.length && poseFrames[i + 1].t <= clock) i++; if (poseFrames[i].t > clock) i = 0;
      setIdx(i); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, poseFrames]);

  const view = (k) => {
    const s = stateRef.current; if (!s) return;
    const y = s.centreY, d = 2.9;
    const P = { front: [0, y + 0.25, d], side: [d, y + 0.25, 0], top: [0.001, y + 3.6, 0.001], behind: [0, y + 0.25, -d] }[k];
    s.camera.position.set(P[0], P[1], P[2]); s.controls.target.set(0, y, 0); s.controls.update();
  };
  const full = () => { const el = wrapRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); };

  if (!supported) return null;
  if (!pts.length) return <div style={{ color: C.tm, fontFamily: FN, fontSize: 11, padding: 12 }}>{tt('No 3D pose captured in that clip.')}</div>;

  const p = pts[idx] || [];
  const a = (i, j, k) => (lmVisible(p[i]) && lmVisible(p[j]) && lmVisible(p[k]) ? angle3(p[i], p[j], p[k]) : null);
  const angles = [
    [tt('KNEE'), a(23, 25, 27), a(24, 26, 28)],
    [tt('HIP'), a(11, 23, 25), a(12, 24, 26)],
    [tt('ELBOW'), a(11, 13, 15), a(12, 14, 16)],
  ];
  // the ten controls as one equal-cell grid (5.10 #574): 10 on a desktop row, 2 x 5 on a
  // phone; white resting text as the pills had - this canvas is dark in every theme
  const pill = (k, label, on, active) => ({ k, label, onClick: on, active: !!active, tone: '#FFF' });
  return (
    <div ref={wrapRef} style={{ background: '#0b0d10', position: 'relative' }}>
      {/* five a row (5.10 #556): ten in one row cut FULLSCREEN to "ULLSCREE" beside a clip */}
      <ChipGrid value={null} cols={5} phoneCols={5} style={{ marginBottom: 8 }}
        items={[
          pill('play', playing ? tt('PAUSE') : tt('PLAY'), () => setPlaying((v) => !v), playing),
          ...[0.25, 0.5, 1].map((s) => pill(`x${s}`, `${s}×`, () => setSpeed(s), speed === s)),
          pill('front', tt('FRONT'), () => view('front')),
          pill('side', tt('SIDE'), () => view('side')),
          pill('top', tt('TOP'), () => view('top')),
          pill('behind', tt('BEHIND'), () => view('behind')),
          pill('trails', tt('TRAILS'), () => setTrails((v) => !v), trails),
          pill('full', tt('FULL'), full),
        ]} />
      <div style={{ position: 'relative' }}>
        <div ref={hostRef} style={{ width: '100%', border: `1px solid ${C.cardBd}` }} />
        {/* the true 3D angles at this frame - left / right */}
        <div style={{ position: 'absolute', insetInlineStart: 8, top: 8, display: 'grid', gridTemplateColumns: 'auto auto auto', columnGap: 10, rowGap: 2, padding: '6px 8px', background: 'rgba(10,10,11,0.72)', fontFamily: FN, fontSize: 10, color: '#FFF', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
          <span /> <span style={{ color: '#39BDFF', fontWeight: 700 }}>{tt('L')}</span><span style={{ color: '#F5A524', fontWeight: 700 }}>{tt('R')}</span>
          {angles.map(([k, l, r]) => (<React.Fragment key={k}><span style={{ color: C.tm, letterSpacing: '0.1em' }}>{k}</span><span>{l == null ? '—' : `${l}°`}</span><span>{r == null ? '—' : `${r}°`}</span></React.Fragment>))}
        </div>
        <div style={{ position: 'absolute', insetInlineEnd: 8, bottom: 8, display: 'flex', gap: 10, fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: C.tm, pointerEvents: 'none' }}>
          {trails && <><span style={{ color: '#39BDFF' }}>━ {tt('HANDS')}</span><span style={{ color: '#F5A524' }}>━ {tt('HIPS')}</span></>}
        </div>
      </div>
      <input type="range" min={0} max={Math.max(0, poseFrames.length - 1)} value={idx} aria-label={tt('FRAME')}
        onChange={(e) => { const i = +e.target.value; setPlaying(false); setIdx(i); if (onSeek && poseFrames[i] && poseFrames[0]) onSeek(poseFrames[i].t - poseFrames[0].t); }}
        style={{ width: '100%', display: 'block', margin: '10px 0 0', accentColor: C.ac }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 6 }}>
        <span>{tt('FRAME')} {idx + 1} / {poseFrames.length}</span>
        <span>{tt('DRAG ORBIT · PINCH / WHEEL ZOOM')}</span>
      </div>
    </div>
  );
}
