// ARFormOverlay.jsx — live augmented coaching overlay.
//
// Point the phone at a lifting athlete; MediaPipe Pose runs on the live feed
// and the canvas ghosts two coaching references over them in real time:
//   • BAR PATH  — a vertical plumb line anchored at the bar's start x, with
//     live horizontal deviation (how far the bar is drifting forward/back).
//   • DEPTH     — for squat/hinge patterns, a target line at knee height; the
//     hip marker turns green + "DEPTH" flashes when the hips drop to depth.
// Plus the live skeleton. This is feedback BEFORE the rep finishes — the gym
// wow-factor. No counting, no recommendations; pure real-time reference.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { C, FN } from './theme';
import { createPoseLandmarker, getCamera, stopStream } from './usePose';
import { detectChannels } from './repCounter';

const SKEL = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 12],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];
const ACCENT = '#39BDFF';

export default function ARFormOverlay({ exerciseTitle = 'Squat', facingMode = 'environment', onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const lmRef = useRef(null);
  const rafRef = useRef(null);
  const anchorRef = useRef(null);      // {x} normalized bar-path anchor
  const [phase, setPhase] = useState('idle'); // idle | loading | live
  const [error, setError] = useState(null);
  const [showDepth, setShowDepth] = useState(true);
  const kind = detectChannels(exerciseTitle).kind;
  const depthRelevant = kind === 'knee' || kind === 'hip';

  const loop = useCallback(() => {
    const v = videoRef.current, lm = lmRef.current;
    if (!v || !lm || v.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return; }
    let res = null;
    try { res = lm.detectForVideo(v, performance.now()); } catch { res = null; }
    const landmarks = res?.landmarks?.[0] || null;
    draw(canvasRef.current, v, landmarks, anchorRef, { depth: showDepth && depthRelevant });
    rafRef.current = requestAnimationFrame(loop);
  }, [showDepth, depthRelevant]);

  const start = useCallback(async () => {
    setError(null); setPhase('loading');
    try {
      if (!streamRef.current) {
        const s = await getCamera(facingMode);
        streamRef.current = s;
        const v = videoRef.current; if (v) { v.srcObject = s; await v.play(); }
      }
      if (!lmRef.current) lmRef.current = await createPoseLandmarker({ runningMode: 'VIDEO', quality: 'lite' });
      anchorRef.current = null;
      setPhase('live');
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) { setPhase('idle'); setError(e?.message || 'Could not start the camera.'); }
  }, [facingMode, loop]);

  const reanchor = useCallback(() => { anchorRef.current = null; }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopStream(streamRef.current);
    try { lmRef.current?.close(); } catch {}
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 700 }}>
          AR FORM · {String(exerciseTitle).toUpperCase()}
        </div>
        <button onClick={onClose} style={hdrBtn}>✕ CLOSE</button>
      </div>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        {phase === 'idle' && !error && (
          <Centre>
            <div style={{ fontSize: 56 }}>🪞</div>
            <div style={{ fontSize: 14, letterSpacing: '0.18em', fontWeight: 700, marginTop: 12 }}>AR FORM OVERLAY</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 360, lineHeight: 1.55, marginTop: 8 }}>
              Point the camera side-on at the lifter, full body in frame. A plumb line locks to the bar at the top of the first rep so you can see drift{depthRelevant ? ', plus a depth target at the knees' : ''}.
            </div>
          </Centre>
        )}
        {phase === 'loading' && <Centre><div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>STARTING CAMERA + POSE…</div></Centre>}
        {error && <Centre><div style={{ fontSize: 32 }}>⚠</div><div style={{ fontSize: 13, color: C.rd, marginTop: 10 }}>{error}</div></Centre>}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: 14, display: 'flex', gap: 10 }}>
        {phase !== 'live'
          ? <Big color={C.ac} onClick={start} disabled={phase === 'loading'}>{phase === 'loading' ? 'STARTING…' : 'START OVERLAY →'}</Big>
          : <>
              <button onClick={reanchor} style={{ ...ctrl, minWidth: 140 }}>⟲ RE-LOCK BAR</button>
              {depthRelevant && <button onClick={() => setShowDepth(s => !s)} style={{ ...ctrl, background: showDepth ? C.ac : 'transparent', minWidth: 120 }}>DEPTH {showDepth ? 'ON' : 'OFF'}</button>}
            </>}
      </div>
    </div>
  );
}

function draw(canvas, video, landmarks, anchorRef, { depth }) {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  // skeleton
  ctx.strokeStyle = 'rgba(57,189,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  SKEL.forEach(([a, b]) => { const la = landmarks[a], lb = landmarks[b]; if (!la || !lb) return; ctx.beginPath(); ctx.moveTo(la.x * w, la.y * h); ctx.lineTo(lb.x * w, lb.y * h); ctx.stroke(); });

  const wristMid = midpt(landmarks[15], landmarks[16]);
  const hipMid = midpt(landmarks[23], landmarks[24]);
  const kneeMid = midpt(landmarks[25], landmarks[26]);

  // bar-path plumb line — lock the anchor to the bar's x at the highest point
  // seen so far (the rack/standing position), then show live drift from it.
  if (wristMid) {
    if (anchorRef.current == null) anchorRef.current = { x: wristMid.x, topY: wristMid.y };
    if (wristMid.y < anchorRef.current.topY) { anchorRef.current = { x: wristMid.x, topY: wristMid.y }; }
    const ax = anchorRef.current.x * w;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, h); ctx.stroke(); ctx.setLineDash([]);
    const driftPx = (wristMid.x - anchorRef.current.x) * w;
    const driftCm = Math.round(Math.abs((wristMid.x - anchorRef.current.x)) * estimateBodyWidthCm(landmarks));
    // live bar marker
    ctx.fillStyle = Math.abs(driftPx) > 0.04 * w ? '#FF5A5A' : ACCENT;
    ctx.beginPath(); ctx.arc(wristMid.x * w, wristMid.y * h, 9, 0, Math.PI * 2); ctx.fill();
    label(ctx, `${driftCm} cm`, wristMid.x * w + 14, wristMid.y * h - 10, Math.abs(driftPx) > 0.04 * w ? '#FF5A5A' : ACCENT);
  }

  // depth target — horizontal line at knee height; hips green when at/below it
  if (depth && kneeMid && hipMid) {
    const ky = kneeMid.y * h;
    const atDepth = hipMid.y >= kneeMid.y; // hip crease at/below knee (lower in image = larger y)
    ctx.strokeStyle = atDepth ? 'rgba(70,220,130,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(0, ky); ctx.lineTo(w, ky); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = atDepth ? '#46DC82' : 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(hipMid.x * w, hipMid.y * h, 9, 0, Math.PI * 2); ctx.fill();
    if (atDepth) label(ctx, 'DEPTH ✓', w / 2 - 40, ky - 14, '#46DC82', 20);
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
const hdrBtn = { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF', padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' };
const ctrl = { padding: '12px 14px', background: 'transparent', color: '#FFF', border: '1px solid rgba(255,255,255,0.3)', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const Big = ({ color, onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#FFF', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.16em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>{children}</button>
);
