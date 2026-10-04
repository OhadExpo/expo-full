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
import { frameToPoints3D, stabilizeWorldFrames, OVERLAY_BONES, lmVisible } from './poseLab';
import { C, FN } from './theme';
import { useT } from './i18n';
import { ChipGrid } from './ui';

const ACCENT = 0x39bdff, HIP_TRAIL = 0xf5a524, BODY = 0xe8eef5;
// a thicker capsule for the trunk and thighs than for the forearms
const BONE_R = (a, b) => ([11, 12, 23, 24].includes(a) && [11, 12, 23, 24].includes(b)) ? 0.055 : ([23, 24].includes(a) || [25, 26].includes(a)) ? 0.05 : 0.035;
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

export default function Replay3D({ frames, playheadT = null, onUnsupported }) {
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

    scene.add(new THREE.HemisphereLight(0xdfefff, 0x1a1d22, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
    scene.add(key);

    // the floor: a grid on a plane that takes the body's shadow
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.35 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = floorY; plane.receiveShadow = true; scene.add(plane);
    const grid = new THREE.GridHelper(6, 24, 0x2a3a4a, 0x1a242e); grid.position.y = floorY + 0.001; scene.add(grid);

    const bodyMat = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.55, metalness: 0.05 });
    const jointMat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.4, emissive: 0x0a2a3a });
    const bones = OVERLAY_BONES.map(([a, b]) => {
      const r = BONE_R(a, b);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 6, 12), bodyMat);
      m.castShadow = true; scene.add(m); return { a, b, r, m };
    });
    const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    const joints = JOINTS.map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), jointMat); m.castShadow = true; scene.add(m); return { k, m }; });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), bodyMat); head.castShadow = true; scene.add(head);

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
    const pose = (i) => {
      const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
      for (const o of bones) {
        const A = p && p[o.a], B = p && p[o.b];
        if (!lmVisible(A) || !lmVisible(B)) { o.m.visible = false; continue; }
        const a = new THREE.Vector3(A.x, A.y, A.z), b = new THREE.Vector3(B.x, B.y, B.z);
        const len = a.distanceTo(b); if (len < 1e-4) { o.m.visible = false; continue; }
        o.m.visible = true;
        o.m.position.copy(a).add(b).multiplyScalar(0.5);
        o.m.scale.set(1, Math.max(0.01, len - 2 * o.r) / 1, 1);
        q.setFromUnitVectors(up, tmp.copy(b).sub(a).normalize()); o.m.quaternion.copy(q);
      }
      for (const j of joints) { const P = p && p[j.k]; j.m.visible = lmVisible(P); if (j.m.visible) j.m.position.set(P.x, P.y, P.z); }
      // the head from the face, never from the shoulder line (poseLab's rule)
      const face = [0, 7, 8].map((k) => p && p[k]).filter((P) => lmVisible(P));
      head.visible = face.length > 0;
      if (head.visible) head.position.set(face.reduce((s, P) => s + P.x, 0) / face.length, face.reduce((s, P) => s + P.y, 0) / face.length + 0.02, face.reduce((s, P) => s + P.z, 0) / face.length);
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
          <span /> <span style={{ color: C.tm }}>{tt('L')}</span><span style={{ color: C.tm }}>{tt('R')}</span>
          {angles.map(([k, l, r]) => (<React.Fragment key={k}><span style={{ color: C.tm, letterSpacing: '0.1em' }}>{k}</span><span>{l == null ? '—' : `${l}°`}</span><span>{r == null ? '—' : `${r}°`}</span></React.Fragment>))}
        </div>
        <div style={{ position: 'absolute', insetInlineEnd: 8, bottom: 8, display: 'flex', gap: 10, fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: C.tm, pointerEvents: 'none' }}>
          {trails && <><span style={{ color: '#39BDFF' }}>━ {tt('HANDS')}</span><span style={{ color: '#F5A524' }}>━ {tt('HIPS')}</span></>}
        </div>
      </div>
      <input type="range" min={0} max={Math.max(0, poseFrames.length - 1)} value={idx} aria-label={tt('FRAME')}
        onChange={(e) => { setPlaying(false); setIdx(+e.target.value); }}
        style={{ width: '100%', display: 'block', margin: '10px 0 0', accentColor: C.ac }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FN, fontSize: 10, color: C.tm, marginTop: 6 }}>
        <span>{tt('FRAME')} {idx + 1} / {poseFrames.length}</span>
        <span>{tt('DRAG ORBIT · PINCH / WHEEL ZOOM')}</span>
      </div>
    </div>
  );
}
