// MovementLab.jsx — record a lift on camera, then read it back as data.
//
// One capture core (MediaPipe Pose over a recorded clip) feeding four reads:
//   • VELOCITY  — mean concentric m/s + velocity-loss % per rep (VBT)
//   • ROM+TEMPO — joint travel + ecc/pause/con seconds per rep, collapse flags
//   • 3D        — rotatable markerless skeleton of the lift, scrub any frame
//   • JUMP      — vertical jump height from flight time (camera "combine")
//
// Pure analysis lives in poseLab.js; pose bootstrap in usePose.js. This file
// is capture + presentation. Records worldLandmarks (metric, hip-centred) per
// frame so every metric is true-scale regardless of camera distance.
//
// Memory rule honoured: measures + reports only. No load recommendations,
// no auto weight bumps.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { createPoseLandmarker, getCamera, stopStream } from './usePose';
import { analyzeClip, jumpMetrics, frameToPoints3D, POSE_BONES, estimateFps } from './poseLab';

const POSE_CONNECTIONS = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 12],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export default function MovementLab({
  exerciseTitle = 'Squat',
  initialMode = 'analyze',      // 'analyze' (VBT/ROM/3D) | 'jump'
  facingMode = 'environment',   // filming someone on the floor by default
  onClose,
  onSaveJump,                   // (metrics) => void — wires jump into ath eval
}) {
  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const framesRef = useRef([]);
  const recStartRef = useRef(0);

  const [phase, setPhase] = useState('idle');     // idle | loading | recording | analyzing | results
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);     // analyzeClip output
  const [jump, setJump] = useState(null);         // jumpMetrics output
  const [tab, setTab] = useState('velocity');     // velocity | rom | threeD
  const [mode] = useState(initialMode);

  // ---- bootstrap + record loop ----
  const recordLoop = useCallback(() => {
    const v = videoRef.current, lm = landmarkerRef.current;
    if (!v || !lm || v.readyState < 2) { rafRef.current = requestAnimationFrame(recordLoop); return; }
    const now = performance.now();
    let res = null;
    try { res = lm.detectForVideo(v, now); } catch { res = null; }
    if (res?.worldLandmarks?.[0]) {
      framesRef.current.push({
        t: now - recStartRef.current,
        landmarks: res.landmarks?.[0] || null,
        worldLandmarks: res.worldLandmarks[0],
      });
      drawLive(liveCanvasRef.current, v, res.landmarks?.[0]);
    } else {
      drawLive(liveCanvasRef.current, v, null);
    }
    setElapsed((performance.now() - recStartRef.current) / 1000);
    rafRef.current = requestAnimationFrame(recordLoop);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null); setResult(null); setJump(null); setPhase('loading');
    try {
      if (!streamRef.current) {
        const s = await getCamera(facingMode);
        streamRef.current = s;
        const v = videoRef.current;
        if (v) { v.srcObject = s; await v.play(); }
      }
      if (!landmarkerRef.current) landmarkerRef.current = await createPoseLandmarker({ runningMode: 'VIDEO', quality: 'lite' });
      framesRef.current = [];
      recStartRef.current = performance.now();
      setElapsed(0); setPhase('recording');
      rafRef.current = requestAnimationFrame(recordLoop);
    } catch (e) {
      setPhase('idle'); setError(e?.message || 'Could not start the camera.');
    }
  }, [facingMode, recordLoop]);

  const stopAndAnalyze = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPhase('analyzing');
    const frames = framesRef.current;
    setTimeout(() => {
      if (mode === 'jump') {
        const j = jumpMetrics(frames);
        setJump(j); setResult({ ok: !!j, frameCount: frames.length, fps: estimateFps(frames) });
        setPhase('results');
      } else {
        const r = analyzeClip(frames, exerciseTitle);
        setResult(r);
        setTab(r.repCount ? 'velocity' : 'threeD');
        setPhase('results');
      }
    }, 30);
  }, [mode, exerciseTitle]);

  const reset = useCallback(() => {
    framesRef.current = [];
    setResult(null); setJump(null); setPhase('idle'); setElapsed(0);
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopStream(streamRef.current);
    try { landmarkerRef.current?.close(); } catch {}
  }, []);

  const recording = phase === 'recording';
  const showCamera = phase === 'idle' || phase === 'loading' || phase === 'recording';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 700 }}>
            {mode === 'jump' ? 'JUMP TEST' : 'MOVEMENT LAB'} · {String(exerciseTitle).toUpperCase()}
          </div>
        </div>
        <button onClick={onClose} style={btn('rgba(255,255,255,0.3)', 'transparent')}>✕ CLOSE</button>
      </div>

      {/* camera + live skeleton (capture phases) */}
      {showCamera && (
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={liveCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          {phase === 'idle' && !error && (
            <Centre>
              <div style={{ fontSize: 56 }}>{mode === 'jump' ? '🏃' : '🎥'}</div>
              <div style={{ fontSize: 14, letterSpacing: '0.18em', fontWeight: 700, marginTop: 12 }}>
                {mode === 'jump' ? 'FILM A JUMP' : 'FILM THE SET'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 360, lineHeight: 1.55, marginTop: 8 }}>
                {mode === 'jump'
                  ? 'Side-on, full body in frame, ~2–3m back. Tap record, have them stand still for a second, then jump.'
                  : 'Side-on, full body in frame, ~2–3m back. Record one work set — keep the whole lift in shot.'}
              </div>
            </Centre>
          )}
          {phase === 'loading' && <Centre><div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>STARTING CAMERA + POSE…</div></Centre>}
          {recording && (
            <div style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', color: '#FFFFFF', fontFamily: FN, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>
              <span style={{ color: C.rd }}>● REC</span> · {elapsed.toFixed(1)}s · {framesRef.current.length} frames
            </div>
          )}
          {error && <Centre><div style={{ fontSize: 32 }}>⚠</div><div style={{ fontSize: 13, color: C.rd, marginTop: 10 }}>{error}</div></Centre>}
        </div>
      )}

      {/* analyzing */}
      {phase === 'analyzing' && <Centre><div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>READING THE MOVEMENT…</div></Centre>}

      {/* results */}
      {phase === 'results' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '64px 16px 16px', WebkitOverflowScrolling: 'touch' }}>
          {mode === 'jump'
            ? <JumpResult jump={jump} result={result} onSave={onSaveJump} onClose={onClose} />
            : <AnalyzeResult result={result} frames={framesRef.current} exerciseTitle={exerciseTitle} tab={tab} setTab={setTab} />}
        </div>
      )}

      {/* control bar */}
      <div style={{ background: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: 14, display: 'flex', gap: 10 }}>
        {phase === 'idle' && <BigBtn color={C.ac} onClick={startRecording}>{mode === 'jump' ? 'RECORD JUMP →' : 'RECORD SET →'}</BigBtn>}
        {phase === 'loading' && <BigBtn color="#555" disabled>STARTING…</BigBtn>}
        {recording && <BigBtn color={C.rd} onClick={stopAndAnalyze}>■ STOP &amp; ANALYZE</BigBtn>}
        {(phase === 'results' || phase === 'analyzing') && <BigBtn color={C.ac} onClick={reset}>↺ RECORD AGAIN</BigBtn>}
      </div>
    </div>
  );
}

// ----------------------------- results: analyze -----------------------------
function AnalyzeResult({ result, frames, exerciseTitle, tab, setTab }) {
  if (!result?.ok) return <Empty msg="Couldn't read a clean pose from that clip. Re-film side-on with the full body in frame." />;
  const tabs = [
    { k: 'velocity', label: 'VELOCITY', on: result.repCount > 0 },
    { k: 'rom', label: 'ROM & TEMPO', on: result.repCount > 0 },
    { k: 'threeD', label: '3D', on: true },
  ];
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.k} disabled={!t.on} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: '9px 6px', background: tab === t.k ? C.ac : 'transparent',
            color: t.on ? '#FFF' : 'rgba(255,255,255,0.35)',
            border: `1px solid ${tab === t.k ? C.ac : 'rgba(255,255,255,0.18)'}`, borderLeft: 'none',
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: t.on ? 'pointer' : 'default',
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 12 }}>
        {result.repCount} REP{result.repCount === 1 ? '' : 'S'} · {result.fps}fps · {result.frameCount} frames
      </div>
      {tab === 'velocity' && <VelocityTable v={result.velocity} />}
      {tab === 'rom' && <RomTable r={result.romTempo} />}
      {tab === 'threeD' && <Viewer3D frames={frames} />}
    </div>
  );
}

function VelocityTable({ v }) {
  if (!v) return <Empty msg="No reps detected to measure velocity." />;
  return (
    <div>
      <Kpi label="BEST MEAN VELOCITY" value={`${v.bestMean.toFixed(2)} m/s`} />
      <Kpi label="VELOCITY LOSS (LAST REP)" value={`${v.finalLossPct}%`} tone={v.finalLossPct >= 20 ? C.rd : v.finalLossPct >= 10 ? C.or : C.gn} />
      <Row head cells={['REP', 'MEAN m/s', 'PEAK m/s', 'LOSS']} />
      {v.perRep.map((r, i) => r && <Row key={i} cells={[i + 1, r.meanConcentric.toFixed(2), r.peak.toFixed(2), `${r.lossPct}%`]} tone={r.lossPct >= 20 ? C.rd : undefined} />)}
    </div>
  );
}

function RomTable({ r }) {
  if (!r) return <Empty msg="No reps detected to measure range of motion." />;
  return (
    <div>
      <Kpi label="LARGEST ROM" value={`${r.maxRom.toFixed(0)}°`} />
      {r.collapsedCount > 0 && <Kpi label="ROM-COLLAPSED REPS" value={String(r.collapsedCount)} tone={C.or} />}
      <Row head cells={['REP', 'ROM', 'ECC s', 'PAUSE', 'CON s']} />
      {r.perRep.map((x, i) => x && <Row key={i} cells={[i + 1, `${x.rom.toFixed(0)}° (${x.romPct}%)`, x.ecc.toFixed(1), x.pause.toFixed(1), x.con.toFixed(1)]} tone={x.collapsed ? C.or : undefined} />)}
    </div>
  );
}

// ----------------------------- results: jump --------------------------------
function JumpResult({ jump, result, onSave, onClose }) {
  const [saved, setSaved] = useState(false);
  if (!jump) return <Empty msg="Couldn't detect a clean jump. Film side-on, full body in frame, with a still second before the jump." />;
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em', marginBottom: 8 }}>VERTICAL JUMP</div>
      <div style={{ fontFamily: FN, fontSize: 88, fontWeight: 800, color: C.ac, lineHeight: 1 }}>{jump.heightCm}<span style={{ fontSize: 28 }}>cm</span></div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
        <MiniKpi label="FLIGHT TIME" value={`${jump.flightMs} ms`} />
        <MiniKpi label="PEAK RISE" value={`${jump.peakRiseCm} cm`} />
      </div>
      {onSave && (
        <button disabled={saved} onClick={() => { onSave(jump); setSaved(true); }} style={{
          marginTop: 24, padding: '13px 20px', width: '100%', background: saved ? '#2a2a2a' : C.ac,
          border: `1px solid ${saved ? '#2a2a2a' : C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', cursor: saved ? 'default' : 'pointer',
        }}>{saved ? '✓ SAVED TO EVALUATION' : 'SAVE TO ATHLETIC EVALUATION →'}</button>
      )}
      {saved && <button onClick={onClose} style={{ ...btn('rgba(255,255,255,0.3)', 'transparent'), marginTop: 12, width: '100%', padding: '11px' }}>DONE</button>}
    </div>
  );
}

// ----------------------------- 3D viewer ------------------------------------
function Viewer3D({ frames }) {
  const canvasRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const dragRef = useRef(null);
  const rotRef = useRef({ yaw: 0.5, pitch: -0.15 });
  const [, force] = useState(0);
  const poseFrames = frames.filter(f => f.worldLandmarks);
  const cur = poseFrames[Math.min(idx, poseFrames.length - 1)];

  useEffect(() => {
    const pts = cur ? frameToPoints3D(cur.worldLandmarks) : null;
    draw3D(canvasRef.current, pts, rotRef.current);
  });

  const onDown = (e) => { dragRef.current = { x: e.clientX ?? e.touches?.[0]?.clientX, y: e.clientY ?? e.touches?.[0]?.clientY }; };
  const onMove = (e) => {
    if (!dragRef.current) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX, y = e.clientY ?? e.touches?.[0]?.clientY;
    rotRef.current.yaw += (x - dragRef.current.x) * 0.01;
    rotRef.current.pitch += (y - dragRef.current.y) * 0.01;
    dragRef.current = { x, y };
    force(n => n + 1);
  };
  const onUp = () => { dragRef.current = null; };

  if (!poseFrames.length) return <Empty msg="No 3D pose captured in that clip." />;
  return (
    <div>
      <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', marginBottom: 8, textAlign: 'center' }}>DRAG TO ROTATE · SCRUB BELOW</div>
      <canvas ref={canvasRef} width={320} height={360}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        style={{ width: '100%', maxWidth: 320, height: 'auto', display: 'block', margin: '0 auto', background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', touchAction: 'none', cursor: 'grab' }} />
      <input type="range" min={0} max={poseFrames.length - 1} value={Math.min(idx, poseFrames.length - 1)} onChange={e => setIdx(Number(e.target.value))}
        style={{ width: '100%', maxWidth: 320, display: 'block', margin: '14px auto 0', accentColor: C.ac }} />
      <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>FRAME {Math.min(idx, poseFrames.length - 1) + 1} / {poseFrames.length}</div>
    </div>
  );
}

function draw3D(canvas, pts, rot) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!pts) return;
  const cy = Math.cos(rot.yaw), sy = Math.sin(rot.yaw), cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
  const project = (p) => {
    if (!p) return null;
    let x = p.x * cy - p.z * sy;
    let z = p.x * sy + p.z * cy;
    let y = p.y * cp - z * sp;
    const scale = 150;
    return { sx: W / 2 + x * scale, sy: H / 2 - y * scale };
  };
  const proj = pts.map(project);
  ctx.strokeStyle = '#39BDFF'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  POSE_BONES.forEach(([a, b]) => {
    const pa = proj[a], pb = proj[b];
    if (!pa || !pb) return;
    ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
  });
  ctx.fillStyle = '#FFFFFF';
  proj.forEach(p => { if (!p) return; ctx.beginPath(); ctx.arc(p.sx, p.sy, 3.5, 0, Math.PI * 2); ctx.fill(); });
}

// ----------------------------- live draw ------------------------------------
function drawLive(canvas, video, landmarks) {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;
  ctx.strokeStyle = '#39BDFF'; ctx.lineWidth = 3; ctx.fillStyle = '#39BDFF';
  POSE_CONNECTIONS.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b]; if (!la || !lb) return;
    ctx.beginPath(); ctx.moveTo(la.x * w, la.y * h); ctx.lineTo(lb.x * w, lb.y * h); ctx.stroke();
  });
  landmarks.forEach(lm => { if (!lm) return; ctx.beginPath(); ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2); ctx.fill(); });
}

// ----------------------------- bits -----------------------------------------
const Centre = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FN, textAlign: 'center', padding: 20 }}>{children}</div>
);
const Empty = ({ msg }) => (
  <div style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontFamily: FB, fontSize: 13, lineHeight: 1.6 }}>{msg}</div>
);
const Kpi = ({ label, value, tone }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 8 }}>
    <span style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</span>
    <span style={{ fontFamily: FN, fontSize: 20, fontWeight: 800, color: tone || C.ac }}>{value}</span>
  </div>
);
const MiniKpi = ({ label, value }) => (
  <div style={{ flex: 1, padding: '12px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
    <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
    <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: '#FFF', marginTop: 4 }}>{value}</div>
  </div>
);
const Row = ({ cells, head, tone }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 4, padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
    {cells.map((c, i) => (
      <span key={i} style={{ fontFamily: FN, fontSize: head ? 9 : 12, fontWeight: 700, letterSpacing: head ? '0.1em' : 0, color: head ? 'rgba(255,255,255,0.45)' : (i === 0 ? '#FFF' : (tone || 'rgba(255,255,255,0.85)')), textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
    ))}
  </div>
);
const btn = (bd, bg) => ({ background: bg, border: `1px solid ${bd}`, color: '#FFF', padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' });
const BigBtn = ({ color, onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#FFF', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.16em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>{children}</button>
);
