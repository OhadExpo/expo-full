// ARFormOverlay.jsx — LIVE COACH. The single real-time camera tool: prop the
// phone side-on at a lifting athlete and MediaPipe Pose drives a clean live HUD
// plus on-feed coaching references. One tool, three live read-outs:
//   • REPS   — automatic count from a joint-angle state machine (the rep-counter
//              folded in here, so there's ONE live tool, not two).
//   • DEPTH  — for squat/hinge, a knee-height target line; the hip dot + the HUD
//              DEPTH chip go green the instant the hip crease hits depth.
//   • DRIFT  — a plumb line locked to the bar's top position with live forward/
//              back drift in cm.
// Feedback BEFORE the rep finishes — the gym-floor wow factor. No recommendations.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { C, FN } from './theme';
import { createPoseLandmarker, getCamera, stopStream } from './usePose';
import { detectChannels, ANGLE_DEFS, angleAt, isReal } from './repCounter';
import { GROUP_DEFS, groupAngleAt, titleLocksKind } from './poseLab';
import { createLiveSkeleton } from './LiveSkeleton3D';

const KIND_LABEL = { knee: 'KNEE', hip: 'HIP', elbow: 'ELBOW', sho: 'SHOULDER', none: 'HOLD' };

const SKEL = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 12],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];
// Depth gate tolerance (normalized frame height) — counts depth a touch above
// full parallel; the strict hip==knee gate read as "way too strict" (Ohad).
const DEPTH_TOL = 0.06;
const ACCENT = '#39BDFF';
const GREEN = '#46DC82';
const RED = '#FF5A5A';
// Down = the channel angle drops below `low`; Up = back above `high`. A full
// down-then-up cycle is one rep. Hysteresis kills jitter double-counts. Mirrors
// LiveRepCounter's table so counting behaves identically across the two paths.
const KIND_THRESHOLDS = {
  knee:  { low: 110, high: 160 },
  hip:   { low: 110, high: 165 },
  elbow: { low: 95,  high: 155 },
  sho:   { low: 50,  high: 130 },
  none:  null,
};

export default function ARFormOverlay({ exerciseTitle = 'Squat', facingMode = 'environment', onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const glCanvasRef = useRef(null);     // three.js 3D-skeleton overlay canvas
  const glSkelRef = useRef(null);       // createLiveSkeleton() handle
  const streamRef = useRef(null);
  const lmRef = useRef(null);
  const rafRef = useRef(null);
  const anchorRef = useRef(null);      // {x, topY} normalized bar-path anchor
  const angleBufRef = useRef([]);      // smoothing buffer for the rep state machine
  const phaseRef = useRef('top');      // 'top' | 'bottom'
  const depthRef = useRef(false);      // last depth state (so we only setState on flips)
  const showDepthRef = useRef(true);   // current depth-toggle, read by the running rAF loop

  const [phase, setPhase] = useState('idle'); // idle | loading | live
  const [error, setError] = useState(null);
  const [showDepth, setShowDepth] = useState(true);
  useEffect(() => { showDepthRef.current = showDepth; }, [showDepth]);
  const [showReps, setShowReps] = useState(true);   // toggle the REPS/PHASE read-out
  // Two MUTUALLY-EXCLUSIVE modes (Ohad: "view joints and skeleton separately,
  // only one on"): SKELETON = the 3D skeleton overlay; JOINTS = the flat 2D pose
  // (blue skeleton lines + joint-angle numbers, "like before the skeleton").
  // Turning one on turns the other off; both can be off. SKELETON is the default.
  const [showSkeleton, setShowSkeleton] = useState(true);
  const showSkeletonRef = useRef(true);
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);
  const [showAngles, setShowAngles] = useState(false);
  const showAnglesRef = useRef(false);
  useEffect(() => { showAnglesRef.current = showAngles; }, [showAngles]);
  const [skelMode, setSkelMode] = useState('lines'); // 'lines' fallback → 'model' once the GLB rig builds
  const skelModeRef = useRef('lines');
  const [reps, setReps] = useState(0);
  const [moving, setMoving] = useState('top');  // 'top' | 'bottom' — live rep phase
  const [atDepth, setAtDepth] = useState(false);
  const [depthReps, setDepthReps] = useState(0);   // count of reps that reached depth
  const repHitDepthRef = useRef(false);            // did the current rep reach depth?
  const [dir, setDir] = useState('iso');           // live movement direction: up | down | iso
  const dirRef = useRef('iso');
  const dirPendingRef = useRef({ dir: 'iso', count: 0 }); // debounce: a new dir must persist before the chip flips
  const smoothHistRef = useRef([]);                // recent smoothed angles (for direction)
  // 'environment' = rear (coach films the athlete) · 'user' = front (athlete
  // self-films and watches the HUD while lifting). Switchable live.
  const [facing, setFacing] = useState(facingMode);
  const facingRef = useRef(facingMode);
  useEffect(() => { facingRef.current = facing; }, [facing]);

  // Auto-detect the working joint. Unless the exercise NAME pins a movement, the
  // rep machine locks onto whichever joint group is actually moving the most over
  // a rolling ROM window — so the coach doesn't have to type anything. A typed
  // name is the override.
  const titleLocked = titleLocksKind(exerciseTitle);
  const lockedKind = detectChannels(exerciseTitle).kind;
  const [activeKind, setActiveKind] = useState(titleLocked ? lockedKind : 'knee');
  const activeKindRef = useRef(activeKind);
  useEffect(() => { activeKindRef.current = activeKind; }, [activeKind]);
  const romBufRef = useRef({ knee: [], hip: [], elbow: [], sho: [] });
  const thr = KIND_THRESHOLDS[activeKind];
  const depthRelevant = activeKind === 'knee' || activeKind === 'hip';

  // Set up / tear down the three.js 3D-skeleton overlay once its canvas mounts.
  useEffect(() => {
    if (glCanvasRef.current && !glSkelRef.current) {
      try { glSkelRef.current = createLiveSkeleton(glCanvasRef.current); } catch (e) { console.warn('3D skeleton init failed', e); }
    }
    const onResize = () => glSkelRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); try { glSkelRef.current?.dispose(); } catch { /* noop */ } glSkelRef.current = null; };
  }, []);

  const loop = useCallback(() => {
    const v = videoRef.current, lm = lmRef.current;
    if (!v || !lm || v.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return; }
    let res = null;
    try { res = lm.detectForVideo(v, performance.now()); } catch { res = null; }
    const landmarks = res?.landmarks?.[0] || null;
    const world = res?.worldLandmarks?.[0] || null;

    // --- auto-detect the working joint, then run the rep machine on it ---
    if (world) {
      // active group = locked by the typed name, or the biggest-ROM group over a
      // rolling window (settles onto the real mover a few frames into the set).
      let active = activeKindRef.current;
      if (titleLocked) {
        active = lockedKind;
      } else {
        let bestRange = 22, best = null;
        for (const g of GROUP_DEFS) {
          const a = groupAngleAt(world, g.channels);
          if (a == null) continue;
          const rb = romBufRef.current[g.kind]; rb.push(a); if (rb.length > 45) rb.shift();
          if (rb.length >= 12) { const range = Math.max(...rb) - Math.min(...rb); if (range > bestRange) { bestRange = range; best = g.kind; } }
        }
        if (best) active = best;
      }
      if (active !== activeKindRef.current) {
        // switched movement → reset the rep state so a half-cycle doesn't miscount
        activeKindRef.current = active; setActiveKind(active);
        angleBufRef.current = []; smoothHistRef.current = []; phaseRef.current = 'top';
      }
      const aThr = KIND_THRESHOLDS[active];
      const grp = GROUP_DEFS.find(g => g.kind === active);
      const cur = grp ? groupAngleAt(world, grp.channels) : null;
      if (aThr && cur != null) {
        const buf = angleBufRef.current; buf.push(cur); if (buf.length > 8) buf.shift();
        const sorted = [...buf].sort((a, b) => a - b);
        const smooth = sorted[Math.floor(sorted.length / 2)];
        // PHASE chip = live direction (flex=DOWN, extend=UP, stable=ISO). Heavily
        // debounced so it reads clean, not flickery (Ohad: "too messy, lag it a
        // quarter second"): velocity over a ~10-frame window with a wider ISO
        // deadband, AND the candidate direction must PERSIST ~6 frames (~0.25s)
        // before the chip actually flips.
        const sh = smoothHistRef.current; sh.push(smooth); if (sh.length > 10) sh.shift();
        if (sh.length >= 6) {
          const vel = smooth - sh[0];
          const cand = Math.abs(vel) < 7 ? 'iso' : (vel < 0 ? 'down' : 'up');
          const pd = dirPendingRef.current;
          if (cand === dirRef.current) { pd.dir = cand; pd.count = 0; }
          else if (cand === pd.dir) { if (++pd.count >= 6) { dirRef.current = cand; setDir(cand); pd.count = 0; } }
          else { pd.dir = cand; pd.count = 1; }
        }
        if (phaseRef.current === 'top' && smooth < aThr.low) { phaseRef.current = 'bottom'; setMoving('bottom'); }
        else if (phaseRef.current === 'bottom' && smooth > aThr.high) {
          phaseRef.current = 'top'; setMoving('top'); setReps(r => r + 1);
          if (repHitDepthRef.current) setDepthReps(n => n + 1);   // this rep reached depth → count it
          repHitDepthRef.current = false;
        }
      }
    }

    // --- depth: live at/below-parallel flag + per-rep depth-hit (for the count).
    // DEPTH_TOL loosens the "full parallel" gate (was too strict — counts depth a
    // touch above parallel). Detection runs whenever depth is relevant; the toggle
    // only hides the display, not the count.
    const depthRel = activeKindRef.current === 'knee' || activeKindRef.current === 'hip';
    if (depthRel && landmarks) {
      const hip = midpt(landmarks[23], landmarks[24]);
      const knee = midpt(landmarks[25], landmarks[26]);
      const d = !!(hip && knee && hip.y >= knee.y - DEPTH_TOL);
      if (d !== depthRef.current) { depthRef.current = d; setAtDepth(d); }
      if (d && phaseRef.current === 'bottom') repHitDepthRef.current = true;
    }

    // 3D skeleton (three.js overlay) when SKELETON is on; the 2D layer keeps the
    // angle labels + depth/bar-path, so its flat skeleton lines are turned off.
    if (glSkelRef.current) {
      glSkelRef.current.update(showSkeletonRef.current ? landmarks : null, world, false);
      if (skelModeRef.current !== 'model' && glSkelRef.current.usingGlb) { skelModeRef.current = 'model'; setSkelMode('model'); }
    }
    // JOINTS mode draws the full 2D pose (blue skeleton lines + angle numbers);
    // SKELETON mode leaves the 2D layer clean and shows only the 3D overlay above.
    draw(canvasRef.current, v, landmarks, world, anchorRef, { depth: showDepthRef.current && depthRel, skeleton: showAnglesRef.current, angles: showAnglesRef.current });
    rafRef.current = requestAnimationFrame(loop);
  }, [titleLocked, lockedKind]);

  const start = useCallback(async () => {
    setError(null); setPhase('loading');
    try {
      if (!streamRef.current) {
        const s = await getCamera(facingRef.current);
        streamRef.current = s;
        const v = videoRef.current; if (v) { v.srcObject = s; await v.play(); }
      }
      if (!lmRef.current) lmRef.current = await createPoseLandmarker({ runningMode: 'VIDEO', quality: 'lite' });
      anchorRef.current = null; angleBufRef.current = []; phaseRef.current = 'top';
      setReps(0); setMoving('top');
      setPhase('live');
      requestAnimationFrame(() => glSkelRef.current?.resize());   // canvas is laid out now
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) { setPhase('idle'); setError(e?.message || 'Could not start the camera.'); }
  }, [loop]);

  // Swap front/rear without tearing down the pose engine. Re-lock the bar since
  // the viewpoint changed. NOT mirrored — mirroring would invert left/right so
  // the bar-drift cue would point the wrong way.
  const flipCamera = useCallback(async () => {
    const next = facingRef.current === 'environment' ? 'user' : 'environment';
    setFacing(next);
    try {
      stopStream(streamRef.current); streamRef.current = null;
      const s = await getCamera(next); streamRef.current = s;
      const v = videoRef.current; if (v) { v.srcObject = s; await v.play(); }
      anchorRef.current = null;
    } catch (e) { setError(e?.message || 'Could not switch camera.'); }
  }, []);

  const reanchor = useCallback(() => { anchorRef.current = null; }, []);
  const resetReps = useCallback(() => { setReps(0); setDepthReps(0); repHitDepthRef.current = false; phaseRef.current = 'top'; setMoving('top'); angleBufRef.current = []; }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopStream(streamRef.current);
    try { lmRef.current?.close(); } catch { /* noop */ }
  }, []);

  const countable = !!thr;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 700 }}>
          LIVE COACH · {titleLocked ? String(exerciseTitle).toUpperCase() : `AUTO · ${KIND_LABEL[activeKind] || ''}`}
        </div>
        <button onClick={onClose} style={hdrBtn}>← BACK</button>
      </div>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* 3D skeleton (three.js) sits ABOVE the video, BELOW the 2D HUD canvas so
            the angle labels stay readable on top of the bones. */}
        <canvas ref={glCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

        {/* LIVE HUD — the read-outs, in legible mono. Sits top-centre, out of the
            way of a side-on full-body frame. */}
        {phase === 'live' && (
          <div style={{ position: 'absolute', top: 46, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <style>{'@keyframes rtpop{0%{transform:scale(1)}30%{transform:scale(1.28)}100%{transform:scale(1)}}'}</style>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 1, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(2px)' }}>
              {countable && showReps && <HudCell label="REPS" value={String(reps)} pop tone={ACCENT} />}
              {countable && showReps && <HudCell label="PHASE" value={dir === 'down' ? 'DOWN' : dir === 'up' ? 'UP' : 'ISO'} tone={dir === 'down' ? '#FFFFFF' : dir === 'up' ? ACCENT : 'rgba(255,255,255,0.6)'} />}
              {depthRelevant && showDepth && <HudCell label="DEPTH" value={`${depthReps}/${reps}`} tone={atDepth ? GREEN : 'rgba(255,255,255,0.7)'} />}
            </div>
          </div>
        )}

        {phase === 'idle' && !error && (
          <Centre>
            <div style={{ fontSize: 52 }}>🎯</div>
            <div style={{ fontSize: 14, letterSpacing: '0.18em', fontWeight: 700, marginTop: 12 }}>LIVE COACH</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 380, lineHeight: 1.6, marginTop: 10 }}>
              Prop the phone side-on, full body in frame. You get a live{countable ? ' rep count' : ' skeleton'}{depthRelevant ? ', a depth target at the knees,' : ''} and a plumb line locked to the bar so you can see drift — all in real time, before the rep ends.
            </div>
          </Centre>
        )}
        {phase === 'loading' && <Centre><Spinner /><div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700, marginTop: 14 }}>STARTING CAMERA + POSE…</div></Centre>}
        {error && <Centre><div style={{ fontSize: 32 }}>⚠</div><div style={{ fontSize: 13, color: C.rd, marginTop: 10, maxWidth: 320 }}>{error}</div></Centre>}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.92)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onClose} style={{ ...ctrl, minWidth: 96 }}>← BACK</button>
        {phase !== 'live'
          ? <>
              <Big color={C.ac} onClick={start} disabled={phase === 'loading'}>{phase === 'loading' ? 'STARTING…' : 'START →'}</Big>
              <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')} style={{ ...ctrl, minWidth: 120 }}>⟲ {facing === 'user' ? 'FRONT' : 'REAR'} CAM</button>
            </>
          : <>
              {countable && <button onClick={resetReps} style={{ ...ctrl, minWidth: 104 }}>⟲ RESET REPS</button>}
              <button onClick={reanchor} style={{ ...ctrl, minWidth: 112 }}>⟲ RE-LOCK BAR</button>
              <button onClick={flipCamera} style={{ ...ctrl, minWidth: 104 }}>⟲ {facing === 'user' ? 'FRONT' : 'REAR'}</button>
              {countable && <button onClick={() => setShowReps(s => !s)} style={{ ...ctrl, background: showReps ? C.ac : 'transparent', minWidth: 100 }}>REPS {showReps ? 'ON' : 'OFF'}</button>}
              {depthRelevant && <button onClick={() => setShowDepth(s => !s)} style={{ ...ctrl, background: showDepth ? C.ac : 'transparent', minWidth: 104 }}>DEPTH {showDepth ? 'ON' : 'OFF'}</button>}
              <button onClick={() => setShowSkeleton(s => { const n = !s; if (n) setShowAngles(false); return n; })} style={{ ...ctrl, background: showSkeleton ? C.ac : 'transparent', minWidth: 150 }}>SKELETON {showSkeleton ? 'ON' : 'OFF'}{showSkeleton ? ` · ${skelMode === 'model' ? '3D MODEL' : 'LINES'}` : ''}</button>
              <button onClick={() => setShowAngles(s => { const n = !s; if (n) setShowSkeleton(false); return n; })} style={{ ...ctrl, background: showAngles ? C.ac : 'transparent', minWidth: 104 }}>JOINTS {showAngles ? 'ON' : 'OFF'}</button>
            </>}
      </div>
    </div>
  );
}

function HudCell({ label, value, big, tone, pop }) {
  return (
    <div style={{ minWidth: big ? 88 : 70, padding: big ? '8px 14px' : '8px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: FN, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.55)', marginBottom: 3 }}>{label}</div>
      {/* key=value remounts the node each rep so the pop animation replays */}
      <div key={pop ? value : undefined} style={{ fontFamily: FN, fontWeight: 700, lineHeight: 1, fontSize: big ? 38 : 18, color: tone, animation: pop ? 'rtpop .35s ease' : undefined }}>{value}</div>
    </div>
  );
}

function draw(canvas, video, landmarks, world, anchorRef, { depth, skeleton, angles }) {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  // skeleton
  // Stroke scaled to the canvas — a fixed 3px line on a 1280px-wide native canvas
  // renders sub-pixel when the feed is shown small, so the skeleton "vanished"
  // while the scaled angle labels stayed visible (Ohad: "I see angles, no skeleton").
  const skW = Math.max(4, Math.round(w * 0.006));
  if (skeleton) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // dark underlay for contrast on bright/busy backgrounds
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = skW + 3;
    SKEL.forEach(([a, b]) => { const la = landmarks[a], lb = landmarks[b]; if (!la || !lb) return; ctx.beginPath(); ctx.moveTo(la.x * w, la.y * h); ctx.lineTo(lb.x * w, lb.y * h); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(57,189,255,0.95)'; ctx.lineWidth = skW;
    SKEL.forEach(([a, b]) => { const la = landmarks[a], lb = landmarks[b]; if (!la || !lb) return; ctx.beginPath(); ctx.moveTo(la.x * w, la.y * h); ctx.lineTo(lb.x * w, lb.y * h); ctx.stroke(); });
    // joint dots so the joints read clearly
    ctx.fillStyle = '#FFFFFF';
    for (const j of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) { const p = landmarks[j]; if (!p) continue; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, skW * 0.85, 0, Math.PI * 2); ctx.fill(); }
  }

  const wristMid = midpt(landmarks[15], landmarks[16]);
  const hipMid = midpt(landmarks[23], landmarks[24]);
  const kneeMid = midpt(landmarks[25], landmarks[26]);

  // Live joint angles — computed from the 3D world landmarks (perspective-free)
  // and drawn at each joint's screen position (Ohad: live angles under Live
  // Coach). The tool is side-on, so L/R overlap → one label per joint group at
  // the mid point, averaging the two sides.
  if (world && angles) {
    const fs = Math.max(16, Math.round(w * 0.022));
    const groups = [
      ['L SHO', 'R SHO', midpt(landmarks[11], landmarks[12])],
      ['L ELB', 'R ELB', midpt(landmarks[13], landmarks[14])],
      ['L HIP', 'R HIP', hipMid],
      ['L KNE', 'R KNE', kneeMid],
    ];
    for (const [ln, rn, mid] of groups) {
      if (!mid) continue;
      const dl = ANGLE_DEFS.find(d => d.name === ln), dr = ANGLE_DEFS.find(d => d.name === rn);
      const vals = [dl && angleAt(world, dl.a, dl.b, dl.c), dr && angleAt(world, dr.a, dr.b, dr.c)].filter(isReal);
      if (!vals.length) continue;
      const deg = Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
      label(ctx, `${deg}°`, mid.x * w + fs * 0.6, mid.y * h, ACCENT, fs);
    }
  }

  // bar-path plumb line — lock the anchor to the bar's x at the highest point
  // seen so far (rack/standing), then show live drift from it.
  if (wristMid) {
    if (anchorRef.current == null) anchorRef.current = { x: wristMid.x, topY: wristMid.y };
    if (wristMid.y < anchorRef.current.topY) { anchorRef.current = { x: wristMid.x, topY: wristMid.y }; }
    const ax = anchorRef.current.x * w;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, h); ctx.stroke(); ctx.setLineDash([]);
    const driftPx = (wristMid.x - anchorRef.current.x) * w;
    const driftCm = Math.round(Math.abs((wristMid.x - anchorRef.current.x)) * estimateBodyWidthCm(landmarks));
    const off = Math.abs(driftPx) > 0.04 * w;
    ctx.fillStyle = off ? RED : ACCENT;
    ctx.beginPath(); ctx.arc(wristMid.x * w, wristMid.y * h, 9, 0, Math.PI * 2); ctx.fill();
    label(ctx, `${driftCm} cm`, wristMid.x * w + 14, wristMid.y * h - 10, off ? RED : ACCENT);
  }

  // depth target — horizontal line at knee height; hips green when at/below it
  if (depth && kneeMid && hipMid) {
    const ky = kneeMid.y * h;
    const atDepth = hipMid.y >= kneeMid.y; // hip crease at/below knee (lower in image = larger y)
    ctx.strokeStyle = atDepth ? 'rgba(70,220,130,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, ky); ctx.lineTo(w, ky); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = atDepth ? GREEN : 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(hipMid.x * w, hipMid.y * h, 9, 0, Math.PI * 2); ctx.fill();
    // (removed the full-feed green frame at depth — Ohad found it distracting)
  }
}

function label(ctx, text, x, y, color, size = 16) {
  ctx.font = `700 ${size}px ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
const midpt = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);
// Rough px→cm using shoulder width as a ~40cm ruler. Approximate by design —
// the drift indicator is a coaching cue, not a measurement.
function estimateBodyWidthCm(lms) {
  const ls = lms[11], rs = lms[12];
  if (!ls || !rs) return 100;
  const shoulderNorm = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  return shoulderNorm > 0 ? 40 / shoulderNorm : 100;
}

const Centre = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FN, textAlign: 'center', padding: 20 }}>{children}</div>
);
const Spinner = () => (
  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.16)', borderTopColor: ACCENT, animation: 'rtspin .7s linear infinite' }}>
    <style>{'@keyframes rtspin{to{transform:rotate(360deg)}}'}</style>
  </div>
);
const hdrBtn = { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF', padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' };
const ctrl = { padding: '12px 14px', background: 'transparent', color: '#FFF', border: '1px solid rgba(255,255,255,0.3)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const Big = ({ color, onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#FFF', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.16em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>{children}</button>
);
