// AnatomyViewer.jsx — real 3D layered anatomy in three.js, posed from a
// captured rep. Three peelable layers, ordered by anatomical depth:
//   SUPERFICIAL muscle → DEEP muscle → BONE skeleton.
// Each segment (limb, torso, neck, head) is a 3D mesh per layer; every frame
// the meshes are re-posed from the MediaPipe world landmarks, so the whole
// figure moves with the lift. Drag = orbit, wheel/pinch = zoom, play/scrub the
// rep, tap a layer to peel down to it.
//
// Honest scope: stylized volumetric anatomy (real 3D muscle/bone volumes), not
// individually-labeled named muscles — that's the licensed-atlas project.

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { C, FN } from './theme';
import { frameToPoints3D } from './poseLab';

// Limb segments [jointA, jointB, kind].
const SEGMENTS = [
  [11, 13, 'uarm'], [13, 15, 'farm'], [12, 14, 'uarm'], [14, 16, 'farm'],
  [23, 25, 'thigh'], [25, 27, 'shin'], [24, 26, 'thigh'], [26, 28, 'shin'],
  [15, 19, 'hand'], [16, 20, 'hand'], [27, 31, 'foot'], [28, 32, 'foot'],
];
// Base muscle radius (metres) per segment kind.
const RADIUS = { uarm: 0.052, farm: 0.04, thigh: 0.085, shin: 0.058, hand: 0.025, foot: 0.03, torso: 0.13, neck: 0.05 };
// Layers, outermost first. mul scales muscle radius; bone is a thin rod.
const LAYERS = [
  { id: 'superficial', label: 'SUPERFICIAL', color: 0xc25a50, mul: 1.0 },
  { id: 'deep', label: 'DEEP', color: 0x8f3a32, mul: 0.6 },
  { id: 'bone', label: 'BONE', color: 0xe9e3d2, bone: true },
];

// A fusiform (muscle-belly) unit mesh spanning y=0..1, radius bulging mid.
function fusiformGeometry() {
  const profile = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const t = i / N; profile.push(new THREE.Vector2(Math.sin(Math.PI * t) * 0.5 + 0.06, t)); }
  return new THREE.LatheGeometry(profile, 18);
}
// Bone unit rod y=0..1.
function boneGeometry() { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.translate(0, 0.5, 0); return g; }
function sphereGeometry() { return new THREE.SphereGeometry(1, 20, 16); }

const UP = new THREE.Vector3(0, 1, 0);

export default function AnatomyViewer({ frames }) {
  const mountRef = useRef(null);
  const poseFrames = useRef(frames.filter(f => f.worldLandmarks)).current;
  const [peel, setPeel] = useState(0);          // 0 superficial · 1 deep · 2 bone
  const [playing, setPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);

  const peelRef = useRef(0); const playRef = useRef(true); const frameRef = useRef(0);
  useEffect(() => { peelRef.current = peel; }, [peel]);
  useEffect(() => { playRef.current = playing; }, [playing]);
  useEffect(() => { frameRef.current = frameIdx; }, [frameIdx]);

  const engineRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !poseFrames.length) return;
    const W = mount.clientWidth || 340, H = 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0d);
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 50);
    camera.position.set(1.6, 0.2, 2.4);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 3, 2); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.5); rim.position.set(-2, 1, -2); scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0); controls.minDistance = 0.8; controls.maxDistance = 6;

    // build layer groups + reusable meshes
    const fGeo = fusiformGeometry(), bGeo = boneGeometry(), sGeo = sphereGeometry();
    const layerGroups = [];
    const meshEntries = []; // { layerIdx, mesh, a, b, r, kind } ; head entries use kind='head'
    LAYERS.forEach((L, li) => {
      const grp = new THREE.Group(); scene.add(grp); layerGroups.push(grp);
      const mat = new THREE.MeshStandardMaterial({ color: L.color, roughness: L.bone ? 0.5 : 0.75, metalness: 0.0, flatShading: false });
      const addSeg = (a, b, kind) => {
        const geo = L.bone ? bGeo : fGeo;
        const m = new THREE.Mesh(geo, mat); grp.add(m);
        meshEntries.push({ layerIdx: li, mesh: m, a, b, r: (L.bone ? RADIUS.bone || 0.02 : RADIUS[kind] * L.mul), kind });
      };
      SEGMENTS.forEach(([a, b, kind]) => addSeg(a, b, kind));
      addSeg('msHip', 'msSho', 'torso');  // torso
      addSeg('msSho', 0, 'neck');         // neck → nose
      // head sphere
      const head = new THREE.Mesh(sGeo, mat); grp.add(head);
      meshEntries.push({ layerIdx: li, mesh: head, kind: 'head' });
    });

    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), dir = new THREE.Vector3(), quat = new THREE.Quaternion();
    const pointAt = (pts, key) => {
      if (key === 'msHip') { const l = pts[23], r = pts[24]; return l && r ? new THREE.Vector3((l.x + r.x) / 2, (l.y + r.y) / 2, (l.z + r.z) / 2) : null; }
      if (key === 'msSho') { const l = pts[11], r = pts[12]; return l && r ? new THREE.Vector3((l.x + r.x) / 2, (l.y + r.y) / 2, (l.z + r.z) / 2) : null; }
      const p = pts[key]; return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
    };

    const applyPose = (fi) => {
      const fr = poseFrames[Math.min(fi, poseFrames.length - 1)];
      const pts = frameToPoints3D(fr.worldLandmarks);
      for (const e of meshEntries) {
        if (e.kind === 'head') {
          const nose = pointAt(pts, 0), msho = pointAt(pts, 'msSho');
          if (!nose) { e.mesh.visible = false; continue; }
          e.mesh.visible = true;
          const r = (LAYERS[e.layerIdx].bone ? 0.075 : 0.10 * (LAYERS[e.layerIdx].mul ?? 1));
          // place head slightly above nose toward crown
          const c = nose.clone(); if (msho) c.add(nose.clone().sub(msho).multiplyScalar(0.4));
          e.mesh.position.copy(c); e.mesh.scale.setScalar(r);
          continue;
        }
        const A = pointAt(pts, e.a), B = pointAt(pts, e.b);
        if (!A || !B) { e.mesh.visible = false; continue; }
        e.mesh.visible = true;
        tmpA.copy(A); tmpB.copy(B); dir.copy(tmpB).sub(tmpA);
        const len = dir.length() || 0.0001; dir.divideScalar(len);
        quat.setFromUnitVectors(UP, dir);
        e.mesh.position.copy(tmpA);
        e.mesh.quaternion.copy(quat);
        e.mesh.scale.set(e.r, len, e.r);
      }
    };

    const applyPeel = () => { layerGroups.forEach((g, li) => { g.visible = li >= peelRef.current; }); };

    let raf, last = performance.now(), acc = 0; const fps = 20;
    const loop = (now) => {
      acc += now - last; last = now;
      if (playRef.current && poseFrames.length > 1) {
        if (acc >= 1000 / fps) { acc = 0; const next = (frameRef.current + 1) % poseFrames.length; frameRef.current = next; setFrameIdx(next); }
      }
      applyPose(frameRef.current);
      applyPeel();
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => { const w = mount.clientWidth || W; renderer.setSize(w, H); camera.aspect = w / H; camera.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);

    engineRef.current = { applyPose };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose(); renderer.dispose();
      fGeo.dispose(); bGeo.dispose(); sGeo.dispose();
      try { mount.removeChild(renderer.domElement); } catch {}
    };
  }, [poseFrames]);

  if (!poseFrames.length) return <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: 20, fontFamily: 'inherit' }}>No 3D pose captured in that clip.</div>;
  const f = Math.min(frameIdx, poseFrames.length - 1);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        {LAYERS.map((L, li) => (
          <Pill key={L.id} active={peel === li} onClick={() => setPeel(li)}>{L.label}</Pill>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 8 }}>
        <Pill active={playing} onClick={() => setPlaying(p => !p)}>{playing ? '❚❚ PAUSE' : '▶ PLAY'}</Pill>
        <Pill onClick={() => setPeel(p => Math.min(LAYERS.length - 1, p + 1))}>PEEL ↓</Pill>
        <Pill onClick={() => setPeel(p => Math.max(0, p - 1))}>↑ ADD</Pill>
      </div>
      <div ref={mountRef} style={{ width: '100%', maxWidth: 340, height: 420, margin: '0 auto', background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', touchAction: 'none' }} />
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textAlign: 'center', marginTop: 6 }}>DRAG ORBIT · WHEEL / PINCH ZOOM · {LAYERS[peel].label} LAYER</div>
      <input type="range" min={0} max={poseFrames.length - 1} value={f} onChange={e => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
        style={{ width: '100%', maxWidth: 340, display: 'block', margin: '10px auto 0', accentColor: C.ac }} />
      <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>FRAME {f + 1} / {poseFrames.length}</div>
    </div>
  );
}

const Pill = ({ onClick, active, children }) => (
  <button onClick={onClick} style={{ padding: '6px 12px', background: active ? C.ac : 'transparent', color: '#FFF', border: `1px solid ${active ? C.ac : 'rgba(255,255,255,0.25)'}`, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 0 }}>{children}</button>
);
