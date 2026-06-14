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

import React, { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { C, FN, FB } from './theme';
import { createPoseLandmarker, getCamera, stopStream } from './usePose';
import { analyzeClip, jumpMetrics, jumpPower, frameToPoints3D, estimateFps } from './poseLab';

// Real Z-Anatomy 3D model (three.js), posed from the captured rep — lazy so the
// 3D engine + GLBs only ship when the 3D tab is opened.
const AnatomyViewer = lazy(() => import('./AnatomyModelViewer'));

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
  defaultBodyweightKg = null,   // prefill the jump-power bodyweight from the athlete
}) {
  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const framesRef = useRef([]);
  const recStartRef = useRef(0);

  const [phase, setPhase] = useState('idle');     // idle | loading | countdown | recording | analyzing | results
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);
  const [result, setResult] = useState(null);     // analyzeClip output
  const [jump, setJump] = useState(null);         // jumpMetrics output
  const [tab, setTab] = useState('velocity');     // velocity | rom | threeD
  const [progress, setProgress] = useState(0);    // upload analysis %
  const [mode] = useState(initialMode);
  const fileInputRef = useRef(null);

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

  const beginCapture = useCallback(() => {
    framesRef.current = [];
    recStartRef.current = performance.now();
    setElapsed(0); setPhase('recording');
    rafRef.current = requestAnimationFrame(recordLoop);
  }, [recordLoop]);

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
      // 3·2·1 countdown so the athlete gets set and holds STILL before capture —
      // the first 0.6 s of frames is the standing baseline the jump math
      // calibrates the floor against. Recording no longer fires the instant the
      // button is tapped.
      setPhase('countdown'); setCountdown(3);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(countdownRef.current); countdownRef.current = null; beginCapture(); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      setPhase('idle'); setError(e?.message || 'Could not start the camera.');
    }
  }, [facingMode, beginCapture]);

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

  // ---- analyze an uploaded clip from the gallery ----
  // Steps through the video by seeking (≈20fps sample, capped) and runs pose
  // on each frame. Uses the 'full' model (more accurate; no real-time budget
  // since this is offline). Reuses the same analyzeClip path as live capture.
  const analyzeUploadedFile = useCallback(async (file) => {
    if (!file) return;
    setError(null); setResult(null); setJump(null); setProgress(0); setPhase('analyzing');
    let url;
    try {
      if (!landmarkerRef.current) landmarkerRef.current = await createPoseLandmarker({ runningMode: 'VIDEO', quality: 'full' });
      const lm = landmarkerRef.current;
      url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
      await new Promise((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error('Could not read that video file.'));
      });
      const dur = v.duration;
      if (!isFinite(dur) || dur <= 0) throw new Error('Could not read that video (no duration).');
      const STEP = 0.05;                 // sample ~20 fps
      const MAX = 600;                   // cap frames (≈30s of clip)
      const total = Math.min(MAX, Math.max(2, Math.ceil(dur / STEP)));
      const frames = [];
      for (let i = 0; i < total; i++) {
        const time = Math.min(dur - 0.001, i * STEP);
        v.currentTime = time;
        await new Promise((res) => { v.onseeked = () => res(); });
        let r = null;
        try { r = lm.detectForVideo(v, Math.round(time * 1000) + i); } catch {}
        if (r?.worldLandmarks?.[0]) {
          frames.push({ t: time * 1000, landmarks: r.landmarks?.[0] || null, worldLandmarks: r.worldLandmarks[0] });
        }
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      framesRef.current = frames;
      if (mode === 'jump') {
        const j = jumpMetrics(frames);
        setJump(j); setResult({ ok: !!j, frameCount: frames.length, fps: estimateFps(frames) });
      } else {
        const res = analyzeClip(frames, exerciseTitle);
        setResult(res); setTab(res.repCount ? 'velocity' : 'threeD');
      }
      setPhase('results');
    } catch (e) {
      setPhase('idle'); setError(e?.message || 'Could not process that video.');
    } finally {
      if (url) try { URL.revokeObjectURL(url); } catch {}
    }
  }, [mode, exerciseTitle]);

  const pickFile = useCallback(() => fileInputRef.current?.click(), []);

  const reset = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    framesRef.current = [];
    setResult(null); setJump(null); setPhase('idle'); setElapsed(0); setProgress(0); setCountdown(0);
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    stopStream(streamRef.current);
    try { landmarkerRef.current?.close(); } catch {}
  }, []);

  const recording = phase === 'recording';
  const showCamera = phase === 'idle' || phase === 'loading' || phase === 'countdown' || phase === 'recording';

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
              <div style={{ fontSize: 14, letterSpacing: '0.18em', fontWeight: 700, marginTop: 12 }}>
                {mode === 'jump' ? 'FILM A JUMP' : 'FILM THE SET'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 360, lineHeight: 1.55, marginTop: 8 }}>
                {mode === 'jump'
                  ? 'Side-on, full body in frame, ~2–3m back. Record, or upload a clip from your gallery — stand still for a second, then jump.'
                  : 'Side-on, full body in frame, ~2–3m back. Record a work set, or upload a clip from your gallery — keep the whole lift in shot.'}
              </div>
            </Centre>
          )}
          {phase === 'loading' && <Centre><div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>STARTING CAMERA + POSE…</div></Centre>}
          {phase === 'countdown' && (
            <Centre>
              <div style={{ fontFamily: FN, fontSize: 120, fontWeight: 800, color: C.ac, lineHeight: 1 }}>{countdown}</div>
              <div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700, marginTop: 8 }}>
                {mode === 'jump' ? 'STAND STILL — JUMP AFTER “REC”' : 'GET SET'}
              </div>
            </Centre>
          )}
          {recording && (
            <div style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', color: '#FFFFFF', fontFamily: FN, fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>
              <span style={{ color: C.rd }}>● REC</span> · {elapsed.toFixed(1)}s · {framesRef.current.length} frames
            </div>
          )}
          {error && <Centre><div style={{ fontSize: 32 }}>⚠</div><div style={{ fontSize: 13, color: C.rd, marginTop: 10 }}>{error}</div></Centre>}
        </div>
      )}

      {/* analyzing */}
      {phase === 'analyzing' && (
        <Centre>
          <div style={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700 }}>READING THE MOVEMENT…</div>
          {progress > 0 && (
            <>
              <div style={{ width: 220, height: 4, background: 'rgba(255,255,255,0.15)', marginTop: 16, borderRadius: 0 }}>
                <div style={{ width: `${progress}%`, height: '100%', background: C.ac, transition: 'width 120ms' }} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, fontFamily: FN, letterSpacing: '0.12em' }}>{progress}%</div>
            </>
          )}
        </Centre>
      )}

      {/* hidden gallery picker */}
      <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) analyzeUploadedFile(f); }} />

      {/* results */}
      {phase === 'results' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '64px 16px 16px', WebkitOverflowScrolling: 'touch' }}>
          {mode === 'jump'
            ? <JumpResult jump={jump} result={result} onSave={onSaveJump} onClose={onClose} defaultBodyweightKg={defaultBodyweightKg} />
            : <AnalyzeResult result={result} frames={framesRef.current} exerciseTitle={exerciseTitle} tab={tab} setTab={setTab} />}
        </div>
      )}

      {/* control bar */}
      <div style={{ background: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: 14, display: 'flex', gap: 10 }}>
        {phase === 'idle' && <>
          <BigBtn color={C.ac} onClick={startRecording}>{mode === 'jump' ? 'RECORD' : 'RECORD'} →</BigBtn>
          <button onClick={pickFile} style={{ flex: 1, padding: 14, background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#FFF', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' }}>⬆ UPLOAD CLIP</button>
        </>}
        {phase === 'loading' && <BigBtn color="#555" disabled>STARTING…</BigBtn>}
        {phase === 'countdown' && <BigBtn color="#555" disabled>GET READY… {countdown}</BigBtn>}
        {recording && <BigBtn color={C.rd} onClick={stopAndAnalyze}>STOP &amp; ANALYZE</BigBtn>}
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
    { k: 'threeD', label: '3D ANATOMY', on: true },
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
      {tab === 'threeD' && (
        <Suspense fallback={<div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: 30, fontFamily: FN, fontSize: 12, letterSpacing: '0.12em' }}>LOADING 3D…</div>}>
          <AnatomyViewer frames={frames} />
        </Suspense>
      )}
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
function JumpResult({ jump, result, onSave, onClose, defaultBodyweightKg }) {
  const [saved, setSaved] = useState(false);
  const [bw, setBw] = useState(defaultBodyweightKg != null ? String(defaultBodyweightKg) : '');
  if (!jump) return <Empty msg="Couldn't read a clean jump. Film side-on, full body in frame — stand still through the countdown, then jump straight up and land in place." />;
  const massKg = parseFloat(bw);
  const power = jumpPower(jump.heightCm, massKg);
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em', marginBottom: 8 }}>VERTICAL JUMP</div>
      <div style={{ fontFamily: FN, fontSize: 88, fontWeight: 800, color: C.ac, lineHeight: 1 }}>{jump.heightCm}<span style={{ fontSize: 28 }}>cm</span></div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
        <MiniKpi label="FLIGHT TIME" value={`${jump.flightMs} ms`} />
        <MiniKpi label="PEAK RISE" value={`${jump.peakRiseCm} cm`} />
      </div>

      {/* Bodyweight → peak power (Sayers). Height from flight time is mass-
          independent, but power is the athletic number — so we ask the weight. */}
      <div style={{ marginTop: 20, padding: 14, border: '1px solid rgba(255,255,255,0.14)', textAlign: 'left' }}>
        <label style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.16em', fontWeight: 700 }}>BODYWEIGHT (KG)</label>
        <input type="number" inputMode="decimal" value={bw} onChange={e => setBw(e.target.value)} placeholder="e.g. 75"
          style={{ width: '100%', marginTop: 6, padding: '10px 12px', background: '#000', border: `1px solid ${C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 16, letterSpacing: '0.04em', boxSizing: 'border-box' }} />
        {power
          ? <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <MiniKpi label="PEAK POWER" value={`${power.watts} W`} />
              <MiniKpi label="RELATIVE" value={`${power.perKg} W/kg`} />
            </div>
          : <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 10, letterSpacing: '0.04em' }}>Enter bodyweight to estimate peak power.</div>}
      </div>

      {onSave && (
        <button disabled={saved} onClick={() => { onSave({ ...jump, bodyweightKg: power ? massKg : null, powerW: power?.watts ?? null, powerWkg: power?.perKg ?? null }); setSaved(true); }} style={{
          marginTop: 18, padding: '13px 20px', width: '100%', background: saved ? '#2a2a2a' : C.ac,
          border: `1px solid ${saved ? '#2a2a2a' : C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', cursor: saved ? 'default' : 'pointer',
        }}>{saved ? 'SAVED TO EVALUATION' : 'SAVE TO ATHLETIC EVALUATION →'}</button>
      )}
      {saved && <button onClick={onClose} style={{ ...btn('rgba(255,255,255,0.3)', 'transparent'), marginTop: 12, width: '100%', padding: '11px' }}>DONE</button>}
    </div>
  );
}

// ----------------------------- 3D viewer ------------------------------------
// Full-body skeleton from MediaPipe's 33 landmarks. Real interactive 3D:
// orbit (drag), zoom (wheel/pinch), play the rep, scrub any frame, front/side
// presets. Depth-shaded + painter's-sorted so near bones read in front of far.
const SKELETON_CONNECTIONS = [
  [0, 2], [2, 7], [0, 5], [5, 8], [9, 10],            // head
  [11, 12], [11, 23], [12, 24], [23, 24],             // torso
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // L arm+hand
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // R arm+hand
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],   // L leg+foot
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],   // R leg+foot
];

function computeFit(poseFrames) {
  let maxR = 0.5;
  for (const f of poseFrames) {
    const pts = frameToPoints3D(f.worldLandmarks);
    for (const p of pts) { if (!p) continue; const r = Math.hypot(p.x, p.y, p.z); if (r > maxR) maxR = r; }
  }
  return maxR;
}

function Viewer3D({ frames }) {
  const canvasRef = useRef(null);
  const poseFrames = useMemo(() => frames.filter(f => f.worldLandmarks), [frames]);
  const maxR = useMemo(() => computeFit(poseFrames), [poseFrames]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rotRef = useRef({ yaw: 0.5, pitch: -0.05 });
  const zoomRef = useRef(1);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const idxRef = useRef(0);
  const [, force] = useState(0);

  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => {
    if (!playing || poseFrames.length < 2) return;
    let raf, last = performance.now(), acc = 0; const fps = 20;
    const loop = (now) => {
      acc += now - last; last = now;
      if (acc >= 1000 / fps) { acc = 0; idxRef.current = (idxRef.current + 1) % poseFrames.length; setIdx(idxRef.current); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, poseFrames.length]);

  useEffect(() => {
    const cur = poseFrames[Math.min(idx, poseFrames.length - 1)];
    drawSkeleton(canvasRef.current, cur?.worldLandmarks, rotRef.current, zoomRef.current, maxR);
  });

  const getXY = (e) => ({ x: e.clientX ?? e.touches?.[0]?.clientX, y: e.clientY ?? e.touches?.[0]?.clientY });
  const pinchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onDown = (e) => { if (e.touches?.length === 2) pinchRef.current = pinchDist(e.touches); else dragRef.current = getXY(e); };
  const onMove = (e) => {
    if (e.touches?.length === 2 && pinchRef.current) {
      const d = pinchDist(e.touches);
      zoomRef.current = Math.max(0.4, Math.min(3, zoomRef.current * (d / pinchRef.current)));
      pinchRef.current = d; force(n => n + 1); return;
    }
    if (!dragRef.current) return;
    const { x, y } = getXY(e);
    rotRef.current.yaw += (x - dragRef.current.x) * 0.01;
    rotRef.current.pitch = Math.max(-1.2, Math.min(1.2, rotRef.current.pitch + (y - dragRef.current.y) * 0.01));
    dragRef.current = { x, y }; force(n => n + 1);
  };
  const onUp = () => { dragRef.current = null; pinchRef.current = null; };
  const onWheel = (e) => { e.preventDefault(); zoomRef.current = Math.max(0.4, Math.min(3, zoomRef.current * (e.deltaY < 0 ? 1.1 : 0.9))); force(n => n + 1); };
  const preset = (yaw, pitch) => { rotRef.current = { yaw, pitch }; zoomRef.current = 1; force(n => n + 1); };

  if (!poseFrames.length) return <Empty msg="No 3D pose captured in that clip." />;
  const f = Math.min(idx, poseFrames.length - 1);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <Pill onClick={() => setPlaying(p => !p)} active={playing}>{playing ? '❚❚ PAUSE' : '▶ PLAY'}</Pill>
        <Pill onClick={() => preset(0, -0.05)}>FRONT</Pill>
        <Pill onClick={() => preset(Math.PI / 2, -0.05)}>SIDE</Pill>
        <Pill onClick={() => preset(0.5, -0.05)}>RESET</Pill>
      </div>
      <canvas ref={canvasRef} width={560} height={620}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onWheel={onWheel}
        style={{ width: '100%', maxWidth: 340, height: 'auto', display: 'block', margin: '0 auto', background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', touchAction: 'none', cursor: 'grab' }} />
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textAlign: 'center', marginTop: 6 }}>DRAG ORBIT · PINCH / WHEEL ZOOM</div>
      <input type="range" min={0} max={poseFrames.length - 1} value={f} onChange={e => { setPlaying(false); setIdx(Number(e.target.value)); }}
        style={{ width: '100%', maxWidth: 340, display: 'block', margin: '10px auto 0', accentColor: C.ac }} />
      <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>FRAME {f + 1} / {poseFrames.length}</div>
    </div>
  );
}

const Pill = ({ onClick, active, children }) => (
  <button onClick={onClick} style={{ padding: '6px 12px', background: active ? C.ac : 'transparent', color: '#FFF', border: `1px solid ${active ? C.ac : 'rgba(255,255,255,0.25)'}`, fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 0 }}>{children}</button>
);

function drawSkeleton(canvas, world, rot, zoom, maxR) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!world) return;
  const pts = frameToPoints3D(world);                 // y up, hip-centred metres
  const cy = Math.cos(rot.yaw), sy = Math.sin(rot.yaw), cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
  const S = (Math.min(W, H) * 0.40 / maxR) * zoom;
  const proj = pts.map(p => {
    if (!p) return null;
    const xr = p.x * cy + p.z * sy;                    // yaw about vertical
    const zr = -p.x * sy + p.z * cy;
    const yr = p.y * cp - zr * sp;                     // pitch about horizontal
    const zd = p.y * sp + zr * cp;                     // depth
    return { sx: W / 2 + xr * S, sy: H / 2 - yr * S, d: zd };
  });
  let dmin = Infinity, dmax = -Infinity;
  for (const p of proj) if (p) { if (p.d < dmin) dmin = p.d; if (p.d > dmax) dmax = p.d; }
  const span = (dmax - dmin) || 1;
  const bright = (d) => 0.45 + 0.55 * ((d - dmin) / span); // nearer = brighter
  // bones, painter-sorted far→near
  const bones = SKELETON_CONNECTIONS.map(([a, b]) => ({ pa: proj[a], pb: proj[b] })).filter(o => o.pa && o.pb);
  bones.sort((m, n) => (m.pa.d + m.pb.d) - (n.pa.d + n.pb.d));
  ctx.lineCap = 'round';
  for (const o of bones) {
    const t = bright((o.pa.d + o.pb.d) / 2);
    ctx.strokeStyle = `rgba(57,189,255,${0.35 + 0.65 * t})`;
    ctx.lineWidth = 3 + 4 * t;
    ctx.beginPath(); ctx.moveTo(o.pa.sx, o.pa.sy); ctx.lineTo(o.pb.sx, o.pb.sy); ctx.stroke();
  }
  // joints, near→far so near sit on top
  const joints = proj.map(p => p).filter(Boolean).sort((m, n) => m.d - n.d);
  for (const p of joints) {
    const t = bright(p.d);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * t})`;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, 2 + 2 * t, 0, Math.PI * 2); ctx.fill();
  }
  // head circle (skull) at the nose, sized by ear span / shoulder width
  const nose = proj[0], e7 = proj[7], e8 = proj[8], s11 = proj[11], s12 = proj[12];
  if (nose) {
    let hr = 14;
    if (e7 && e8) hr = Math.max(11, Math.hypot(e7.sx - e8.sx, e7.sy - e8.sy) * 0.95);
    else if (s11 && s12) hr = Math.max(11, Math.hypot(s11.sx - s12.sx, s11.sy - s12.sy) * 0.35);
    const t = bright(nose.d);
    ctx.strokeStyle = `rgba(57,189,255,${0.4 + 0.6 * t})`; ctx.lineWidth = 2.5 + 1.5 * t;
    ctx.beginPath(); ctx.arc(nose.sx, nose.sy, hr, 0, Math.PI * 2); ctx.stroke();
  }
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
