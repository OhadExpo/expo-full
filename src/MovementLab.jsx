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
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { createPoseLandmarker, getCamera, stopStream } from './usePose';
import { analyzeClip, jumpMetrics, reactiveJumpMetrics, jumpPower, frameToPoints3D, estimateFps, barSpeedSeries, barAccelSeries, namedAngleSeries, channelSignal, velocityMetrics, romTempoMetrics, movementRepCount, isBallistic } from './poseLab';
import { detectFaults, detectAsymmetry, velocityAutoreg, warmupReadiness } from './poseInsights';
import { savePoseMetric, getLoadVelocityRef, isVelocityLossLift } from './poseMetricsStore';
import { romReadingFor } from './romGoniometer';
import { demoSquatFrames, demoJumpFrames } from './demoMotion';

// Among several detected poses (multi-pose upload analysis), pick the SUBJECT —
// the central, tallest figure in frame (closest to the camera, framed in the
// middle) — so a crowd of spectators/other gym-goers can't hijack the read.
// Returns { idx, centroid } (idx -1 if none). Single-pose → { idx: 0, centroid }.
//
// prevCentroid (optional): the LAST selected subject's centroid. Without this,
// every frame re-scores from scratch with ZERO memory of who was picked a
// moment ago — in a busy gym (other people visible in frame, as most Review
// clips are), a background person can transiently out-score the real subject
// on span/centrality for a frame or two (e.g. during a jump, the actual
// subject's own span swings a lot — crouched vs airborne — while someone else
// briefly steps closer to centre). A frame-to-frame subject SWITCH means the
// tracked wrist/hip position jumps to a completely different body between two
// consecutive frames — a huge, physically-impossible "displacement" in an
// arbitrary direction. That reads exactly like the reported symptom: sharp,
// implausibly large velocity spikes (12+ m/s — no human bar/hip speed gets
// anywhere near that) with an effectively random sign, not a genuine signed-
// convention bug. When prevCentroid is given, continuity (closeness to where
// the subject was a moment ago) dominates the score; span/centrality only
// break ties or bootstrap the very first frame.
function pickSubjectIdx(poses, prevCentroid = null) {
  if (!poses || !poses.length) return { idx: -1, centroid: null };
  const scored = [];
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    if (!p || !p.length) continue;
    let minY = 1, maxY = 0, sumX = 0, sumY = 0, n = 0;
    for (const pt of p) {
      if (!pt || typeof pt.y !== 'number') continue;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
      sumX += pt.x; sumY += pt.y; n++;
    }
    if (!n) continue;
    const span = maxY - minY;                                  // taller in frame = closer / main subject
    const cx = sumX / n, cy = sumY / n;
    const centrality = 1 - Math.min(1, Math.abs(0.5 - cx) * 2); // 1 at centre → 0 at the edges
    scored.push({ i, span, centrality, cx, cy });
  }
  if (!scored.length) return { idx: -1, centroid: null };
  if (poses.length === 1) { const s = scored[0]; return { idx: s.i, centroid: { x: s.cx, y: s.cy } }; }
  let best = null, bestScore = -Infinity;
  for (const s of scored) {
    let score = s.span + s.centrality * 0.5;
    if (prevCentroid) {
      const dist = Math.hypot(s.cx - prevCentroid.x, s.cy - prevCentroid.y);
      // Continuity dominates: a candidate close to where the subject just was
      // scores far above span/centrality alone can push a different person to.
      score += Math.max(0, 1 - dist * 4) * 5;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return { idx: best.i, centroid: { x: best.cx, y: best.cy } };
}

// Measure a video's TRUE frame rate from real presentation timestamps via
// requestVideoFrameCallback (rVFC gives each painted frame's exact mediaTime).
// A brief muted play pass samples ~a dozen frames and takes the median inter-
// frame delta → fps. Returns null when rVFC is unavailable or the read is
// unreliable, so the caller falls back to a fixed cadence. This is what lets the
// seek pass sample at the SOURCE cadence (one distinct frame per real frame) —
// a fixed 50fps step on a 30fps clip re-reads frames and fakes zero-velocity
// pairs; on 120/240fps slow-mo it under-samples. Both corrupt velocity/tempo.
async function measureVideoFps(v) {
  if (typeof v.requestVideoFrameCallback !== 'function') return null;
  return await new Promise((resolve) => {
    const times = [];
    let settled = false;
    const finish = () => {
      if (settled) return; settled = true;
      clearTimeout(to);
      try { v.pause(); } catch { /* noop */ }
      // Drop the first couple of deltas — playback ramp-up spaces the opening
      // frames irregularly and would bias the estimate high.
      const raw = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.0008);
      const dts = (raw.length > 4 ? raw.slice(2) : raw).sort((a, b) => a - b);
      if (dts.length < 2) return resolve(null);
      const med = dts[Math.floor(dts.length / 2)];
      const fps = med > 0 ? 1 / med : 0;
      if (!(fps >= 10 && fps <= 300)) return resolve(null);
      // Snap to the nearest standard camera rate. A 30fps clip often measures ~31.5
      // over its first frames; sampling finer than the true frame period would
      // re-introduce duplicate reads, so lock onto the real rate when close.
      const STD = [24, 25, 30, 48, 50, 60, 120, 240];
      const near = STD.find((s) => Math.abs(fps - s) / s <= 0.06);
      resolve(near || fps);
    };
    const onFrame = (_now, meta) => {
      if (settled) return;
      times.push(meta.mediaTime);
      // Enough once we have a stable dozen frames or crossed ~0.6s of media.
      if (times.length >= 12 || (times.length >= 6 && meta.mediaTime > 0.6)) { finish(); return; }
      v.requestVideoFrameCallback(onFrame);
    };
    const to = setTimeout(finish, 2000);
    try { v.muted = true; v.currentTime = 0; } catch { /* noop */ }
    v.play().then(() => { v.requestVideoFrameCallback(onFrame); }).catch(() => resolve(null));
  });
}

// Seek-pass frame capture from any playable video src (an uploaded object URL,
// or a remote clip URL like a Review upload). Returns [{t, landmarks,
// worldLandmarks}] for poseLab — the same shape live capture produces. Shared by
// the in-Lab upload path and the Review player's inline LIFT METRICS. Closes its
// own landmarker. crossOrigin keeps the frames canvas-readable for remote clips.
export async function captureClipFrames(src, { crossOrigin = false, onProgress } = {}) {
  let lm, v;
  try {
    lm = await createPoseLandmarker({ runningMode: 'VIDEO', quality: 'full', numPoses: 5 });
    v = document.createElement('video');
    if (crossOrigin) v.crossOrigin = 'anonymous';
    v.src = src; v.muted = true; v.playsInline = true; v.preload = 'auto';
    // Offscreen in the DOM (not visible): a detached video won't reliably paint
    // frames, and requestVideoFrameCallback / decode need painted frames to fire —
    // this makes the fps measure below dependable. Removed in finally.
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    await new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('Could not read that video.')); });
    let dur = v.duration;
    // MediaRecorder WebM (how in-app athlete clips are recorded) reports
    // duration = Infinity until you force a seek past the end — then the real
    // duration resolves. Do that once before giving up, so reviewed cloud clips
    // (and the inline LIFT METRICS on the same files) don't fail "no duration".
    if (!isFinite(dur) || dur <= 0) {
      await new Promise((res) => {
        const done = () => { v.onseeked = null; res(); };
        v.onseeked = done; setTimeout(done, 1500);
        try { v.currentTime = 1e7; } catch { done(); }
      });
      dur = v.duration;
      try { v.currentTime = 0; } catch { /* noop */ }
    }
    if (!isFinite(dur) || dur <= 0) throw new Error('Could not read that video (no duration).');
    const MAX = 600;                   // frame cap (protects long clips)
    // Sample at the video's TRUE frame rate so every seek lands on a distinct real
    // frame (measured via rVFC). A fixed step below the source frame duration
    // re-reads the same decoded frame under two timestamps → a false zero-velocity
    // pair that under-reads speed and stair-steps tempo; a step above it drops real
    // slow-mo detail. frameDur = 1/fps is the correct cadence; long clips still grow
    // the step to stay within MAX frames. Falls back to ~50fps when fps is unknown.
    const realFps = await measureVideoFps(v);
    try { v.pause(); v.currentTime = 0; } catch { /* noop */ }
    const frameDur = realFps ? 1 / realFps : 0.02;
    const STEP = Math.max(frameDur, dur / MAX);
    const total = Math.min(MAX, Math.max(2, Math.ceil(dur / STEP)));
    const frames = [];
    // Tracks WHICH detected pose is the subject across the whole seek pass —
    // see pickSubjectIdx's comment. Without this, a background gym-goer can
    // steal a frame or two and the tracked wrist/hip "teleports" between two
    // different people, producing a huge fake velocity spike.
    let prevCentroid = null;
    let prevSig = null; // signature of the last KEPT frame — drops exact re-reads
    for (let i = 0; i < total; i++) {
      // +0.001 so the first sample (i=0) never seeks to the already-current
      // position 0 — that assignment fires no 'seeked' event in Chromium and
      // would hang the await forever ("READING THE MOVEMENT…" stuck).
      // Snap the target to the CENTRE of the real frame it lands in (when fps is
      // known), so the seek resolves squarely inside one decoded frame rather than
      // on a boundary where Chromium may pick either neighbour — keeps every
      // captured frame distinct and its timestamp frame-aligned.
      const raw = i * STEP + 0.001;
      const time = realFps
        ? Math.min(dur - 0.001, Math.max(0.001, (Math.floor(raw * realFps) + 0.5) * frameDur))
        : Math.min(dur - 0.001, raw);
      v.currentTime = time;
      // Race the seek against a timeout + error handler so a seek that never
      // resolves (already-current position, undecodable/duplicate target)
      // can't stall the whole capture pass.
      await new Promise((res) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; res(); } };
        v.onseeked = done; v.onerror = done;
        setTimeout(done, 600);
      });
      let r = null;
      try { r = lm.detectForVideo(v, Math.round(time * 1000) + i); } catch {}
      const { idx: si, centroid } = pickSubjectIdx(r?.landmarks, prevCentroid);
      if (si >= 0 && r.worldLandmarks?.[si]) {
        const wl = r.worldLandmarks[si];
        // Exact-duplicate guard: if this seek resolved to the SAME decoded frame
        // as the last kept one, MediaPipe returns bit-identical landmarks. Drop it
        // so a re-read can't fake a zero-velocity pair. A held pose still carries
        // sensor jitter, so exact equality only ever matches a true re-read.
        const sig = [0, 11, 12, 15, 16, 27, 28].map((j) => (wl[j] ? `${wl[j].x},${wl[j].y},${wl[j].z}` : 'x')).join('|');
        if (sig !== prevSig) {
          frames.push({ t: time * 1000, landmarks: r.landmarks?.[si] || null, worldLandmarks: wl });
          prevCentroid = centroid;
          prevSig = sig;
        }
      }
      if (onProgress) onProgress(Math.round(((i + 1) / total) * 100));
    }
    return frames;
  } finally {
    if (lm) try { lm.close(); } catch {}
    if (v) try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch { /* noop */ }
  }
}

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
  initialView = 'all',          // analyze result scope: 'all' | '3d' (skeleton) | 'metrics' (VBT/ROM)
  jumpType = 'cmj',             // jump mode: 'cmj'|'svj'|'sl' (height) · 'drop'|'pogo' (reactive → RSI + contact)
  toolLabel = null,             // header label override (e.g. 'MOVEMENT LAB' vs 'LIFT METRICS')
  facingMode = 'environment',   // filming someone on the floor by default
  onClose,
  onSaveJump,                   // (metrics) => void — wires jump into ath eval
  romSpec = null,               // ROM_CAMERA_AXES entry — when set, analyze mode measures ONE joint axis
  onSaveRom,                    // (clinicalDeg) => void — coach-confirmed ROM into the eval field
  defaultBodyweightKg = null,   // prefill the jump-power bodyweight from the athlete
  initialClipUrl = null,        // a reviewed form-video URL picked in ReviewToolsView → auto-analyse it
  vaultClientId = null,         // athlete id of the picked clip → Bar-Speed Vault (owner trial, localStorage)
  vaultDate = null,             // date of the picked clip → vault entry key
  recordedReps = [],            // the filmed exercise's LOGGED set reps → cross-check the camera count
  targetReps = null,            // the exercise's PRESCRIBED reps (e.g. "8-10") from the plan
}) {
  const videoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const framesRef = useRef([]);
  const recStartRef = useRef(0);
  const analyzeVideoRef = useRef(null);   // results-view playback <video>, for playhead sync

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
  // Source clip URL (remote reviewed clip or uploaded object URL) kept so the
  // results view can show the video next to the analysis, like the Review player.
  const [srcUrl, setSrcUrl] = useState(null);
  const [videoTime, setVideoTime] = useState(0);  // results video currentTime (s), drives the graph playhead
  const setSource = useCallback((u) => { setSrcUrl(prev => { if (prev && prev !== u && prev.startsWith('blob:')) { try { URL.revokeObjectURL(prev); } catch { /* noop */ } } return u; }); }, []);
  useEffect(() => () => { setSrcUrl(cur => { if (cur && cur.startsWith('blob:')) { try { URL.revokeObjectURL(cur); } catch { /* noop */ } } return null; }); }, []);
  // Keep the analyze graphs' playhead synced to the results video's timeline
  // (mirrors the Review player). The camera tools open MovementLab in analyze
  // mode, which previously rendered AnalyzeResult with no playheadT/onScrub —
  // so the graph playhead sat static and scrub-to-seek was dead ("toggler not
  // synced with the video timeline"). A rAF tick reads the video's currentTime.
  useEffect(() => {
    if (phase !== 'results' || !srcUrl) return undefined;
    let raf;
    const tick = () => { const v = analyzeVideoRef.current; if (v) setVideoTime(v.currentTime || 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, srcUrl]);
  const fileInputRef = useRef(null);
  // Which result tab to land on, honouring the tool's scope: the 3D-skeleton
  // tool (Movement Lab) opens straight to the skeleton; the metrics tool (Lift
  // Metrics) opens to velocity; the combined view keeps the old reps→velocity,
  // empty→3D fallback.
  const defaultTab = (repCount) =>
    initialView === '3d' ? 'threeD'
      : initialView === 'metrics' ? 'velocity'
        : (repCount ? 'velocity' : 'threeD');

  // ---- bootstrap + record loop ----
  const recordLoop = useCallback(() => {
    const v = videoRef.current, lm = landmarkerRef.current;
    if (!v || !lm || v.readyState < 2) { rafRef.current = requestAnimationFrame(recordLoop); return; }
    const now = performance.now();
    let res = null;
    try { res = lm.detectForVideo(v, now); } catch { res = null; }
    if (res?.worldLandmarks?.[0]) {
      // Backstop against a forgotten/very-long recording growing unbounded (each
      // frame is 33 landmark objects and analyzeClip does O(n) passes). ~90s at
      // 60fps / 180s at 30fps — far beyond any real set, but caps memory.
      if (framesRef.current.length < 5400) {
        framesRef.current.push({
          t: now - recStartRef.current,
          landmarks: res.landmarks?.[0] || null,
          worldLandmarks: res.worldLandmarks[0],
        });
      }
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
      // Get a fresh camera if we don't have one, then ALWAYS (re)attach it to the
      // current <video> node. On "Record again" the video element was unmounted
      // during results and remounts as a NEW node with no srcObject — the old
      // `if (!streamRef.current)` guard skipped re-attaching, leaving a dead black
      // feed. Re-attaching is idempotent (skips if already the same stream).
      if (!streamRef.current) {
        streamRef.current = await getCamera(facingMode);
      }
      const v = videoRef.current;
      if (v && v.srcObject !== streamRef.current) { v.srcObject = streamRef.current; await v.play(); }
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
      // If the camera opened but pose init (or play) then failed, release the
      // stream — otherwise the camera LED stays on behind the error screen with
      // no control to stop it until unmount.
      if (streamRef.current) { stopStream(streamRef.current); streamRef.current = null; }
      setPhase('idle'); setError(e?.message || 'Could not start the camera.');
    }
  }, [facingMode, beginCapture]);

  // Reactive jumps (drop jump, POGO) need ground-contact + RSI; the rest are
  // flight-time height. One helper so both capture paths branch identically.
  // Auto-detect reactive from the exercise title too — a reviewed "POGO"/"Drop
  // Jump" clip defaults to jumpType 'cmj' and would otherwise be fed to the
  // single-jump reader, which correctly can't read a string of hops.
  const isReactive = jumpType === 'drop' || jumpType === 'pogo'
    || /\b(pogo|drop[-\s]?jump|depth[-\s]?jump|hop|bound|bounce|rebound|reactive|rsi|ankle[-\s]?stiff)\b/i.test(exerciseTitle || '');
  const computeJump = useCallback((frames) => {
    if (isReactive) {
      // If reactive was auto-detected from the title (jumpType still the 'cmj'
      // default), label it as a POGO/RSI read, not "Countermovement Jump".
      const rType = (jumpType === 'drop' || jumpType === 'pogo') ? jumpType : 'pogo';
      const rm = reactiveJumpMetrics(frames);
      return rm ? { reactive: true, jumpType: rType, ...rm.best, count: rm.count, avgRsi: rm.avgRsi, avgContactMs: rm.avgContactMs, avgHeightCm: rm.avgHeightCm } : null;
    }
    const j = jumpMetrics(frames);
    return j ? { reactive: false, jumpType, ...j } : null;
  }, [isReactive, jumpType]);

  const stopAndAnalyze = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // Frames are captured — release the camera so the LED/sensor isn't left on
    // while the coach reviews results (battery/privacy). Cleared so "Record
    // again" gets a fresh stream. (camera audit)
    stopStream(streamRef.current); streamRef.current = null;
    setPhase('analyzing');
    const frames = framesRef.current;
    setTimeout(() => {
      if (mode === 'jump') {
        const j = computeJump(frames);
        setJump(j); setResult({ ok: !!j, frameCount: frames.length, fps: estimateFps(frames) });
        setPhase('results');
      } else {
        const r = analyzeClip(frames, exerciseTitle);
        setResult(r);
        setTab(defaultTab(r.repCount));
        setPhase('results');
      }
    }, 30);
  }, [mode, exerciseTitle, computeJump]);

  // ---- analyze an uploaded clip from the gallery ----
  // Steps through the video by seeking (≈20fps sample, capped) and runs pose
  // on each frame. Uses the 'full' model (more accurate; no real-time budget
  // since this is offline). Reuses the same analyzeClip path as live capture.
  const analyzeUploadedFile = useCallback(async (file) => {
    if (!file) return;
    setError(null); setResult(null); setJump(null); setProgress(0); setPhase('analyzing');
    try {
      const url = URL.createObjectURL(file);
      setSource(url);   // keep it — the results view shows this video next to the analysis
      const frames = await captureClipFrames(url, { onProgress: setProgress });
      framesRef.current = frames;
      if (mode === 'jump') {
        const j = computeJump(frames);
        setJump(j); setResult({ ok: !!j, frameCount: frames.length, fps: estimateFps(frames) });
      } else {
        const res = analyzeClip(frames, exerciseTitle);
        setResult(res); setTab(defaultTab(res.repCount));
      }
      setPhase('results');
    } catch (e) {
      setPhase('idle'); setError(e?.message || 'Could not process that video.');
    }
  }, [mode, exerciseTitle, computeJump, setSource]);

  // ---- analyze a REMOTE reviewed clip (a form-video cloudUrl handed in from
  // ReviewToolsView's picker) ----  Same path as analyzeUploadedFile but the src
  // is already a URL, so no createObjectURL; crossOrigin keeps the frame canvas
  // readable (these cloud clips already serve CORS — the Review inline analyzer
  // reads them the same way).
  const analyzeRemoteUrl = useCallback(async (url) => {
    if (!url) return;
    setError(null); setResult(null); setJump(null); setProgress(0); setPhase('analyzing');
    setSource(url);   // show the clip next to the analysis in results
    try {
      const frames = await captureClipFrames(url, { crossOrigin: true, onProgress: setProgress });
      framesRef.current = frames;
      if (mode === 'jump') {
        const j = computeJump(frames);
        setJump(j); setResult({ ok: !!j, frameCount: frames.length, fps: estimateFps(frames) });
      } else {
        const res = analyzeClip(frames, exerciseTitle);
        setResult(res); setTab(defaultTab(res.repCount));
      }
      setPhase('results');
    } catch (e) {
      setPhase('idle'); setError(e?.message || 'Could not load that clip.');
    }
  }, [mode, exerciseTitle, computeJump, setSource]);

  // When the tool is opened with a pre-picked clip, analyse it once on mount.
  useEffect(() => { if (initialClipUrl) analyzeRemoteUrl(initialClipUrl); }, [initialClipUrl, analyzeRemoteUrl]);

  const pickFile = useCallback(() => fileInputRef.current?.click(), []);

  // Built-in synthetic motion → see the 3D skeleton (and the V1/V2 twist toggle)
  // with no camera, no upload, no pose-detection step. Squat for analyze, jump
  // for jump mode. Lands straight on the 3D tab.
  const loadDemo = useCallback(() => {
    setError(null); setProgress(0); setPhase('analyzing');
    setTimeout(() => {
      if (mode === 'jump') {
        const frames = demoJumpFrames(); framesRef.current = frames;
        const j = computeJump(frames);
        setJump(j); setResult({ ok: !!j, frameCount: frames.length, fps: estimateFps(frames) });
      } else {
        const frames = demoSquatFrames(); framesRef.current = frames;
        const r = analyzeClip(frames, 'Squat'); setResult(r); setTab(defaultTab(r.repCount));
      }
      setPhase('results');
    }, 30);
  }, [mode, computeJump]);

  const reset = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    stopStream(streamRef.current); streamRef.current = null;   // ensure the camera is released
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

  // Portal to <body> — same transform-trap as the Live Coach: this full-screen
  // overlay is rendered inside Review-Tools' `.motion-rise` wrapper whose CSS
  // transform pins position:fixed to that box instead of the viewport.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1500, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 700 }}>
            {(toolLabel || (mode === 'jump' ? 'JUMP TEST' : 'MOVEMENT LAB'))} · {String(exerciseTitle).toUpperCase()}
          </div>
        </div>
        <button onClick={onClose} style={btn('rgba(255,255,255,0.3)', 'transparent')}>← BACK</button>
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

      {/* results — the SOURCE clip (when we have one: a picked reviewed clip or
          an upload) is shown on the LEFT, embedded + scrubbable, next to the
          analysis on the right, mirroring the Review player (Ohad). The video is
          sticky so it stays in view while the metrics/3D scroll. */}
      {phase === 'results' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '64px 16px 16px', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', maxWidth: 1400, margin: '0 auto' }}>
            {srcUrl && (
              <div style={{ flex: '0 0 320px', maxWidth: 340, minWidth: 240, position: 'sticky', top: 0 }}>
                <video ref={analyzeVideoRef} key={srcUrl} src={srcUrl} controls muted playsInline
                  style={{ width: '100%', maxHeight: '76vh', background: '#000', border: '1px solid rgba(255,255,255,0.15)', display: 'block', objectFit: 'contain' }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 300 }}>
              {romSpec && result?.jointRom && (
                <RomConfirm spec={romSpec} jointRom={result.jointRom} onSave={onSaveRom} onClose={onClose} />
              )}
              {mode === 'jump'
                ? <JumpResult jump={jump} result={result} onSave={onSaveJump} onClose={onClose} defaultBodyweightKg={defaultBodyweightKg} />
                : <AnalyzeResult result={result} frames={framesRef.current} exerciseTitle={exerciseTitle} tab={romSpec ? 'rom' : tab} setTab={setTab} view={initialView}
                    vaultClientId={vaultClientId} vaultDate={vaultDate} recordedReps={recordedReps} targetReps={targetReps}
                    playheadT={videoTime * 1000}
                    onScrub={(tMs) => { const v = analyzeVideoRef.current; if (v) { try { v.currentTime = tMs / 1000; } catch { /* noop */ } setVideoTime(tMs / 1000); } }} />}
            </div>
          </div>
        </div>
      )}

      {/* control bar — flexShrink:0 so it's never squeezed off, + safe-area
          bottom padding so the RECORD/UPLOAD buttons never sit flush against the
          very bottom edge (where a taskbar / browser infobar can clip them). */}
      <div style={{ flexShrink: 0, background: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: 14, paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))', display: 'flex', gap: 10 }}>
        {phase === 'idle' && <>
          <BigBtn color={C.ac} onClick={startRecording}>{mode === 'jump' ? 'RECORD' : 'RECORD'} →</BigBtn>
          <button onClick={pickFile} style={{ flex: 1, padding: 14, background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#FFF', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' }}>⬆ UPLOAD CLIP</button>
        </>}
        {phase === 'loading' && <BigBtn color="#555" disabled>STARTING…</BigBtn>}
        {phase === 'countdown' && <BigBtn color="#555" disabled>GET READY… {countdown}</BigBtn>}
        {recording && <BigBtn color={C.rd} onClick={stopAndAnalyze}>STOP &amp; ANALYZE</BigBtn>}
        {(phase === 'results' || phase === 'analyzing') && <BigBtn color={C.ac} onClick={reset}>↺ RECORD AGAIN</BigBtn>}
      </div>
    </div>,
    document.body
  );
}

// ----------------------------- results: analyze -----------------------------
export function AnalyzeResult({ result, frames, exerciseTitle, tab, setTab, view = 'all', vaultClientId = null, vaultDate = null, recordedReps = [], targetReps = null, playheadT = null, onScrub = null }) {
  // First/last-rep trim (Ohad: "I want to be able to set where is the first
  // and last rep, to avoid random movement analyzed into the means") — 1-
  // indexed, inclusive, defaults to the full detected set. Only the MEAN
  // summary stats (velocity/ROM-tempo per-rep tables + KPIs) are recomputed
  // from the trimmed rep slice; the continuous graphs (speed/accel/angle
  // traces) intentionally keep showing the whole clip so the coach can still
  // SEE the excluded reps, just not have them pollute the numbers.
  const [repFrom, setRepFrom] = useState(1);
  const [repTo, setRepTo] = useState(null); // null = "to the end", tracks repCount live
  const [vaultSaved, setVaultSaved] = useState(false); // Bar-Speed Vault: this clip logged to the athlete's trend
  const [load, setLoad] = useState(''); // kg for this filmed set → same-load readiness + load-aware trend
  const loadNum = Number(load) > 0 ? Number(load) : null;
  // Warm-up readiness: today's bar speed vs the athlete's established speed at
  // this SAME load (from the vault). The "Perch from a phone" between-session read.
  const readiness = useMemo(() => {
    const tv = result?.velocity?.bestMean;
    if (!(vaultClientId && loadNum && tv > 0)) return null;
    if (result?.captureQuality?.grade === 'poor') return null; // a bad clip's m/s is wrong — never act on it
    return warmupReadiness(tv, getLoadVelocityRef(vaultClientId, exerciseTitle, loadNum, vaultDate));
  }, [vaultClientId, loadNum, result, exerciseTitle, vaultDate]);
  useEffect(() => { setRepFrom(1); setRepTo(null); setVaultSaved(false); }, [frames]);
  const repCount = result?.repCount || 0;
  const effTo = repTo == null ? repCount : Math.min(repTo, repCount);
  const effFrom = Math.min(Math.max(1, repFrom), effTo || 1);
  const trimmed = effFrom > 1 || (repTo != null && effTo < repCount);
  const trimmedVelocity = useMemo(() => {
    if (!result?.ok || !trimmed || !frames) return result?.velocity ?? null;
    const slice = result.reps.slice(effFrom - 1, effTo);
    if (!slice.length) return null;
    const { angle } = channelSignal(frames, exerciseTitle);
    return velocityMetrics(frames, angle, slice);
  }, [result, trimmed, effFrom, effTo, frames, exerciseTitle]);
  const trimmedRomTempo = useMemo(() => {
    if (!result?.ok || !trimmed || !frames) return result?.romTempo ?? null;
    const slice = result.reps.slice(effFrom - 1, effTo);
    if (!slice.length) return null;
    const { angle } = channelSignal(frames, exerciseTitle);
    return romTempoMetrics(frames, angle, slice);
  }, [result, trimmed, effFrom, effTo, frames, exerciseTitle]);
  if (!result?.ok) return <Empty msg="Couldn't read a clean pose from that clip. Re-film side-on with the full body in frame." />;
  // The Movement-Lab/Lift-Metrics split: '3d' shows only the skeleton, 'metrics'
  // shows only velocity + ROM, 'all' keeps everything (Ohad 2026-06-15 —
  // velocity/ROM no longer live under Movement Lab).
  const allTabs = [
    // Label is "SPEED & ACCEL", not "VELOCITY" — the tab holds three distinct
    // sub-graphs (instantaneous speed, acceleration, and per-rep mean velocity)
    // and calling the whole tab "velocity" read as if speed/velocity were two
    // names for the same thing (Ohad 2026-07-04).
    { k: 'velocity', label: 'SPEED & ACCEL', on: result.repCount > 0 },
    { k: 'rom', label: 'ROM & TEMPO', on: result.repCount > 0 },
    { k: 'form', label: 'FORM CHECK', on: result.repCount > 0 },
    { k: 'threeD', label: '3D ANATOMY', on: true },
  ];
  const tabs = view === '3d' ? allTabs.filter(t => t.k === 'threeD')
    : view === 'metrics' ? allTabs.filter(t => t.k !== 'threeD')
      : allTabs;
  return (
    // Wide column so the results use the page (was a cramped 560px box with huge
    // side margins on the coach screen). The 3D canvas stays centered inside.
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      {tabs.length > 1 && <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
        {tabs.map(t => {
          // Longhand borders (not `border` shorthand + `borderLeft`) — mixing the
          // two makes React re-apply them in a non-deterministic order on rerender
          // (a styling bug + a console warning). Same visual: edge on 3 sides, the
          // shared seam open on the left so adjacent tabs merge.
          const bc = `1px solid ${tab === t.k ? C.ac : 'rgba(255,255,255,0.18)'}`;
          return (
          <button key={t.k} disabled={!t.on} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: '9px 6px', background: tab === t.k ? C.ac : 'transparent',
            color: t.on ? '#FFF' : 'rgba(255,255,255,0.35)',
            borderTop: bc, borderRight: bc, borderBottom: bc, borderLeft: 'none',
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: t.on ? 'pointer' : 'default',
          }}>{t.label}</button>
          );
        })}
      </div>}
      {result.captureQuality && result.captureQuality.grade !== 'good' && (
        <div style={{
          fontFamily: FN, fontSize: 11, lineHeight: 1.5, letterSpacing: '0.02em', marginBottom: 12,
          padding: '8px 12px', borderRadius: 0,
          border: `1px solid ${result.captureQuality.grade === 'poor' ? (C.warn || '#f0b429') : 'rgba(255,255,255,0.18)'}`,
          background: result.captureQuality.grade === 'poor' ? 'rgba(240,180,41,0.08)' : 'rgba(255,255,255,0.03)',
          color: result.captureQuality.grade === 'poor' ? (C.warn || '#f0b429') : 'rgba(255,255,255,0.6)',
        }} title={`Body detected in ${Math.round(result.captureQuality.coverage * 100)}% of frames${result.captureQuality.meanVis != null ? ` · mean landmark visibility ${result.captureQuality.meanVis}` : ''}. Markerless 2D pose degrades with cropping, side-angle, motion blur or low light.`}>
          <b style={{ letterSpacing: '0.06em' }}>{result.captureQuality.grade === 'poor' ? 'LOW CAPTURE QUALITY' : 'CAPTURE OK'}</b> · {result.captureQuality.note}
        </div>
      )}
      <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 12 }}>
        {result.repCount} REP{result.repCount === 1 ? '' : 'S'} · {result.fps}fps · {result.frameCount} frames
        {result.countMethod === 'flight' && (
          <span style={{ color: C.pu || '#8b7cf0' }} title={`Counted from the flight phase (jumps/hops) — the tracked joint barely moves on ballistic work, so the joint counter saw only ${result.jointRepCount}. Per-rep bar-speed/ROM below still track the joint.`}>
            {' · '}from flight
          </span>
        )}
        {result.rejectedReps?.length > 0 && (
          <span style={{ color: C.warn || '#f0b429' }} title="Shallow dips, walkouts or re-racks — too small to be full reps, so they're excluded from the count and the metrics.">
            {' · '}{result.rejectedReps.length} not counted
          </span>
        )}
        {(() => {
          // A counted "rep" whose bar path NET-DESCENDED (mean concentric clearly
          // negative) is a bar drop / re-rack, not a working rep — the joint
          // segmenter counts it but it isn't a lift. Flag it honestly rather than
          // silently inflate the count (velocity already excludes it; #87).
          const drops = (result.velocity?.perRep || []).filter((r) => r && typeof r.meanConcentric === 'number' && r.meanConcentric < -0.2).length;
          return drops > 0 ? (
            <span style={{ color: C.warn || '#f0b429' }} title="The bar net-descended on this rep (negative mean concentric velocity) — a bar drop / re-rack the joint counter picked up, not a working rep. Excluded from the bar-speed reads.">
              {' · '}{drops} {drops === 1 ? 'looks' : 'look'} like a bar drop
            </span>
          ) : null;
        })()}
      </div>
      {!(result.repCount > 0) && (
        <div style={{ fontFamily: FN, fontSize: 12.5, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.02em', marginBottom: 14, lineHeight: 1.6, padding: '9px 12px', border: `1px solid ${C.bd}`, background: C.sf2 }}>
          <b style={{ color: '#fff', letterSpacing: '0.04em' }}>No distinct reps detected.</b> Likely an isometric hold (nothing to count), or the movement was too small / too off-angle for the camera to segment — a prone push-up or a lateral drill can read flat to a front camera. Bar-speed, tempo and set-quality all need counted reps, so those tabs stay empty; the rotatable skeleton in MOVEMENT LAB still works.
        </div>
      )}
      {/* Count cross-check — the camera count vs what the athlete actually
          LOGGED for this exercise. Honest reliability signal: a big gap means
          trust his log, not the camera (fast plyos / lateral work under-count). */}
      {(() => {
        const rec = (recordedReps || []).filter((n) => typeof n === 'number' && n > 0);
        const tgt = (targetReps != null && /\d/.test(String(targetReps))) ? String(targetReps).trim() : null;
        if (!rec.length && !tgt) return null;
        if (!(result.repCount > 0)) return null;
        const N = result.repCount;
        const sum = rec.reduce((a, b) => a + b, 0);
        // Match against an individual SET (a form clip is one set) — NOT the sum.
        // A camera count that merely equals the multi-set total is a coincidence,
        // not a verified match, so it must NOT read green (adversarial-review #1).
        const perSet = rec.some((x) => Math.abs(N - x) <= 1);
        const sumMatch = rec.length > 1 && Math.abs(N - sum) <= 1;
        const low = rec.length && N < Math.min(...rec) - 1;
        let verdict, col;
        if (!rec.length) { verdict = `camera counted ${N}`; col = C.tm; }
        else if (perSet) { verdict = '✓ camera matches his log'; col = C.gn; }
        else if (sumMatch) { verdict = `≈ all sets (${sum} logged in total)`; col = C.tm; }
        else if (low) { verdict = `⚠ camera counted ${N} — likely missed reps, trust his log`; col = (C.warn || '#f0b429'); }
        else { verdict = `⚠ camera counted ${N} — check the clip`; col = (C.warn || '#f0b429'); }
        return (
          <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em', marginBottom: 12, marginTop: -6 }}>
            {tgt && <>target <b style={{ color: '#fff' }}>{tgt}</b>{rec.length ? ' · ' : ' '}</>}
            {rec.length > 0 && <>logged <b style={{ color: '#fff' }}>{rec.join('·')}</b> · </>}
            <span style={{ color: col, fontWeight: 700 }}>{verdict}</span>
          </div>
        );
      })()}
      {/* Bar-Speed Vault — persist this set's velocity/ROM to the athlete's
          trend so the Lineage can plot a per-lift velocity-fatigue line. Owner
          trial, this device; only offered when there's real camera velocity. */}
      {vaultClientId && result.velocity && typeof result.velocity.bestMean === 'number' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>LOAD
              <input type="number" min={0} step={0.5} value={load} onChange={(e) => setLoad(e.target.value)} placeholder="kg"
                style={{ width: 56, marginLeft: 6, textAlign: 'center', background: 'transparent', border: `1px solid ${C.bd}`, color: '#FFF', fontFamily: FN, fontSize: 11, padding: '4px 4px' }}
                title="Weight on the bar for this set (kg). Enter it to unlock same-load readiness + a load-aware trend." />
            </label>
            {result?.captureQuality?.grade === 'poor' ? (
              <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.06em', color: C.or || '#f0b429', border: `1px solid ${C.or || '#f0b429'}`, padding: '6px 12px', display: 'inline-block', lineHeight: 1.4 }} title="This clip tracked poorly — the numbers aren't reliable enough to become a trend point. Refilm cleaner to log it.">CLIP TOO ROUGH TO TREND · REFILM TO LOG</span>
            ) : vaultSaved ? (
              <span style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.1em', color: C.gn, border: `1px solid ${C.gn}`, padding: '6px 12px', display: 'inline-block' }}>✓ SAVED TO {exerciseTitle.toUpperCase()} TREND{loadNum ? ` @ ${loadNum}KG` : ''}</span>
            ) : (
              <button type="button"
                onClick={() => { const e = savePoseMetric({ clientId: vaultClientId, exercise: exerciseTitle, date: vaultDate, analysis: result, load: loadNum }); if (e) setVaultSaved(true); }}
                style={{ fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: C.ac, background: 'transparent', border: `1px solid ${C.ac}`, padding: '6px 12px', cursor: 'pointer', borderRadius: 0 }}
                title="Log this set's bar speed, ROM + left/right symmetry (and load, if entered) to the athlete's Analysis trends — feeds the velocity-fatigue line, the injury-drift timeline, and same-load readiness (owner trial, this device).">
                ↑ SAVE TO TREND
              </button>
            )}
          </div>
          {readiness && (
            <div style={{ marginTop: 10, padding: '9px 12px', border: `1px solid ${readiness.tone === 'bad' ? C.rd : readiness.tone === 'warn' ? (C.or || '#f0b429') : C.gn}`, background: readiness.tone === 'bad' ? 'rgba(255,90,90,0.06)' : readiness.tone === 'warn' ? 'rgba(240,180,41,0.06)' : 'rgba(80,220,140,0.06)' }}>
              <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.12em', color: readiness.tone === 'bad' ? C.rd : readiness.tone === 'warn' ? (C.or || '#f0b429') : C.gn, marginBottom: 4 }}>
                READINESS CUE · <b>{readiness.deltaPct >= 0 ? '+' : ''}{readiness.deltaPct}%</b> vs his {readiness.load}kg norm
              </div>
              <div style={{ fontFamily: FN, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{readiness.verdict}</div>
              <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginTop: 4, lineHeight: 1.5 }}>
                Today {readiness.todayVel} m/s vs his median {readiness.refVel} m/s at {readiness.load}kg{readiness.refReps ? ` · ~${readiness.refReps} reps` : ''} ({readiness.n} prior {readiness.n === 1 ? 'set' : 'sets'}, last {readiness.lastDate}).
                {readiness.lowConf ? ' Only 1–2 prior films — treat lightly.' : ''} Phone bar-speed shifts ~5–10% with camera angle/distance, so this only means something if you film from the same spot — it's a soft cue to sense-check by feel/RPE, never a set-cutting rule.
              </div>
            </div>
          )}
          {loadNum && !readiness && !vaultSaved && result?.captureQuality?.grade !== 'poor' && (
            <div style={{ fontFamily: FN, fontSize: 10, color: C.td, marginTop: 8, lineHeight: 1.5 }}>No prior {loadNum}kg set on {exerciseTitle} yet — save this one, and next time you film {loadNum}kg you'll get a readiness read vs today.</div>
          )}
        </div>
      )}
      {(tab === 'velocity' || tab === 'rom') && repCount > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', flexWrap: 'wrap' }}>
          <span>ANALYZE REPS</span>
          <input type="number" min={1} max={effTo} value={effFrom}
            onChange={e => setRepFrom(Math.max(1, Math.min(effTo, Number(e.target.value) || 1)))}
            style={{ width: 36, textAlign: 'center', background: 'transparent', border: `1px solid ${C.bd}`, color: '#FFF', fontFamily: FN, fontSize: 10, padding: '3px 2px' }} />
          <span>–</span>
          <input type="number" min={effFrom} max={repCount} value={effTo}
            onChange={e => setRepTo(Math.max(effFrom, Math.min(repCount, Number(e.target.value) || repCount)))}
            style={{ width: 36, textAlign: 'center', background: 'transparent', border: `1px solid ${C.bd}`, color: '#FFF', fontFamily: FN, fontSize: 10, padding: '3px 2px' }} />
          <span>OF {repCount}</span>
          {trimmed && (
            <button type="button" onClick={() => { setRepFrom(1); setRepTo(null); }}
              style={{ fontFamily: FN, fontSize: 9, color: C.ac, background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', textDecoration: 'underline' }}>
              RESET
            </button>
          )}
        </div>
      )}
      {tab === 'velocity' && <VelocityTable v={trimmedVelocity} barSpeed={result.barSpeed} frames={frames} playheadT={playheadT} onScrub={onScrub} velLoss={isVelocityLossLift(exerciseTitle)} />}
      {tab === 'rom' && <RomTable r={trimmedRomTempo} jointRom={result.jointRom} kind={result.kind} frames={frames} exerciseTitle={exerciseTitle} playheadT={playheadT} onScrub={onScrub} />}
      {tab === 'form' && <FormCheck result={result} exerciseTitle={exerciseTitle} recordedReps={recordedReps} targetReps={targetReps} />}
      {tab === 'threeD' && (
        <Suspense fallback={<div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: 30, fontFamily: FN, fontSize: 12, letterSpacing: '0.12em' }}>LOADING 3D…</div>}>
          <AnatomyViewer frames={frames} />
        </Suspense>
      )}
    </div>
  );
}

// FORM CHECK — auto form-fault coach + left/right symmetry screen, both read
// straight off the pose the camera already produced (src/poseInsights.js).
function FormCheck({ result, exerciseTitle, recordedReps = [], targetReps = null }) {
  const faults = useMemo(() => detectFaults(result, exerciseTitle), [result, exerciseTitle]);
  // Is this clip likely MORE THAN ONE set? The set-breakdown + auto-coach reads
  // below all assume a single set (each rep compared to the set's best); across
  // multiple sets/legs that overstates "fatigue" (set 2 vs set 1's peak). Flag it
  // when the camera count doesn't match any single logged set and exceeds the
  // largest one (or ≈ the multi-set total) — same signal as the count cross-check.
  const multiSet = useMemo(() => {
    const rec = (recordedReps || []).filter((n) => typeof n === 'number' && n > 0);
    const N = result?.repCount || 0;
    if (!(N > 2) || rec.length < 1) return false;
    const perSet = rec.some((x) => Math.abs(N - x) <= 1);
    if (perSet) return false; // matches a single logged set → it's one set, no caveat
    const sum = rec.reduce((a, b) => a + b, 0);
    const maxSet = Math.max(...rec);
    const sumMatch = rec.length > 1 && Math.abs(N - sum) <= Math.max(2, Math.round(sum * 0.2));
    return sumMatch || N > maxSet + Math.max(2, Math.round(maxSet * 0.4));
  }, [result, recordedReps]);
  // On a multi-set clip the ROM-collapse fault ("N reps lost >15% of range →
  // depth is fading") is relative to the clip's single best rep, so across sets it
  // over-reads exactly like the SET BREAKDOWN did (which now carries the multi-set
  // caveat). Drop that one fault when multiSet — the caveat above already explains
  // the across-sets read; the other faults (fast eccentric, geometry) still stand.
  const coachFaults = useMemo(() => {
    if (!faults || !multiSet) return faults;
    return { ...faults, faults: (faults.faults || []).filter((f) => !/lost >\s*15%\s*of range/i.test(f.msg || '')) };
  }, [faults, multiSet]);
  const asym = useMemo(() => detectAsymmetry(result.jointRom, exerciseTitle), [result.jointRom, exerciseTitle]);
  const vbt = useMemo(() => velocityAutoreg(result.velocity), [result.velocity]);
  // A poorly-tracked clip makes the velocity + L/R reads untrustworthy (2D
  // asymmetry especially needs a clean frontal/steady view). Caveat them rather
  // than present confident numbers off garbage pose.
  const lowCap = result?.captureQuality?.grade === 'poor';
  // Only a 'good' clip has frame-timings solid enough for a confident tempo/TUT
  // physiological label — a 'fair' clip dropped up to ~30% of frames, which is
  // exactly what corrupts the phase durations those numbers are built from.
  const capGood = result?.captureQuality?.grade === 'good';
  // Measured tempo (median ecc / pause / con across the set, seconds) — coaches
  // PRESCRIBE tempo but never see what the athlete actually did. Straight from
  // romTempoMetrics, no new data. Written eccentric-first (the coach's notation).
  const tempo = useMemo(() => {
    const rr = result?.romTempo?.perRep;
    if (!rr) return null;
    // ecc/con of ~0 = a sub-frame or mis-segmented phase, not a real fast tempo —
    // exclude it so "0.0s" never reads as what he actually did. A 0 pause IS real
    // (touch-and-go), so pause keeps zeros.
    const med = (k, min) => { const xs = rr.filter(Boolean).map((r) => r[k]).filter((x) => typeof x === 'number' && x >= min).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null; };
    const ecc = med('ecc', 0.05), pause = med('pause', 0), con = med('con', 0.05);
    if (ecc == null && con == null) return null;
    // Time-under-tension: total working time of the set = Σ(ecc+pause+con) over
    // reps. A real hypertrophy/tempo lever coaches track, straight from the data.
    const reps = rr.filter(Boolean);
    // Plausibility ceilings per phase — a duration longer than this is a detector
    // stall (frozen landmarks read as one long "pause"), NOT real time-under-
    // tension. Exclude the implausible phase rather than let one 8s freeze inflate
    // the sum past 40s and flip the label to "deep hypertrophy range". Velocity is
    // clamped the same way (MAX_SPEED_MPS); TUT had no ceiling until now.
    const CAP = { ecc: 8, pause: 6, con: 8 };
    let tut = 0, tutClean = true;
    for (const r of reps) { for (const k of ['ecc', 'pause', 'con']) { const v = r[k]; if (typeof v === 'number' && v > 0) { if (v <= CAP[k]) tut += v; else tutClean = false; } } }
    return { ecc, pause, con, tut: tut > 0 ? Math.round(tut) : null, reps: reps.length, tutClean };
  }, [result]);
  const sev = { bad: C.rd, warn: C.or, high: C.rd, mod: C.or, ok: C.gn };
  const secLabel = { fontFamily: FN, fontSize: 10, letterSpacing: '0.14em', color: C.ac, marginBottom: 8 };
  const rowBase = { display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.bd}`, fontFamily: FN, fontSize: 13, lineHeight: 1.5 };
  // Set Breakdown — per-rep quality strip. Each rep's quality = the weaker of
  // its ROM retention (romPct) and its velocity retention (100 − loss%), so a
  // rep that either got shallow OR slow reads as degraded. Shows the coach
  // exactly WHICH rep the set fell apart on, from data analyzeClip already has.
  const repQuality = useMemo(() => {
    const rt = result?.romTempo?.perRep, vel = result?.velocity?.perRep;
    if (!rt || !rt.length) return null;
    return rt.map((r, i) => {
      if (!r) return null;
      const romPct = typeof r.romPct === 'number' ? r.romPct : 100;
      const rawLoss = vel && vel[i] && typeof vel[i].lossPct === 'number' ? vel[i].lossPct : null;
      const hasVel = rawLoss != null;
      // No readable velocity (occlusion / no positive concentric) → judge the rep
      // on ROM alone. NEVER default to 100% "speed retained" — that turned an
      // occluded slow grind into a green "speed held" and always blamed "depth".
      const velRet = hasVel ? 100 - Math.min(99, Math.max(0, rawLoss)) : null;
      const q = hasVel ? Math.min(romPct, velRet) : romPct;
      return { rep: i + 1, q, romPct, velRet: hasVel ? Math.round(velRet) : null, hasVel, collapsed: !!r.collapsed };
    }).filter(Boolean);
  }, [result]);
  // One-line coach synthesis of the Set Breakdown — WHERE the set turned into
  // grinding, and whether depth or bar speed led the drop. Pure read of the
  // already-computed per-rep quality; no new measurement.
  const breakdown = useMemo(() => {
    if (!repQuality || repQuality.length < 3) return null;
    const n = repQuality.length;
    // Fatigue accrues AFTER the best-quality rep — a low OPENING rep is usually
    // ramp-up (getting up to speed), not a break. Scan from the peak only, so a
    // slow first rep never reads as "down from rep 1 / not fresh".
    let peakIdx = 0, peakQ = -Infinity;
    repQuality.forEach((r, i) => { if (r.q > peakQ) { peakQ = r.q; peakIdx = i; } });
    let brk = -1;
    for (let i = peakIdx + 1; i < n; i++) {
      const rest = repQuality.slice(i);
      const avg = rest.reduce((s, r) => s + r.q, 0) / rest.length;
      if (repQuality[i].q < 82 && avg < 82) { brk = i; break; } // first post-peak rep from which the rest stays soft
    }
    if (brk < 0) return { held: true };
    const r = repQuality[brk];
    // Only attribute the fade to depth vs bar speed when we actually READ velocity
    // on that rep — otherwise leave it unattributed rather than blame "depth".
    return { held: false, brkRep: brk + 1, lead: r.hasVel ? (r.romPct <= r.velRet ? 'depth' : 'bar speed') : null };
  }, [repQuality]);
  const qColor = (q) => (q >= 85 ? C.gn : q >= 70 ? (C.or || '#f0b429') : C.rd);

  return (
    <div style={{ fontFamily: FN }}>
      {lowCap && (
        <div style={{ fontFamily: FN, fontSize: 11, color: C.or || '#f0b429', letterSpacing: '0.02em', marginBottom: 16, lineHeight: 1.5, padding: '8px 12px', border: `1px solid ${C.or || '#f0b429'}`, background: 'rgba(240,180,41,0.08)' }}>
          <b style={{ letterSpacing: '0.06em' }}>LOW CAPTURE QUALITY</b> — everything in this tab is a rough read off an imperfect clip, not a verdict. Refilm cleaner (whole body, straight-on or clean side, steady) to trust it.
        </div>
      )}
      {repQuality && repQuality.length >= 2 && (
        <div style={{ marginBottom: 20 }}>
          <div style={secLabel}>SET BREAKDOWN <span style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: 0 }}>· where it held, where it broke</span></div>
          {multiSet && (
            <div style={{ fontFamily: FN, fontSize: 11, color: C.or || '#f0b429', lineHeight: 1.5, marginBottom: 8, padding: '6px 10px', border: `1px solid ${C.or || '#f0b429'}`, background: 'rgba(240,180,41,0.07)' }}>
              This clip looks like <b>more than one set</b> — the read below compares every rep to the single best one, so across sets (or both sides of a unilateral lift) it overstates the fatigue drop. For a clean within-set read, load one set.
            </div>
          )}
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            {repQuality.map((r) => (
              <div key={r.rep} title={`Rep ${r.rep}: ${r.romPct}% range${r.hasVel ? `, ${r.velRet}% speed retained` : ', speed not readable'}`} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 26, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(18, r.q)}%`, background: qColor(r.q), borderRadius: '2px 2px 0 0' }} />
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{r.rep}</div>
              </div>
            ))}
          </div>
          {breakdown && breakdown.held && (
            <div style={{ fontSize: 12.5, color: C.gn, marginTop: 8, lineHeight: 1.5 }}>No rep-to-rep drop-off — range and speed held across the set.</div>
          )}
          {breakdown && !breakdown.held && (
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 8, lineHeight: 1.5 }}>Clean through rep <b style={{ color: '#fff' }}>{breakdown.brkRep - 1}</b>, then {breakdown.lead ? <><b style={{ color: '#fff' }}>{breakdown.lead}</b> started to fade</> : 'his reps started to fade'} — that's where it turned into grinding. {breakdown.lead === 'depth' ? 'Cut the set a rep or two earlier to keep range honest.' : breakdown.lead === 'bar speed' ? 'Past here the reps are fatigue, not power — stop earlier if speed is the goal.' : 'Stop the set around there if clean reps were the goal.'}</div>
          )}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>Bar height = rep quality (the weaker of range kept + speed kept). Green held · amber softened · red broke down.</div>
        </div>
      )}
      <div style={secLabel}>AUTO FORM COACH</div>
      {coachFaults && coachFaults.faults.length === 0 && coachFaults.good.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Not enough clean reps to read technique on this clip.</div>
      )}
      {coachFaults && coachFaults.faults.map((f, i) => (
        <div key={'f' + i} style={rowBase}>
          <span style={{ color: sev[f.sev], fontWeight: 700, flex: '0 0 16px', textAlign: 'center' }}>{f.sev === 'bad' ? '✕' : '!'}</span>
          <div><b style={{ color: '#fff' }}>{f.msg}.</b> <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{f.why}</span></div>
        </div>
      ))}
      {coachFaults && coachFaults.good.map((g, i) => (
        <div key={'g' + i} style={rowBase}>
          <span style={{ color: C.gn, fontWeight: 700, flex: '0 0 16px', textAlign: 'center' }}>✓</span>
          <div style={{ color: 'rgba(255,255,255,0.85)' }}>{g}</div>
        </div>
      ))}

      {tempo && (
        <>
          <div style={{ ...secLabel, marginTop: 22 }}>TEMPO <span style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: 0 }}>· what he actually did ({tempo.reps >= 2 ? 'median rep' : 'single rep'})</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['eccentric', tempo.ecc, 'lowering'], ['pause', tempo.pause, 'bottom'], ['concentric', tempo.con, 'lifting']].map(([lab, v, sub]) => (
              <div key={lab} style={{ flex: '1 1 0', minWidth: 90, border: `1px solid ${C.bd}`, background: C.sf2, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ac, fontWeight: 700 }}>{lab}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 3 }}>{v != null ? `${v.toFixed(1)}s` : '—'}</div>
                <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
          {tempo.tut != null && tempo.reps >= 2 && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8, fontFamily: FN }}>Time under tension · <b style={{ color: '#fff' }}>{tempo.tut}s</b> <span style={{ color: C.td }}>across {tempo.reps} reps {(capGood && tempo.tutClean) ? (tempo.tut >= 40 ? '· deep hypertrophy range' : tempo.tut >= 20 ? '· solid TUT' : '· short — more of a strength/speed set') : '· rough read (clip quality)'}</span></div>
          )}
          <div style={{ fontSize: 10, color: C.td, marginTop: 8, lineHeight: 1.5 }}>Measured off the camera, not prescribed — compare it to the tempo you wrote. A fast eccentric ({'<'}1s) is the usual leak.</div>
        </>
      )}

      {/* Velocity-LOSS stop-set cutoffs are a GRINDING-lift fatigue read — hide
          them for a ballistic/reactive drill that slipped the jump router (a
          snap-down, generic jump, snatch, throw): a "40% loss · stop the set"
          there is nonsense. Raw velocity + ROM + technique above still show. (#172) */}
      {vbt && isVelocityLossLift(exerciseTitle) && (
        <>
          <div style={{ ...secLabel, marginTop: 22 }}>STOP-SET · BAR SPEED <span style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: 0 }}>· where the set stopped being what it was for</span></div>
          <div style={{ fontFamily: FN, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
            He did <b style={{ color: '#fff' }}>{vbt.total} reps</b>{vbt.finalLoss != null ? <> · bar speed dropped <b style={{ color: vbt.finalLoss >= 30 ? C.rd : vbt.finalLoss >= 20 ? (C.or || '#f0b429') : C.gn }}>{vbt.finalLoss >= 90 ? '90%+' : `${Math.round(vbt.finalLoss)}%`}</b> by the last one</> : null}.
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['power', vbt.powerRep, C.pu || '#8b7cf0', 'keep it fast'], ['strength', vbt.generalRep, C.ac, 'general'], ['size', vbt.hyperRep, C.gn, 'hypertrophy']].map(([goal, rep, col, sub]) => (
                <div key={goal} style={{ flex: '1 1 0', minWidth: 96, border: `1px solid ${C.bd}`, background: C.sf2, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: col, fontWeight: 700 }}>{goal}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 3 }}>{rep ? `stop @ rep ${rep}` : `all ${vbt.total} fine`}</div>
                  <div style={{ fontSize: 10, color: C.td, marginTop: 2 }}>{goal === 'power' ? '20% speed lost' : goal === 'strength' ? '30% lost' : '40% lost'}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: C.td, marginTop: 8, lineHeight: 1.5 }}>≤20% velocity-loss keeps a set explosive (protects power + jump carry-over); past ~40% it's only hypertrophy. Camera velocity — use it for the trend + cutoff, not an exact 1RM.</div>
          </div>
        </>
      )}

      <div style={{ ...secLabel, marginTop: 22 }}>LEFT / RIGHT SYMMETRY</div>
      {asym && asym.unilateral &&<div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, lineHeight: 1.5, fontFamily: FN }}>{asym.note}</div>}
      {!asym && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>No paired joints tracked cleanly on this clip.</div>}
      {asym && !asym.unilateral && asym.rows.map((r) => {
        const mx = Math.max(r.left, r.right) || 1;
        const lCol = r.weaker === 'Left' ? sev[r.severity] : C.ac;
        const rCol = r.weaker === 'Right' ? sev[r.severity] : C.ac;
        return (
          <div key={r.joint} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.bd}`, fontFamily: FN }}>
            <div style={{ width: 74, fontSize: 13, color: '#fff' }}>{r.joint}</div>
            <span style={{ width: 34, textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{r.left}°</span>
            <div style={{ flex: 1, display: 'flex', height: 10, alignItems: 'stretch' }}>
              <div style={{ width: '50%', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: `${(r.left / mx) * 100}%`, background: lCol, opacity: r.weaker === 'Left' ? 1 : 0.55, borderRadius: '2px 0 0 2px' }} />
              </div>
              <div style={{ width: 1, background: C.bd }} />
              <div style={{ width: '50%' }}>
                <div style={{ width: `${(r.right / mx) * 100}%`, height: '100%', background: rCol, opacity: r.weaker === 'Right' ? 1 : 0.55, borderRadius: '0 2px 2px 0' }} />
              </div>
            </div>
            <span style={{ width: 34, fontSize: 11, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{r.right}°</span>
            <div style={{ width: 96, textAlign: 'right', fontSize: 11, color: sev[r.severity], fontWeight: r.severity === 'ok' ? 400 : 700 }}>
              {r.severity === 'ok' ? 'balanced' : `${r.asymPct}% ${r.weaker.toLowerCase()}↓`}
            </div>
          </div>
        );
      })}
      {asym && asym.flagged.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.or, lineHeight: 1.5, fontFamily: FN }}>
          {asym.worst.joint} travel {asym.worst.asymPct}% less on the {asym.worst.weaker.toLowerCase()} — worth screening in person before loading it heavier.
        </div>
      )}
      <div style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, fontFamily: FN }}>{faults?.note || asym?.note}</div>
    </div>
  );
}

function VelocityTable({ v, barSpeed, frames, playheadT = null, onScrub = null, velLoss = true }) {
  // GRAPH toggle — three DISTINCT graphs, deliberately not overlapping names
  // (Ohad 2026-07-04: "velocity and speed are the same thing" was a fair
  // complaint about the old two-pill picker):
  //   SPEED         — instantaneous |velocity| of the tracked point, over time.
  //   ACCELERATION  — its time-derivative (signed — shows deceleration too).
  //   MEAN VELOCITY — one number per rep (the VBT fatigue bars), a genuinely
  //                   different metric (a per-rep summary, not a continuous trace).
  const [graph, setGraph] = useState('speed');
  // Pinch-zoom window on the time axis, SHARED between SPEED and ACCELERATION
  // (they're the same timeline) so flipping tabs doesn't lose your zoom. null =
  // full clip. Reset whenever a new clip is analyzed.
  const [zoom, setZoom] = useState(null);
  useEffect(() => { setZoom(null); }, [frames]);
  // TRACKED POINT for the speed/accel traces: BAR = wrists (a loaded
  // barbell/dumbbell rides the wrists) · BODY = hips (bodyweight work / no
  // bar). All speeds are VERTICAL only. Recomputed live from the captured frames.
  const [point, setPoint] = useState('wrist');
  const trace = React.useMemo(
    () => (point === 'wrist' ? (barSpeed || (frames && barSpeedSeries(frames, 'wrist'))) : (frames && barSpeedSeries(frames, 'hip'))),
    [point, barSpeed, frames]
  );
  const accelTrace = React.useMemo(
    () => frames && barAccelSeries(frames, point),
    [point, frames]
  );
  if (!v) return <Empty msg="No reps detected to measure velocity." />;
  const pill = (k, label, sel, on) => (
    <button key={k} type="button" onClick={on}
      style={{
        fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 10px',
        borderRadius: 0, cursor: 'pointer', textTransform: 'uppercase',
        border: `1px solid ${sel ? C.ac : 'rgba(255,255,255,0.2)'}`,
        background: sel ? `${C.ac}22` : 'transparent',
        color: sel ? C.ac : 'rgba(255,255,255,0.5)',
      }}>{label}</button>
  );
  // TRACK (BAR·WRISTS / BODY·HIPS) is a SUB-level pick nested under the
  // primary SPEED/ACCEL/MEAN-VELOCITY tabs above — same box-pill for both
  // read as one flat row of equal-weight choices (Ohad: "should be displayed
  // differently... think have we used anything like this elsewhere"). The
  // app's own established convention for a nested sub-toggle is the
  // underline tab (no box, no fill, just a bottom border) — TraineeCRM's
  // COACH HISTORY ACTIONS/ACTIVITY switch and ClientPortal's nav rows both
  // use exactly this for a secondary toggle under a primary one. Reusing it
  // here instead of inventing a new one-off style.
  const trackPill = (k, label, sel, on) => (
    <button key={k} type="button" onClick={on}
      style={{
        fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '4px 2px',
        marginRight: 16, border: 'none', background: 'transparent', borderRadius: 0,
        borderBottom: `2px solid ${sel ? C.ac : 'transparent'}`,
        color: sel ? C.ac : 'rgba(255,255,255,0.5)',
        cursor: 'pointer', textTransform: 'uppercase', marginBottom: -1,
      }}>{label}</button>
  );
  return (
    <div>
      {/* Graph comes FIRST, right under the video — Ohad: the video and the
          synced/scrubbable graph were too far apart to watch both at once
          (KPIs + per-rep table used to sit above it). Summary numbers and the
          rep table now follow the graph instead of preceding it. */}
      <div style={{ display: 'flex', gap: 6, margin: '4px 0 8px', flexWrap: 'wrap' }}>
        {pill('speed', 'SPEED', graph === 'speed', () => setGraph('speed'))}
        {pill('accel', 'ACCELERATION', graph === 'accel', () => setGraph('accel'))}
        {pill('velocity', 'MEAN VELOCITY · PER REP', graph === 'velocity', () => setGraph('velocity'))}
      </div>
      {/* TRACK back above the graph (Ohad: floating alone below the chart
          "looks weird") — no "TRACK" label word, just the two pills. */}
      {(graph === 'speed' || graph === 'accel') && (
        <div style={{ display: 'flex', marginBottom: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {trackPill('wrist', 'BAR · WRISTS', point === 'wrist', () => setPoint('wrist'))}
          {trackPill('hip', 'BODY · HIPS', point === 'hip', () => setPoint('hip'))}
        </div>
      )}
      {graph === 'speed' && <SpeedTrace barSpeed={trace} point={point} playheadT={playheadT} onScrub={onScrub} zoom={zoom} setZoom={setZoom} />}
      {graph === 'accel' && <AccelTrace accel={accelTrace} point={point} playheadT={playheadT} onScrub={onScrub} zoom={zoom} setZoom={setZoom} />}
      {graph === 'velocity' && <VelocityBars perRep={v.perRep} bestMean={v.bestMean} />}
      {/* Summary KPIs — MiniKpi (stacked label-then-value), not Kpi (label
          beside value): at half-width, Kpi's side-by-side baseline layout let
          the two labels wrap across a different number of lines ("BEST MEAN
          VELOCITY" vs "VELOCITY LOSS (LAST REP)"), so the two boxes came out
          different heights (Ohad: "different box sizes, different heights,
          fix to OCD level"). MiniKpi's stacked layout contains any wrapping
          within the label's own line, and the row's default align-items:
          stretch then matches both boxes to the same height automatically. */}
      {/* velLoss=false on a ballistic/reactive drill: velocity-LOSS is a grinding-
          set fatigue read that's meaningless there, so drop the LOSS KPI + column
          and keep raw mean/peak velocity (which is fine on any lift). (#172) */}
      <div style={{ display: 'flex', gap: 8 }}>
        <MiniKpi label="BEST MEAN VELOCITY" value={`${v.bestMean.toFixed(2)} m/s`} />
        {velLoss && <MiniKpi label="VELOCITY LOSS (LAST REP)" value={v.finalLossPct >= 90 ? '90%+' : `${Math.round(v.finalLossPct)}%`} tone={v.finalLossPct >= 20 ? C.rd : v.finalLossPct >= 10 ? C.or : C.gn} />}
      </div>
      <Row head cells={velLoss ? ['REP', 'MEAN m/s', 'PEAK m/s', 'LOSS'] : ['REP', 'MEAN m/s', 'PEAK m/s']} />
      {v.perRep.map((r, i) => r && <Row key={i} cells={velLoss
        ? [i + 1, r.meanConcentric.toFixed(2), r.peak.toFixed(2), r.lossPct == null ? '—' : r.lossPct >= 90 ? '90%+' : `${Math.round(r.lossPct)}%`]
        : [i + 1, r.meanConcentric.toFixed(2), r.peak.toFixed(2)]} tone={velLoss && r.lossPct != null && r.lossPct >= 20 ? C.rd : undefined}
        onClick={onScrub && r.startT != null ? () => onScrub(r.startT) : undefined} />)}
    </div>
  );
}

// Shared pinch-zoom + pan for the time axis of SpeedTrace/AccelTrace. Standard
// gesture convention: spread two fingers apart = zoom IN (narrower time window,
// more detail); pinch together = zoom OUT (wider window, back toward the full
// clip). Also accepts ctrl+wheel (how Chrome/Firefox report trackpad pinch) as
// a desktop equivalent. `zoom`/`setZoom` are owned by the caller (VelocityTable)
// so SPEED and ACCELERATION share one zoom window across tab switches.
// Single-finger drag still seeks the video (unchanged) — the two never
// conflict because a second pointer immediately switches this gesture session
// into pinch mode and a `justPinched` guard blocks a stray seek from whichever
// finger is lifted last.
function useTraceZoomPan({ svgRef, fullT0, fullT1, zoom, setZoom, onScrub, W, padL, padR }) {
  const pointersRef = useRef(new Map());   // pointerId -> {x,y}
  const dragRef = useRef(false);
  const pinchRef = useRef(null);           // { dist0, midT0, t0, t1 } captured at pinch start
  const justPinchedRef = useRef(false);

  const t0 = zoom ? zoom.t0 : fullT0;
  const t1 = zoom ? zoom.t1 : fullT1;
  const span = Math.max(1, t1 - t0);
  const FULL_SPAN = Math.max(1, fullT1 - fullT0);
  const MIN_SPAN = 400; // ms — a zoom floor so the window can't collapse to nothing
  const usableW = W - padL - padR;

  const xToT = (clientX, rect) => {
    const vbX = ((clientX - rect.left) / Math.max(1, rect.width)) * W;
    const frac = Math.min(1, Math.max(0, (vbX - padL) / usableW));
    return t0 + frac * span;
  };
  const clampWindow = (nt0, nt1) => {
    if (nt0 < fullT0) { nt1 += fullT0 - nt0; nt0 = fullT0; }
    if (nt1 > fullT1) { nt0 -= nt1 - fullT1; nt1 = fullT1; }
    return { t0: Math.max(fullT0, nt0), t1: Math.min(fullT1, nt1) };
  };
  const setSpan = (newSpanRaw, anchorT) => {
    const newSpan = Math.min(FULL_SPAN, Math.max(MIN_SPAN, newSpanRaw));
    const w = clampWindow(anchorT - newSpan / 2, anchorT + newSpan / 2);
    setZoom(newSpan >= FULL_SPAN - 1 ? null : w);
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midX = (a, b) => (a.x + b.x) / 2;

  const onPointerDown = (e) => {
    if (!svgRef.current) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const rect = svgRef.current.getBoundingClientRect();
      pinchRef.current = { dist0: dist(a, b), midT0: xToT(midX(a, b), rect), t0, t1 };
      dragRef.current = false;
      justPinchedRef.current = true;
    } else if (pointersRef.current.size === 1 && !justPinchedRef.current) {
      dragRef.current = true;
      if (onScrub) onScrub(xToT(e.clientX, svgRef.current.getBoundingClientRect()));
    }
  };
  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId) || !svgRef.current) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const scale = dist(a, b) / Math.max(1, pinchRef.current.dist0);
      setSpan((pinchRef.current.t1 - pinchRef.current.t0) / scale, pinchRef.current.midT0);
      return;
    }
    if (pointersRef.current.size === 1 && dragRef.current && onScrub) {
      onScrub(xToT(e.clientX, svgRef.current.getBoundingClientRect()));
    }
  };
  const endPointer = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) { dragRef.current = false; justPinchedRef.current = false; }
  };
  const onWheel = (e) => {
    if (!e.ctrlKey || !svgRef.current) return;   // plain scroll passes through untouched
    e.preventDefault();
    setSpan(span * Math.exp(e.deltaY * 0.01), xToT(e.clientX, svgRef.current.getBoundingClientRect()));
  };

  return {
    t0, t1, span, zoomed: !!zoom, resetZoom: () => setZoom(null),
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer, onWheel },
  };
}

const zoomResetPillStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 8px',
  border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.75)', cursor: 'pointer', borderRadius: 0, marginLeft: 8,
};

// Continuous VERTICAL bar/body speed over the whole set. Each rep is a peak pair
// (lower + lift). SVG polyline; y-axis m/s (peak-scaled to the VISIBLE window,
// so zooming in reveals more resolution), x-axis real time (pinch-zoomable —
// see useTraceZoomPan). playheadT (ms) draws a video-synced marker; onScrub(tMs)
// seeks the video when the coach clicks/drags on the trace — two-way sync.
function SpeedTrace({ barSpeed, point, playheadT = null, onScrub = null, zoom = null, setZoom = null }) {
  const noun = point === 'hip' ? 'BODY (HIP)' : 'BAR (WRIST)';
  const svgRef = useRef(null);
  const hasSeries = !!(barSpeed && barSpeed.series && barSpeed.series.length >= 3);
  const series = hasSeries ? barSpeed.series : null;
  const fullPeak = hasSeries ? barSpeed.peak : 0;
  const W = 300, H = 110, padL = 26, padB = 16, padT = 6, padR = 4;
  const fullT0 = hasSeries ? series[0].t : 0;
  const fullT1 = hasSeries ? (series[series.length - 1].t || 1) : 1;
  // Hook runs unconditionally (rules-of-hooks) even on a "no clean trace" clip —
  // it's a no-op there since the component returns before using its result.
  const { t0, t1, span, zoomed, resetZoom, handlers } = useTraceZoomPan({ svgRef, fullT0, fullT1, zoom, setZoom, onScrub, W, padL, padR });
  if (!hasSeries) {
    return <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', margin: '6px 0 16px' }}>No clean {noun.toLowerCase()} speed trace in this clip.</div>;
  }
  const visible = zoomed ? series.filter(p => p.t >= t0 && p.t <= t1) : series;
  // y-axis rescales to the VISIBLE window's peak — zooming in reveals more
  // resolution instead of staying squashed against the full-clip peak.
  // Symmetric range: speed is now SIGNED (+up/-down), not rectified.
  const peak = visible.length ? Math.max(...visible.map(p => Math.abs(p.speed))) : fullPeak;
  const yMax = Math.max(0.3, peak);
  const x = (t) => padL + ((t - t0) / span) * (W - padL - padR);
  const y = (s) => padT + (1 - (s + yMax) / (2 * yMax)) * (H - padT - padB);
  const pts = visible.map(p => `${x(p.t).toFixed(1)},${y(p.speed).toFixed(1)}`).join(' ');
  const gridY = [-yMax, 0, yMax];
  const zeroY = y(0);
  // clamp the playhead into the trace's time window and place it on the x-axis
  const phT = playheadT == null ? null : Math.min(t1, Math.max(t0, playheadT));
  const phX = phT == null ? null : x(phT);
  // value at the playhead — nearest sample, so scrubbing has a readable number
  const atPlayhead = phT == null ? null : series.reduce((best, p) => (best == null || Math.abs(p.t - phT) < Math.abs(best.t - phT) ? p : best), null);
  return (
    <div style={{ margin: '6px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>VERTICAL {noun} SPEED · m/s{zoomed ? '' : ' OVER TIME'} · +up / -down · peak {peak.toFixed(2)}{onScrub ? ' · scrub to seek, pinch to zoom' : ''}</span>
        {zoomed && <button type="button" onClick={resetZoom} style={zoomResetPillStyle}>↺ RESET ZOOM</button>}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', cursor: onScrub ? 'col-resize' : 'default', touchAction: 'none' }} {...handlers}>
        {gridY.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
            <text x={0} y={y(g) + 3} fill="rgba(255,255,255,0.45)" fontSize="8" fontFamily="monospace">{g.toFixed(1)}</text>
          </g>
        ))}
        {/* zero line emphasized — the sign flips here every rep (up vs down) */}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.28)" strokeWidth="0.75" />
        {/* soft fill anchored at zero (not the bottom) — reads as a chart, not just a line */}
        {pts && <polygon points={`${x(visible[0]?.t ?? t0).toFixed(1)},${zeroY.toFixed(1)} ${pts} ${x(visible[visible.length - 1]?.t ?? t1).toFixed(1)},${zeroY.toFixed(1)}`} fill={C.ac} fillOpacity="0.10" stroke="none" />}
        <polyline points={pts} fill="none" stroke={C.ac} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {phX != null && (
          <g>
            <line x1={phX} x2={phX} y1={padT} y2={H - padB} stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1" />
            {atPlayhead && <PlayheadMarker x={phX} y={y(atPlayhead.speed)} value={atPlayhead.speed.toFixed(2)} chartW={W} padL={padL} padR={padR} />}
          </g>
        )}
      </svg>
    </div>
  );
}

// The playhead's value now travels WITH the dot instead of sitting as static
// caption text (Ohad: "the number should be traveling with the playhead") —
// a dot on the curve at the actual value height, with a small floating label
// above it (dark halo via paintOrder so it reads over a busy curve), clamped
// so it never runs off either edge of the chart. Shared by every trace.
function PlayheadMarker({ x, y, value, chartW, padL, padR }) {
  const labelX = Math.min(chartW - padR - 2, Math.max(padL + 16, x));
  return (
    <>
      <circle cx={x} cy={y} r="3" fill="#FFFFFF" />
      <text x={labelX} y={Math.max(11, y - 7)} textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="monospace"
        fill="#FFFFFF" stroke="rgba(0,0,0,0.65)" strokeWidth="3" paintOrder="stroke" style={{ pointerEvents: 'none' }}>{value}</text>
    </>
  );
}

// Continuous VERTICAL acceleration over the whole set — the derivative of
// velocity (signed: negative = decelerating), NOT of the |speed| trace above
// (see barAccelSeries). Same interaction/sync model as SpeedTrace but the
// y-axis is symmetric around zero (acceleration swings both ways every rep),
// with an emphasized zero line, and a distinct stroke color so the two traces
// are never confused at a glance.
function AccelTrace({ accel, point, playheadT = null, onScrub = null, zoom = null, setZoom = null }) {
  const noun = point === 'hip' ? 'BODY (HIP)' : 'BAR (WRIST)';
  const svgRef = useRef(null);
  const hasSeries = !!(accel && accel.series && accel.series.length >= 3);
  const series = hasSeries ? accel.series : null;
  const fullPeak = hasSeries ? accel.peak : 0;
  const W = 300, H = 110, padL = 26, padB = 16, padT = 6, padR = 4;
  const fullT0 = hasSeries ? series[0].t : 0;
  const fullT1 = hasSeries ? (series[series.length - 1].t || 1) : 1;
  const { t0, t1, span, zoomed, resetZoom, handlers } = useTraceZoomPan({ svgRef, fullT0, fullT1, zoom, setZoom, onScrub, W, padL, padR });
  if (!hasSeries) {
    return <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', margin: '6px 0 16px' }}>No clean {noun.toLowerCase()} acceleration trace in this clip.</div>;
  }
  const visible = zoomed ? series.filter(p => p.t >= t0 && p.t <= t1) : series;
  const peak = visible.length ? Math.max(...visible.map(p => Math.abs(p.accel))) : fullPeak;
  const yMax = Math.max(0.5, peak);                    // symmetric range [-yMax, yMax]
  const x = (t) => padL + ((t - t0) / span) * (W - padL - padR);
  const y = (a) => padT + (1 - (a + yMax) / (2 * yMax)) * (H - padT - padB);
  const pts = visible.map(p => `${x(p.t).toFixed(1)},${y(p.accel).toFixed(1)}`).join(' ');
  const gridVals = [-yMax, 0, yMax];
  const zeroY = y(0);
  const phT = playheadT == null ? null : Math.min(t1, Math.max(t0, playheadT));
  const phX = phT == null ? null : x(phT);
  const atPlayhead = phT == null ? null : series.reduce((best, p) => (best == null || Math.abs(p.t - phT) < Math.abs(best.t - phT) ? p : best), null);
  return (
    <div style={{ margin: '6px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>VERTICAL {noun} ACCELERATION · m/s²{zoomed ? '' : ' OVER TIME'} · peak {peak.toFixed(2)}{onScrub ? ' · scrub to seek, pinch to zoom' : ''}</span>
        {zoomed && <button type="button" onClick={resetZoom} style={zoomResetPillStyle}>↺ RESET ZOOM</button>}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', cursor: onScrub ? 'col-resize' : 'default', touchAction: 'none' }} {...handlers}>
        {gridVals.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
            <text x={0} y={y(g) + 3} fill="rgba(255,255,255,0.45)" fontSize="8" fontFamily="monospace">{g.toFixed(1)}</text>
          </g>
        ))}
        {/* zero line emphasized — every rep's turnaround crosses it */}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.28)" strokeWidth="0.75" />
        {pts && <polygon points={`${x(visible[0]?.t ?? t0).toFixed(1)},${zeroY.toFixed(1)} ${pts} ${x(visible[visible.length - 1]?.t ?? t1).toFixed(1)},${zeroY.toFixed(1)}`} fill={C.pu} fillOpacity="0.10" stroke="none" />}
        <polyline points={pts} fill="none" stroke={C.pu} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {phX != null && (
          <g>
            <line x1={phX} x2={phX} y1={padT} y2={H - padB} stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1" />
            {atPlayhead && <PlayheadMarker x={phX} y={y(atPlayhead.accel)} value={atPlayhead.accel.toFixed(2)} chartW={W} padL={padL} padR={padR} />}
          </g>
        )}
      </svg>
    </div>
  );
}

// The VBT fatigue curve — mean concentric velocity per rep as bars, coloured by
// velocity-loss (green <10% · orange 10–20% · red ≥20%). The whole reason to
// measure velocity is to SEE the drop-off; a number column hides it.
function VelocityBars({ perRep, bestMean }) {
  const reps = (perRep || []).filter(Boolean);
  if (reps.length < 2) return null;
  const max = Math.max(bestMean || 0, ...reps.map(r => r.meanConcentric)) || 1;
  return (
    <div style={{ margin: '6px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', marginBottom: 8 }}>VELOCITY PROFILE · m/s PER REP</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
        {reps.map((r, i) => {
          const h = Math.max(4, Math.round((r.meanConcentric / max) * 78));
          const tone = r.lossPct >= 20 ? C.rd : r.lossPct >= 10 ? C.or : C.gn;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
              <div style={{ fontFamily: FN, fontSize: 8, color: 'rgba(255,255,255,0.55)', marginBottom: 3 }}>{r.meanConcentric.toFixed(2)}</div>
              <div title={`Rep ${i + 1} · ${r.meanConcentric.toFixed(2)} m/s · ${r.lossPct}% loss`} style={{ width: '100%', maxWidth: 32, height: h, background: tone }} />
              <div style={{ fontFamily: FN, fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{i + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// detectChannels kind → the joint the per-rep ROM/tempo is tracked on, so the
// KPI names the actual joint ("LARGEST ROM · KNEE") instead of a vague label.
const KIND_JOINT = { knee: 'Knee', hip: 'Hip', elbow: 'Elbow', sho: 'Shoulder' };
// Same map, but to the ANGLE_DEFS abbreviation used by namedAngleSeries — the
// manual joint+L/R picker's default selection matches whatever the exercise
// title auto-detected, before the coach overrides it.
const KIND_TO_ABBR = { knee: 'KNE', hip: 'HIP', elbow: 'ELB', sho: 'SHO' };
const JOINT_PICKS = [{ abbr: 'SHO', label: 'Shoulder' }, { abbr: 'ELB', label: 'Elbow' }, { abbr: 'HIP', label: 'Hip' }, { abbr: 'KNE', label: 'Knee' }];

// Continuous joint-angle-over-time trace for ROM & TEMPO — same synced/
// scrubbable/pinch-zoomable treatment as SpeedTrace/AccelTrace (shares
// useTraceZoomPan + PlayheadMarker), plotting degrees instead of m/s or m/s².
// Green stroke keeps it visually distinct from speed (cyan) and accel (purple).
function AngleTrace({ angle, kind, jointLabel = null, playheadT = null, onScrub = null, zoom = null, setZoom = null }) {
  const noun = (jointLabel || KIND_JOINT[kind] || 'JOINT').toUpperCase();
  const svgRef = useRef(null);
  const hasSeries = !!(angle && angle.series && angle.series.length >= 3);
  const series = hasSeries ? angle.series : null;
  const fullPeak = hasSeries ? angle.peak : 0;
  const W = 300, H = 110, padL = 26, padB = 16, padT = 6, padR = 4;
  const fullT0 = hasSeries ? series[0].t : 0;
  const fullT1 = hasSeries ? (series[series.length - 1].t || 1) : 1;
  const { t0, t1, span, zoomed, resetZoom, handlers } = useTraceZoomPan({ svgRef, fullT0, fullT1, zoom, setZoom, onScrub, W, padL, padR });
  if (!hasSeries) {
    return <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', margin: '6px 0 16px' }}>No clean joint-angle trace in this clip.</div>;
  }
  const visible = zoomed ? series.filter(p => p.t >= t0 && p.t <= t1) : series;
  const peak = visible.length ? Math.max(...visible.map(p => p.angle)) : fullPeak;
  const yMax = Math.max(10, peak);
  const x = (t) => padL + ((t - t0) / span) * (W - padL - padR);
  const y = (a) => padT + (1 - a / yMax) * (H - padT - padB);
  const pts = visible.map(p => `${x(p.t).toFixed(1)},${y(p.angle).toFixed(1)}`).join(' ');
  const gridY = [0, yMax / 2, yMax];
  const phT = playheadT == null ? null : Math.min(t1, Math.max(t0, playheadT));
  const phX = phT == null ? null : x(phT);
  const atPlayhead = phT == null ? null : series.reduce((best, p) => (best == null || Math.abs(p.t - phT) < Math.abs(best.t - phT) ? p : best), null);
  return (
    <div style={{ margin: '6px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{noun} ANGLE · degrees{zoomed ? '' : ' OVER TIME'} · peak {peak.toFixed(0)}°{onScrub ? ' · scrub to seek, pinch to zoom' : ''}</span>
        {zoomed && <button type="button" onClick={resetZoom} style={zoomResetPillStyle}>↺ RESET ZOOM</button>}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', cursor: onScrub ? 'col-resize' : 'default', touchAction: 'none' }} {...handlers}>
        {gridY.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
            <text x={0} y={y(g) + 3} fill="rgba(255,255,255,0.45)" fontSize="8" fontFamily="monospace">{g.toFixed(0)}°</text>
          </g>
        ))}
        {pts && <polygon points={`${x(visible[0]?.t ?? t0).toFixed(1)},${y(0).toFixed(1)} ${pts} ${x(visible[visible.length - 1]?.t ?? t1).toFixed(1)},${y(0).toFixed(1)}`} fill={C.gn} fillOpacity="0.10" stroke="none" />}
        <polyline points={pts} fill="none" stroke={C.gn} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {phX != null && (
          <g>
            <line x1={phX} x2={phX} y1={padT} y2={H - padB} stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1" />
            {atPlayhead && <PlayheadMarker x={phX} y={y(atPlayhead.angle)} value={`${atPlayhead.angle.toFixed(0)}°`} chartW={W} padL={padL} padR={padR} />}
          </g>
        )}
      </svg>
    </div>
  );
}

function RomTable({ r, jointRom, kind, frames = null, exerciseTitle, playheadT = null, onScrub = null }) {
  // Own zoom state (not shared with SPEED & ACCEL's — a different tab, a
  // different graph, no reason to couple their zoom windows). Hooks run
  // unconditionally (rules-of-hooks) even on the "nothing detected" empty
  // state below, which is why this sits above that early return.
  const [zoom, setZoom] = useState(null);
  useEffect(() => { setZoom(null); }, [frames]);
  // Manual joint + L/R picker (Ohad: "I need to be able to choose a joint,
  // and to choose r/l then the graph adjusts") — defaults to whatever the
  // exercise title auto-detected, coach can override either independently.
  const [jointAbbr, setJointAbbr] = useState(() => KIND_TO_ABBR[kind] || 'KNE');
  const [side, setSide] = useState('L');
  useEffect(() => { setJointAbbr(KIND_TO_ABBR[kind] || 'KNE'); }, [kind]);
  const angleTrace = useMemo(() => frames && namedAngleSeries(frames, `${side} ${jointAbbr}`), [frames, side, jointAbbr]);
  if (!r && !jointRom) return <Empty msg="No movement detected to measure range of motion." />;
  const primaryJoint = (KIND_JOINT[kind] || 'Primary Joint').toUpperCase();
  return (
    <div>
      {/* Synced/scrubbable/pinch-zoomable graph — same treatment as SPEED &
          ACCEL (Ohad 2026-07-04: "I need a graph display matched with the
          video timeline on this... like we have on speed/acceleration").
          Plots the manually-picked joint+side channel, not the exercise-
          title-averaged auto pick. */}
      <AngleTrace angle={angleTrace} jointLabel={`${side} ${JOINT_PICKS.find(j => j.abbr === jointAbbr)?.label || jointAbbr}`} playheadT={playheadT} onScrub={onScrub} zoom={zoom} setZoom={setZoom} />
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {JOINT_PICKS.map(j => (
          <button key={j.abbr} type="button" onClick={() => setJointAbbr(j.abbr)}
            style={{
              fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 10px',
              borderRadius: 0, cursor: 'pointer', textTransform: 'uppercase',
              border: `1px solid ${jointAbbr === j.abbr ? C.gn : 'rgba(255,255,255,0.2)'}`,
              background: jointAbbr === j.abbr ? `${C.gn}22` : 'transparent',
              color: jointAbbr === j.abbr ? C.gn : 'rgba(255,255,255,0.5)',
            }}>{j.label}</button>
        ))}
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
        {['L', 'R'].map(s => (
          <button key={s} type="button" onClick={() => setSide(s)}
            style={{
              fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 10px',
              borderRadius: 0, cursor: 'pointer',
              border: `1px solid ${side === s ? C.gn : 'rgba(255,255,255,0.2)'}`,
              background: side === s ? `${C.gn}22` : 'transparent',
              color: side === s ? C.gn : 'rgba(255,255,255,0.5)',
            }}>{s}</button>
        ))}
      </div>
      {jointRom && <JointRomPanel joints={jointRom} />}
      {r ? (
        <>
          <Kpi label={`LARGEST ${primaryJoint} ROM`} value={`${r.maxRom.toFixed(0)}°`} />
          {r.collapsedCount > 0 && <Kpi label="ROM-COLLAPSED REPS" value={String(r.collapsedCount)} tone={C.or} />}
          <TempoBars perRep={r.perRep} />
          <Row head cells={['REP', 'ROM', 'ECC s', 'PAUSE', 'CON s']} />
          {r.perRep.map((x, i) => x && <Row key={i} cells={[i + 1, `${x.rom.toFixed(0)}° (${x.romPct}%)`, x.ecc.toFixed(1), x.pause.toFixed(1), x.con.toFixed(1)]} tone={x.collapsed ? C.or : undefined}
            onClick={onScrub && x.startT != null ? () => onScrub(x.startT) : undefined} />)}
        </>
      ) : (
        <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginTop: 10 }}>
          Per-rep tempo (ecc / pause / con) needs a detected set — film a full rep cycle to add it.
        </div>
      )}
    </div>
  );
}

// Multi-joint working range across the whole clip, with TWO display modes the
// coach can toggle (Ohad): "L ↔ R" diverging bars (asymmetry jumps out off a
// centre spine) and "Table" (Joint · L · R · Δ%, amber when L/R differ >10%).
// Grouped by joint (Shoulder / Elbow / Hip / Knee), L+R together — no per-joint
// chips, so the panel stays calm. Δ uses the jump-asymmetry rule (>10% flag).
const JOINT_GROUPS = [
  { key: 'SHO', label: 'Shoulder' },
  { key: 'ELB', label: 'Elbow' },
  { key: 'HIP', label: 'Hip' },
  { key: 'KNE', label: 'Knee' },
];
const ROM_R = '#7ad0ff';   // lighter cyan for the RIGHT side
const ROM_FLAG = '#ffb454'; // amber for an asymmetry flag
function romRows(joints) {
  const byName = {}; joints.forEach(j => { byName[j.name] = j; });
  return JOINT_GROUPS.map(g => {
    const L = byName[`L ${g.key}`], R = byName[`R ${g.key}`];
    if (!L && !R) return null;
    const lr = L ? L.romDeg : null, rr = R ? R.romDeg : null;
    const delta = (lr != null && rr != null && Math.max(lr, rr) > 0)
      ? Math.round((Math.abs(lr - rr) / Math.max(lr, rr)) * 100) : null;
    return { ...g, L, R, lr, rr, delta };
  }).filter(Boolean);
}
function RomDiverging({ rows }) {
  const maxRom = Math.max(1, ...rows.flatMap(r => [r.lr || 0, r.rr || 0]));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontFamily: FN, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', marginBottom: 10 }}>
        <span>◄ LEFT</span><span style={{ opacity: 0.4 }}>·</span><span>RIGHT ►</span>
      </div>
      {rows.map(r => (
        <div key={r.key} style={{ marginBottom: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: C.ac, width: 34, textAlign: 'right', flexShrink: 0 }}>{r.lr != null ? `${r.lr}°` : '—'}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <div style={{ flex: 1, height: 14, position: 'relative', background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(r.lr || 0) / maxRom * 100}%`, background: C.ac }} />
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: C.ac, opacity: 0.5 }} />
              <div style={{ flex: 1, height: 14, position: 'relative', background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(r.rr || 0) / maxRom * 100}%`, background: ROM_R }} />
              </div>
            </div>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 800, color: ROM_R, width: 34, flexShrink: 0 }}>{r.rr != null ? `${r.rr}°` : '—'}</span>
          </div>
          <div style={{ textAlign: 'center', fontFamily: FN, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)', marginTop: 4, textTransform: 'uppercase' }}>
            {r.label}{r.delta != null && r.delta > 10 ? <span style={{ color: ROM_FLAG }}> · Δ{r.delta}%</span> : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
function RomTableView({ rows }) {
  const th = { fontFamily: FN, fontSize: 8, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.14)', textAlign: 'right', fontWeight: 700 };
  const td = { fontFamily: FN, fontSize: 12, fontWeight: 700, padding: '9px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={{ ...th, textAlign: 'left' }}>JOINT</th><th style={th}>L</th><th style={th}>R</th><th style={th}>Δ</th>
      </tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td style={{ ...td, textAlign: 'left', color: C.tx }}>{r.label}</td>
            <td style={{ ...td, color: C.ac }}>{r.lr != null ? `${r.lr}°` : '—'}</td>
            <td style={{ ...td, color: ROM_R }}>{r.rr != null ? `${r.rr}°` : '—'}</td>
            <td style={{ ...td, color: r.delta != null && r.delta > 10 ? ROM_FLAG : 'rgba(255,255,255,0.4)' }}>{r.delta != null ? `${r.delta}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function JointRomPanel({ joints }) {
  const [mode, setMode] = useState('diverging'); // 'diverging' (B) | 'table' (C)
  if (!joints || !joints.length) return null;
  const rows = romRows(joints);
  if (!rows.length) return null;
  const tBtn = (k, label) => (
    <button type="button" onClick={() => setMode(k)} style={{
      fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 12px',
      borderRadius: 0, cursor: 'pointer', textTransform: 'uppercase',
      border: `1px solid ${mode === k ? C.ac : 'rgba(255,255,255,0.18)'}`,
      background: mode === k ? `${C.ac}22` : 'transparent',
      color: mode === k ? C.ac : 'rgba(255,255,255,0.5)',
    }}>{label}</button>
  );
  return (
    <div style={{ margin: '4px 0 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em' }}>JOINT ROM · IN-PLANE °</div>
        <div style={{ display: 'flex', gap: 6 }}>{tBtn('diverging', 'L ↔ R')}{tBtn('table', 'Table')}</div>
      </div>
      {mode === 'diverging' ? <RomDiverging rows={rows} /> : <RomTableView rows={rows} />}
    </div>
  );
}

// Tempo timeline — each rep's eccentric / pause / concentric seconds as a
// proportional stacked bar. Surfaces rushed eccentrics and skipped pauses at a
// glance (tempo-prescription compliance), which the seconds columns bury.
function TempoBars({ perRep }) {
  const reps = (perRep || []).filter(Boolean);
  if (!reps.length) return null;
  const maxT = Math.max(...reps.map(r => r.ecc + r.pause + r.con)) || 1;
  const seg = (val, color, key) => val > 0
    ? <div key={key} title={`${key} ${val.toFixed(1)}s`} style={{ width: `${(val / maxT) * 100}%`, background: color }} />
    : null;
  return (
    <div style={{ margin: '6px 0 16px' }}>
      <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', marginBottom: 8 }}>TEMPO · ECC / PAUSE / CON PER REP</div>
      {reps.map((x, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.4)', width: 16 }}>{i + 1}</div>
          <div style={{ flex: 1, display: 'flex', height: 12, background: 'rgba(255,255,255,0.06)' }}>
            {seg(x.ecc, C.ac, 'ecc')}{seg(x.pause, 'rgba(255,255,255,0.28)', 'pause')}{seg(x.con, C.gn, 'con')}
          </div>
          <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.5)', width: 42, textAlign: 'right' }}>{(x.ecc + x.pause + x.con).toFixed(1)}s</div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
        <Legend color={C.ac} label="ECC" /><Legend color="rgba(255,255,255,0.28)" label="PAUSE" /><Legend color={C.gn} label="CON" />
      </div>
    </div>
  );
}
const Legend = ({ color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FN, fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>
    <span style={{ width: 9, height: 9, background: color }} />{label}
  </span>
);

// ----------------------------- results: jump --------------------------------
const JUMP_TITLE = { cmj: 'COUNTERMOVEMENT JUMP', svj: 'STANDING VERTICAL JUMP', sl: 'SINGLE-LEG JUMP', drop: 'DROP JUMP · RSI', pogo: 'POGO · RSI' };

// Honest accuracy badge from captured fps (per research: flight-time height
// error ≈ ±1cm@240 · ±2cm@120 · ±5cm@60 · ±9cm@30). Green only at slow-mo.
function FpsBadge({ fps }) {
  const f = Math.round(fps || 0);
  const cfg = f >= 120 ? { txt: `${f}fps slow-mo · ≈±1–2cm (lab-grade)`, tone: C.gn }
    : f >= 50 ? { txt: `${f}fps · trend only ≈±3–5cm — film in slow-mo for precision`, tone: C.or }
      : { txt: `${f || '?'}fps · low ≈±9cm — record in slow-mo (120–240fps)`, tone: C.rd };
  return <div style={{ marginTop: 12, fontFamily: FN, fontSize: 10, color: cfg.tone, letterSpacing: '0.03em' }}>◷ {cfg.txt}</div>;
}

// Coach-confirmed camera ROM: read the measured clinical degree for one joint
// axis off the clip's jointRom, show L/R + demonstrated max + any L/R gap, and
// let the coach EDIT before it's written into the eval. The camera proposes; the
// coach owns the value. Active range (athlete's own movement) reads a few degrees
// under true passive end-range — said plainly so it's never mistaken for a
// goniometer measurement.
function RomConfirm({ spec, jointRom, onSave, onClose }) {
  const reading = useMemo(() => romReadingFor(spec, jointRom), [spec, jointRom]);
  // Default the logged value to the WORSE (restricted) side, not the better one:
  // in a single per-axis clinical field the deficit is the point, and pre-filling
  // the healthy side would bury it on a fast click-through. (Review finding #6.)
  const [deg, setDeg] = useState(() => (reading?.min != null ? String(reading.min) : ''));
  const [saved, setSaved] = useState(false);
  const degNum = parseInt(deg, 10);
  const degValid = deg !== '' && Number.isFinite(degNum);
  if (!reading) return (
    <div style={{ border: `1px solid ${C.rd}`, background: `${C.rd}14`, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.rd, letterSpacing: '0.1em' }}>NO CLEAN {spec.axis.toUpperCase()} READ</div>
      <div style={{ fontFamily: FB, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 8, lineHeight: 1.5 }}>
        Couldn't recover the {spec.jointId} through a clean range. {spec.cue} Full body in frame, good light — or enter the degree by hand in the evaluation.
      </div>
    </div>
  );
  const side = (label, v) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div style={{ fontFamily: FN, fontSize: 9, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)' }}>{label}</div>
      <div style={{ fontFamily: FN, fontSize: 20, fontWeight: 700, color: v == null ? 'rgba(255,255,255,0.3)' : '#FFF' }}>{v == null ? '—' : `${v}°`}</div>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${C.ac}`, background: `${C.ac}12`, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: FN, fontSize: 12, fontWeight: 700, color: C.ac, letterSpacing: '0.1em' }}>
        CAMERA ROM · {spec.jointId.toUpperCase()} {spec.axis.toUpperCase()}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {side('LEFT', reading.L)}
        {side('RIGHT', reading.R)}
      </div>
      {reading.asymDeg != null && reading.asymDeg >= 8 && (
        <div style={{ fontFamily: FB, fontSize: 11, color: C.or, marginTop: 8 }}>
          {reading.asymDeg}° left/right gap — worth an eyes-on check.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <div style={{ fontFamily: FN, fontSize: 10, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.6)' }}>LOG</div>
        <input type="number" value={deg} onChange={e => { setDeg(e.target.value); setSaved(false); }}
          style={{ width: 84, padding: '8px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.25)', color: '#FFF', fontFamily: FN, fontSize: 16, textAlign: 'center' }} />
        <div style={{ fontFamily: FB, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>degrees · defaulted to {reading.minSide === 'L' ? 'left' : 'right'} (the restricted side)</div>
      </div>
      <div style={{ fontFamily: FB, fontSize: 10.5, color: C.or, marginTop: 10, lineHeight: 1.5 }}>
        Only valid if the limb moved in the SAGITTAL plane (straight forward, filmed side-on). If it swung out to the side, the camera reads that as flexion too — re-film or enter by hand.
      </div>
      <div style={{ fontFamily: FB, fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
        Active range — reads a few degrees under a hands-on passive goniometer. Confirm or edit before saving.
      </div>
      <button disabled={saved || !degValid} onClick={() => { onSave(degNum); setSaved(true); }}
        style={{ marginTop: 14, padding: '12px 20px', width: '100%', background: saved ? '#2a2a2a' : C.ac, border: `1px solid ${saved ? '#2a2a2a' : C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', cursor: saved || !degValid ? 'default' : 'pointer' }}>
        {saved ? '✓ LOGGED TO EVALUATION' : `USE ${degValid ? degNum : '—'}° →`}
      </button>
      {saved && <button onClick={onClose} style={{ marginTop: 8, padding: '10px 20px', width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFF', fontFamily: FN, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' }}>DONE — BACK TO EVALUATION</button>}
    </div>
  );
}

function JumpResult({ jump, result, onSave, onClose, defaultBodyweightKg }) {
  const [saved, setSaved] = useState(false);
  const [bw, setBw] = useState(defaultBodyweightKg != null ? String(defaultBodyweightKg) : '');
  if (!jump) return <Empty msg="Couldn't read a clean jump. Film side-on, full body in frame — stand still, then jump. For a drop jump / POGO, land and rebound immediately (minimise ground contact)." />;
  const title = JUMP_TITLE[jump.jumpType] || 'VERTICAL JUMP';
  const saveBtn = (s) => ({ marginTop: 18, padding: '13px 20px', width: '100%', background: s ? '#2a2a2a' : C.ac, border: `1px solid ${s ? '#2a2a2a' : C.ac}`, color: '#FFF', fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', cursor: s ? 'default' : 'pointer' });

  // Reactive jumps (drop jump / POGO): RSI is the headline, not height.
  if (jump.reactive) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em', marginBottom: 8 }}>{title}</div>
        <div style={{ fontFamily: FN, fontSize: 80, fontWeight: 800, color: C.ac, lineHeight: 1 }}>{jump.rsi}<span style={{ fontSize: 22 }}> RSI</span></div>
        <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>jump height ÷ ground-contact time (m/s)</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <MiniKpi label="HEIGHT" value={`${jump.heightCm} cm`} />
          <MiniKpi label="CONTACT" value={`${jump.contactMs} ms`} />
          <MiniKpi label="FLIGHT" value={`${jump.flightMs} ms`} />
        </div>
        {jump.count > 1 && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <MiniKpi label={`AVG RSI · ${jump.count} HOPS`} value={String(jump.avgRsi)} />
            <MiniKpi label="AVG CONTACT" value={`${jump.avgContactMs} ms`} />
          </div>
        )}
        <FpsBadge fps={result?.fps} />
        {onSave && <button disabled={saved} onClick={() => { onSave({ ...jump }); setSaved(true); }} style={saveBtn(saved)}>{saved ? 'SAVED TO EVALUATION' : 'SAVE TO EVALUATION →'}</button>}
        {saved && <button onClick={onClose} style={{ ...btn('rgba(255,255,255,0.3)', 'transparent'), marginTop: 12, width: '100%', padding: '11px' }}>DONE</button>}
      </div>
    );
  }

  const massKg = parseFloat(bw);
  const power = jumpPower(jump.heightCm, massKg);
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em', marginBottom: 8 }}>{title}</div>
      <div style={{ fontFamily: FN, fontSize: 88, fontWeight: 800, color: C.ac, lineHeight: 1 }}>{jump.heightCm}<span style={{ fontSize: 28 }}>cm</span></div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
        <MiniKpi label="FLIGHT TIME" value={`${jump.flightMs} ms`} />
        <MiniKpi label="PEAK RISE" value={`${jump.peakRiseCm} cm`} />
      </div>
      <FpsBadge fps={result?.fps} />

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
        }}>{saved ? 'SAVED TO EVALUATION' : 'SAVE TO EVALUATION →'}</button>
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
const MiniKpi = ({ label, value, tone }) => (
  <div style={{ flex: 1, padding: '12px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
    <div style={{ fontFamily: FN, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
    <div style={{ fontFamily: FN, fontSize: 18, fontWeight: 800, color: tone || '#FFF', marginTop: 4 }}>{value}</div>
  </div>
);
// onClick (optional) — e.g. the Review player wires this to seek the video to
// this rep's start, so clicking a rep row jumps the clip there (preserving
// play/pause — it's a plain currentTime set, not a pause/play call).
const Row = ({ cells, head, tone, onClick }) => (
  <div onClick={onClick} title={onClick ? 'Jump the video to this rep' : undefined}
    style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 4, padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: onClick ? 'pointer' : 'default' }}
    onMouseEnter={onClick ? (e) => { e.currentTarget.style.background = 'rgba(57,189,255,0.08)'; } : undefined}
    onMouseLeave={onClick ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}>
    {cells.map((c, i) => (
      <span key={i} style={{ fontFamily: FN, fontSize: head ? 9 : 12, fontWeight: 700, letterSpacing: head ? '0.1em' : 0, color: head ? 'rgba(255,255,255,0.45)' : (i === 0 ? '#FFF' : (tone || 'rgba(255,255,255,0.85)')), textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
    ))}
  </div>
);
const btn = (bd, bg) => ({ background: bg, border: `1px solid ${bd}`, color: '#FFF', padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: 'pointer' });
const BigBtn = ({ color, onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: 14, background: color, border: `1px solid ${color}`, color: '#FFF', fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.16em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>{children}</button>
);
