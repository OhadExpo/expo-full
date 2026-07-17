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
import { createPortal } from 'react-dom';
import { C, FN } from './theme';
import { createPoseLandmarker, getCamera, stopStream } from './usePose';
import { detectChannels, ANGLE_DEFS, angleAt, isReal } from './repCounter';

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
  // One toggle drives BOTH the skeleton and the joint-angle numbers (Ohad: "both
  // together as one button").
  const [showSkeleton, setShowSkeleton] = useState(true);
  const showSkeletonRef = useRef(true);
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);
  const [reps, setReps] = useState(0);
  const [moving, setMoving] = useState('top');  // 'top' | 'bottom' — live rep phase
  const [atDepth, setAtDepth] = useState(false);
  const [depthReps, setDepthReps] = useState(0);   // count of reps that reached depth
  const repHitDepthRef = useRef(false);            // did the current rep reach depth?
  const [dir, setDir] = useState('iso');           // live movement direction: up | down | iso
  const dirRef = useRef('iso');
  const smoothHistRef = useRef([]);                // recent smoothed angles (for direction)
  // 'environment' = rear (coach films the athlete) · 'user' = front (athlete
  // self-films and watches the HUD while lifting). Switchable live.
  const [facing, setFacing] = useState(facingMode);
  const facingRef = useRef(facingMode);
  useEffect(() => { facingRef.current = facing; }, [facing]);

  const { kind, channels } = detectChannels(exerciseTitle);
  const thr = KIND_THRESHOLDS[kind];
  const depthRelevant = kind === 'knee' || kind === 'hip';

  const loop = useCallback(() => {
    const v = videoRef.current, lm = lmRef.current;
    if (!v || !lm || v.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return; }
    let res = null;
    try { res = lm.detectForVideo(v, performance.now()); } catch { res = null; }
    const landmarks = res?.landmarks?.[0] || null;
    const world = res?.worldLandmarks?.[0] || null;

    // --- live rep state machine (world landmarks → joint angle) ---
    if (world && thr && channels.length) {
      const angs = channels.map(name => {
        const def = ANGLE_DEFS.find(a => a.name === name);
        return def ? angleAt(world, def.a, def.b, def.c) : null;
      }).filter(isReal);
      if (angs.length) {
        const avg = angs.reduce((a, b) => a + b, 0) / angs.length;
        const buf = angleBufRef.current; buf.push(avg); if (buf.length > 8) buf.shift();
        const sorted = [...buf].sort((a, b) => a - b);
        const smooth = sorted[Math.floor(sorted.length / 2)];
        // PHASE chip = live direction: angle flexing (decreasing) = DOWN,
        // extending (increasing) = UP, ~stable = ISO (a hold/pause).
        // Direction over a short window (not frame-to-frame) so the chip doesn't
        // flicker up/down/iso on noise — the change must clear ISO_DEG over ~6 frames.
        const sh = smoothHistRef.current; sh.push(smooth); if (sh.length > 6) sh.shift();
        if (sh.length >= 4) {
          const vel = smooth - sh[0];
          const nd = Math.abs(vel) < 5 ? 'iso' : (vel < 0 ? 'down' : 'up');
          if (nd !== dirRef.current) { dirRef.current = nd; setDir(nd); }
        }
        if (phaseRef.current === 'top' && smooth < thr.low) { phaseRef.current = 'bottom'; setMoving('bottom'); }
        else if (phaseRef.current === 'bottom' && smooth > thr.high) {
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
    if (depthRelevant && landmarks) {
      const hip = midpt(landmarks[23], landmarks[24]);
      const knee = midpt(landmarks[25], landmarks[26]);
      const d = !!(hip && knee && hip.y >= knee.y - DEPTH_TOL);
      if (d !== depthRef.current) { depthRef.current = d; setAtDepth(d); }
      if (d && phaseRef.current === 'bottom') repHitDepthRef.current = true;
    }

    draw(canvasRef.current, v, landmarks, world, anchorRef, { depth: showDepthRef.current && depthRelevant, skeleton: showSkeletonRef.current, angles: showSkeletonRef.current });
    rafRef.current = requestAnimationFrame(loop);
  }, [depthRelevant, thr, channels]);

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
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      // Release the camera if it opened but pose init/play then failed — else
      // the LED stays on behind the error screen (no stop control here).
      if (streamRef.current) { stopStream(streamRef.current); streamRef.current = null; }
      setPhase('idle'); setError(e?.message || 'Could not start the camera.');
    }
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

  // Portal to <body>: this position:fixed overlay is rendered inside Review-Tools'
  // `.motion-rise` wrapper, whose CSS transform pins a fixed child to that box
  // (~1176x503) instead of the viewport — so the feed renders letterboxed. The
  // body portal escapes the transform → true full-screen.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 700 }}>
          LIVE COACH · {String(exerciseTitle).toUpperCase()}
        </div>
        <button onClick={onClose} style={hdrBtn}>← BACK</button>
      </div>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
              <button onClick={() => setShowSkeleton(s => !s)} style={{ ...ctrl, background: showSkeleton ? C.ac : 'transparent', minWidth: 116 }}>SKELETON {showSkeleton ? 'ON' : 'OFF'}</button>
            </>}
      </div>
    </div>,
    document.body
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
    // Use the SAME DEPTH_TOL gate as the rep counter (line ~124) so the on-feed
    // green depth cue agrees with the counted depth — they were inconsistent
    // (drawn line strict-parallel, counter tolerant), so a rep could count while
    // the line stayed white, and vice-versa. (camera audit)
    const atDepth = hipMid.y >= kneeMid.y - DEPTH_TOL; // hip crease at/below knee (lower in image = larger y)
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
