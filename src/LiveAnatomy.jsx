// THE ANATOMY BODY, LIVE (#690, 13.10): the same skeleton / muscle body as the replays, beside a live camera. MediaPipe's
// readings come in a buffer; every half second the body's track is rebuilt from the last 12 s through the SAME pipeline
// as a recorded clip (lift onto the picture -> rig), and the body plays 0.7 s behind live - far enough that the curve has
// the frames on both sides of the moment it shows. A rebuilt track hands over with a 0.3 s cross-fade: measured on the
// corpus (scripts/anatomy/_live.tmp.mjs) a new 12 s window moves the hips ~1-2 cm and a limb ~7-14 degrees, which a snap
// shows and a fade does not. The body loads once; nothing here rebuilds the scene.
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { frameToPoints3D } from './poseLab';
import { buildTrack, modelAngles, S as SEG } from './anatomy/rig';
import { anatomyFrames } from './anatomy/lift2d';
import { createAnatomyBody } from './anatomy/AnatomyBody';
import { useT } from './i18n';
import { FN } from './theme';
import AngleNum, { AngleHead } from './AngleNum';

const WINDOW_MS = 12000, REBUILD_MS = 500, DELAY_MS = 700, FADE_MS = 300;

// getFrames(): the live buffer, oldest first - [{ t (ms, performance.now() clock), landmarks, worldLandmarks }];
// dims: the camera picture's { w, h }
export default function LiveAnatomy({ getFrames, dims, height = 360, exercise = '' }) {
  // the logged exercise, read live by the loop below (a ref: the loop is not restarted when it changes)
  const exRef = useRef(exercise); exRef.current = exercise;
  const tt = useT();
  const hostRef = useRef(null);
  const [state, setState] = useState('loading');   // loading | waiting | live | error
  const [angles, setAngles] = useState(null);
  const dimsRef = useRef(dims); dimsRef.current = dims;
  const getRef = useRef(getFrames); getRef.current = getFrames;

  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    let alive = true, raf = 0, body = null, cur = null, prev = null, switchedAt = 0, lastBuild = 0, lastAngles = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement); renderer.domElement.style.display = 'block'; renderer.domElement.style.touchAction = 'none';
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0d10);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex; scene.environmentIntensity = 0.45;
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x141820, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2.5, 4, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fc7ff, 0.45); fill.position.set(-3, 2, 1.5); scene.add(fill);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), new THREE.MeshStandardMaterial({ color: 0x161d25, roughness: 0.95, envMapIntensity: 0.12 }));
    disc.rotation.x = -Math.PI / 2; scene.add(disc);
    const grid = new THREE.GridHelper(6, 24, 0x2a3a4a, 0x1a242e); scene.add(grid);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.2; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.495;
    camera.position.set(2.3, 0.75, 0.45); controls.target.set(0, 0.15, 0); controls.update();
    const size = () => { const w = host.clientWidth || 320; renderer.setSize(w, height); camera.aspect = w / height; camera.updateProjectionMatrix(); };
    size(); const ro = new ResizeObserver(size); ro.observe(host);
    let floorY = 0, framed = false;
    const tgt = new THREE.Vector3();

    createAnatomyBody().then((b) => {
      if (!alive) { b.dispose(); return; }
      body = b; body.setLayers({ bones: true, muscles: true, muscleOpacity: 0.35 }); scene.add(b.group); setState('waiting');
    }).catch(() => { if (alive) setState('error'); });

    const rebuild = (now) => {
      const all = getRef.current ? getRef.current() : null, d = dimsRef.current;
      if (!all || !d || !(d.w > 0)) return;
      const fr = all.filter((f) => f && f.t > now - WINDOW_MS && f.landmarks && f.worldLandmarks);
      if (fr.length < 12) return;
      try {
        const st = anatomyFrames(fr, d);
        const tr = st.length >= 10 ? buildTrack(st.map((x) => ({ t: x.t, pts: frameToPoints3D(x.worldLandmarks), img: x.landmarks })), { dims: d, exercise: exRef.current }) : null;
        if (!tr) return;
        prev = cur; cur = tr; switchedAt = now; body.setTrack(tr);
        if (!framed) { framed = true; setState('live'); }
      } catch (e) { console.warn('live anatomy', e); }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (body && now - lastBuild >= REBUILD_MS) { lastBuild = now; rebuild(now); }
      if (body && cur) {
        const t = Math.min(cur.t1, now - DELAY_MS), w = Math.min(1, (now - switchedAt) / FADE_MS);
        body.setTimeBlend(prev, t, w);
        // the floor and the camera follow him smoothly - each rebuilt window has its own floor estimate
        floorY += ((cur.floor || 0) - floorY) * 0.08; disc.position.y = floorY - 0.002; grid.position.y = floorY + 0.001;
        const hip = body.jointWorld(SEG.pelvis); tgt.set(hip.x, hip.y + 0.15, hip.z);
        const dlt = tgt.clone().sub(controls.target).multiplyScalar(0.06); controls.target.add(dlt); camera.position.add(dlt);
        // a harness can trace the hips each frame (audit-out: the smoothness of a live handover) - inert unless set
        if (typeof window !== 'undefined' && Array.isArray(window.__liveAnatTrace)) window.__liveAnatTrace.push([now, hip.x, hip.y, hip.z, w, switchedAt]);
        if (now - lastAngles > 250) { lastAngles = now; const a = modelAngles(cur, t); setAngles(a && cur.inView(t) ? a : null); }
      }
      controls.update(); renderer.render(scene, camera);
    };
    loop();
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      if (body) { body.dispose(); body = null; }
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      envTex.dispose(); pmrem.dispose(); room.dispose();
      renderer.forceContextLoss(); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [height]);

  // every value one width, L / R centred over it (13.10 #723)
  const v = (k) => { const a = angles && angles[k]; return <AngleNum v={a && a.v != null ? a.v : null} seen={!a || a.seen !== false} style={{ justifySelf: 'center', color: a && a.seen === false ? '#6b7480' : '#FFF' }} />; };
  return (
    <div style={{ position: 'relative', background: '#0b0d10' }}>
      <div ref={hostRef} style={{ width: '100%' }} />
      {state !== 'live' && (
        <div style={{ position: 'absolute', left: 8, top: 8, padding: '5px 8px', background: 'rgba(10,10,11,0.72)', fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', color: state === 'error' ? '#F5A524' : '#8a939e', pointerEvents: 'none' }}>
          {state === 'error' ? tt('Could not load the anatomy model.') : state === 'loading' ? tt('LOADING ANATOMY…') : tt('NOT IN VIEW')}
        </div>
      )}
      {state === 'live' && (
        <div dir="ltr" style={{ position: 'absolute', left: 8, top: 8, display: 'grid', gridTemplateColumns: 'auto auto auto', columnGap: 10, rowGap: 2, padding: '5px 8px', background: 'rgba(10,10,11,0.72)', fontFamily: FN, fontSize: 10, color: '#FFF', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
          <span /> <AngleHead style={{ color: '#39BDFF', fontWeight: 700, justifySelf: 'center' }}>{tt('L')}</AngleHead><AngleHead style={{ color: '#F5A524', fontWeight: 700, justifySelf: 'center' }}>{tt('R')}</AngleHead>
          {[['KNEE', 'kneeL', 'kneeR'], ['HIP', 'hipL', 'hipR'], ['ELBOW', 'elbowL', 'elbowR']].map(([k, l, r]) => (
            <React.Fragment key={k}><span style={{ color: '#8a939e', letterSpacing: '0.1em' }}>{tt(k)}</span>{v(l)}{v(r)}</React.Fragment>
          ))}
          <span style={{ color: '#8a939e', letterSpacing: '0.1em' }}>{tt('TRUNK')}</span>{v('trunk')}<span />
        </div>
      )}
      <div style={{ position: 'absolute', insetInlineEnd: 8, bottom: 6, fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: '#5c636e', pointerEvents: 'none' }} dir="ltr">{tt('0.7 S BEHIND LIVE')} · Z-ANATOMY · CC BY-SA</div>
    </div>
  );
}
