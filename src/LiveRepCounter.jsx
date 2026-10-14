// F-31 — Live pose rep counter with voice-trigger start.
//
// Athlete framework: camera-in face, MediaPipe Pose Landmarker on live
// frames, joint-angle state machine counts reps in real time. Voice
// trigger uses the Web Speech API — speak "start" / "go" / "count" /
// "התחל" / "סופר" to begin counting. Speak "stop" / "finished" / "די" to end.
//
// The state machine is intentionally simpler than the offline
// findPeaks() used for video review: thresholds + hysteresis on a
// smoothed joint angle. Trade-off: faster + lower-latency but less
// robust to weird tempo. Real production uses BOTH — offline review
// has ground-truth, live is for immediate feedback during the set.
//
// Memory rules: no weight-progression hints, no auto-recommendations.
// Just count + display.

import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { C, FN, FB } from './theme';
import { useT, readLang } from './i18n';
import { ANGLE_DEFS, angleAt, detectChannels, isReal } from './repCounter';
import { makeSubjectLock, lockResult, LIVE_POSES } from './subjectLock';
import { createPoseOverlay } from './poseOverlay';
import { createWorkerLandmarker } from './poseWorkerClient';
// one person - the lifter (13.10 #719b): a lock per video source (a new clip starts afresh)
const lockFor = (ref, v) => { const src = (v && (v.currentSrc || v.src)) || 'cam'; if (!ref.current || ref.current.src !== src) ref.current = { src, lock: makeSubjectLock({ aspect: v && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 0.75 }) }; return ref.current.lock; };
// the live anatomy body (#690) loads only when 3D is turned on; a stale chunk shows nothing, never a crash
const LiveAnatomy = React.lazy(() => import('./LiveAnatomy').catch(() => ({ default: function LiveAnatomyUnavailable() { return null; } })));

const VOICE_START_PHRASES = ['start', 'go', 'count', 'begin', 'התחל', 'התחילי', 'סופר', 'תספור'];
const VOICE_STOP_PHRASES = ['stop', 'finish', 'finished', 'done', 'די', 'תפסיק', 'מספיק'];

// Joint thresholds per channel kind. Down = signal crossed below
// `lowAngle`; Up = signal crossed back above `highAngle`. A complete
// down-then-up cycle counts one rep. Hysteresis prevents jitter
// double-counting.
const KIND_THRESHOLDS = {
  knee:  { low: 110, high: 160 },
  hip:   { low: 110, high: 165 },
  elbow: { low: 95,  high: 155 },
  sho:   { low: 50,  high: 130 },
  none:  null,
};

export default function LiveRepCounter({ exerciseTitle = 'Squat', onClose, targetReps = null }) {
  const tt = useT();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null), lockRef = useRef(null);
  const rafRef = useRef(null);
  const recognitionRef = useRef(null);
  const startingRef = useRef(false);   // synchronous re-entrancy guard for beginCounting

  const [status, setStatus] = useState('idle'); // idle | loading | listening | counting | stopped
  // Latest status for the persistent SpeechRecognition callback, which would
  // otherwise test the value captured when voice was first enabled (stale).
  const statusRef = useRef(status);
  statusRef.current = status;
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState('top'); // top | bottom
  const [lastAngle, setLastAngle] = useState(null);
  const [error, setError] = useState(null);
  const [voiceOn, setVoiceOn] = useState(false);
  // 3D (13.10 #690): his anatomy body, ~0.7 s behind the camera - off by default (the phone runs the pose model too)
  const [show3d, setShow3d] = useState(false);
  // SKELETON and JOINT ANGLES (14.10 #766): two tools, both on; the shared engine draws them (hands + feet, smoothed)
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const toolsRef = useRef({ skeleton: true, angles: true });
  useEffect(() => { toolsRef.current = { skeleton: showSkeleton, angles: showAngles }; }, [showSkeleton, showAngles]);
  const ovlRef = useRef(null);
  const liveBufRef = useRef([]);
  const [camDims, setCamDims] = useState(null);

  const { kind, channels } = detectChannels(exerciseTitle);
  const thr = KIND_THRESHOLDS[kind];

  // Smoothing buffer + phase tracking lives in refs so the RAF loop
  // doesn't trigger React re-renders every frame.
  const angleBufRef = useRef([]);
  const phaseRef = useRef('top');
  // Throttle the debug angle READOUT to ~5x/sec. Rep detection still runs every
  // frame off `smooth`; only the displayed number was re-rendering the whole
  // portal (incl. the 180px rep digit) 30-60x/sec for nothing.
  const lastAngleTsRef = useRef(0);

  // -----------------------------------------------------------------
  // Camera + pose model bootstrap
  // -----------------------------------------------------------------
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play(); }
    } catch (e) {
      setError(e.message || 'Camera permission denied.');
      throw e;
    }
  }, []);

  const loadPose = useCallback(async () => {
    if (landmarkerRef.current) return;
    // the model in a WORKER first (#775): the camera and the overlay keep the screen's rate while a frame is read
    const wk = await createWorkerLandmarker({ model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task', numPoses: LIVE_POSES });
    if (wk) { landmarkerRef.current = wk; return; }
    const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
    );
    const opts = (delegate) => ({
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: LIVE_POSES,
    });
    try {
      landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
    }
  }, []);

  // -----------------------------------------------------------------
  // Voice trigger — Web Speech API. Hebrew + English keyword match.
  // -----------------------------------------------------------------
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError(readLang() === 'he' ? 'הפעלה קולית עובדת רק ב-Chrome או ב-Edge.' : 'Voice trigger needs the Web Speech API — open in Chrome or Edge.');
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    // Hebrew + English alternating doesn't work in Chrome; pick one.
    // Default to the locale, fall back to English.
    rec.lang = (navigator.language || 'en').toLowerCase().startsWith('he') ? 'he-IL' : 'en-US';
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript + ' ';
      text = text.toLowerCase();
      if (VOICE_START_PHRASES.some(p => text.includes(p))) {
        if (statusRef.current !== 'counting') beginCounting();
      } else if (VOICE_STOP_PHRASES.some(p => text.includes(p))) {
        if (statusRef.current === 'counting') stopCounting();
      }
    };
    rec.onerror = (e) => { console.warn('voice err:', e.error); };
    // Web Speech auto-ends after silence; restart to stay hands-free. Gate on the
    // ref (stopVoice nulls it) NOT the captured `voiceOn` — at creation time voiceOn
    // is still false (it's being toggled on), so the old closure never restarted and
    // voice counting silently died after the first silence timeout.
    rec.onend = () => { if (recognitionRef.current === rec) { try { rec.start(); } catch {} } };
    try { rec.start(); recognitionRef.current = rec; setVoiceOn(true); }
    catch (e) { setError(e.message || 'Could not start voice recognition.'); }
  }, [status, voiceOn]);

  const stopVoice = useCallback(() => {
    setVoiceOn(false);
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  }, []);

  // -----------------------------------------------------------------
  // Live frame loop + rep state machine
  // -----------------------------------------------------------------
  const frameLoop = useCallback(() => {
    const v = videoRef.current;
    const lm = landmarkerRef.current;
    if (!v || !lm || v.readyState < 2) {
      rafRef.current = requestAnimationFrame(frameLoop);
      return;
    }
    // the reading is processed at its own frame time ts (#775): at once (the page's model) or a frame later (the worker)
    const process = (raw, ts) => {
      let result;
      try { result = raw ? lockResult(lockFor(lockRef, v), raw, ts) : null; } catch { result = null; }

      // the last 12.5 s of readings for the live 3D body
      if (result?.worldLandmarks?.[0] && result?.landmarks?.[0]) { const lb = liveBufRef.current; lb.push({ t: ts, landmarks: result.landmarks[0], worldLandmarks: result.worldLandmarks[0] }); while (lb.length && lb[0].t < ts - 12500) lb.shift(); }
      if (result?.worldLandmarks?.[0] && channels.length > 0) {
        const lms = result.worldLandmarks[0];
        // Average the two configured channels (L+R) so left-right
        // asymmetry doesn't drop a rep.
        const angles = channels.map(name => {
          const def = ANGLE_DEFS.find(a => a.name === name);
          return def ? angleAt(lms, def.a, def.b, def.c) : null;
        }).filter(isReal);
        if (angles.length > 0) {
          const avg = angles.reduce((a, b) => a + b, 0) / angles.length;
          const buf = angleBufRef.current;
          buf.push(avg);
          if (buf.length > 8) buf.shift();
          // Smoothed = median of last 5 samples (matches offline pipeline)
          const sorted = [...buf].sort((a, b) => a - b);
          const smooth = sorted[Math.floor(sorted.length / 2)];
          if (ts - lastAngleTsRef.current > 200) { lastAngleTsRef.current = ts; setLastAngle(smooth); }
          if (thr) {
            if (phaseRef.current === 'top' && smooth < thr.low) {
              phaseRef.current = 'bottom';
              setPhase('bottom');
            } else if (phaseRef.current === 'bottom' && smooth > thr.high) {
              phaseRef.current = 'top';
              setPhase('top');
              setReps(r => r + 1);
            }
          }
        }
        if (!ovlRef.current) ovlRef.current = createPoseOverlay();
        ovlRef.current.update(result.landmarks?.[0] || null, result.worldLandmarks?.[0], ts / 1000);
      } else {
        if (ovlRef.current) ovlRef.current.update(null);
      }
    };
    const t0 = performance.now();
    if (lm.isWorker) { if (!lm.busy) lm.detect(v, t0).then((r) => { if (r) process(r.result, t0); }); }
    else { let raw = null; try { raw = lm.detectForVideo(v, t0); } catch { raw = null; } process(raw, t0); }
    // the overlay at the SCREEN's rate, the joints at this instant (#775)
    drawSkeleton(canvasRef.current, v, ovlRef.current, toolsRef.current, performance.now() / 1000);
    rafRef.current = requestAnimationFrame(frameLoop);
  }, [channels, thr]);

  const beginCounting = useCallback(async () => {
    // REF guard, not just status: two taps in one tick (or a voice-start during
    // the multi-second first-run model download) both read status==='idle' and
    // would open a SECOND getUserMedia stream (first leaks, LED stays on) + a
    // duplicate rAF loop (reps count by 2, keep running after STOP).
    if (status === 'counting' || startingRef.current) return;
    startingRef.current = true;
    setError(null);
    setStatus('loading');
    try {
      if (!streamRef.current) await startCamera();
      await loadPose();
      setReps(0);
      angleBufRef.current = []; liveBufRef.current = [];
      { const vv = videoRef.current; if (vv && vv.videoWidth) setCamDims({ w: vv.videoWidth, h: vv.videoHeight }); }
      phaseRef.current = 'top';
      setPhase('top');
      setStatus('counting');
      rafRef.current = requestAnimationFrame(frameLoop);
    } catch (e) {
      // Release the camera if it opened but pose load then failed — otherwise
      // the LED stays on behind the error state. (camera audit)
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
      streamRef.current = null;
      setStatus('idle');
      setError(e.message || 'Could not start counting.');
    } finally {
      startingRef.current = false;
    }
  }, [status, startCamera, loadPose, frameLoop]);

  const stopCounting = useCallback(() => {
    setStatus('stopped');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // Release the camera on STOP — was only released on unmount, so the
    // selfie-cam LED stayed on after the athlete pressed stop. Cleared so a
    // resume re-acquires a fresh stream. (camera audit)
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    streamRef.current = null;
  }, []);

  // Full cleanup on unmount — camera tracks, RAF, voice rec, landmarker
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { recognitionRef.current?.stop(); } catch {}
    try { landmarkerRef.current?.close(); } catch {}
  }, []);

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  const repColor = targetReps && reps >= targetReps ? C.gn : C.ac;
  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 1500,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16, display: 'flex',
        justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10,
      }}>
        <div>
          <div style={{ fontFamily: FN, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.18em', fontWeight: 700 }}>
            {tt('LIVE COUNT')} · {exerciseTitle.toUpperCase()}
          </div>
          {targetReps && (
            <div style={{ fontFamily: FN, fontSize: 11, color: '#FFFFFF', letterSpacing: '0.12em', fontWeight: 700, marginTop: 4 }}>
              {tt('TARGET: {n}').replace('{n}', targetReps)}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(0,0,0,0.5)', border: `1px solid rgba(255,255,255,0.3)`,
          color: '#FFFFFF', padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
          cursor: 'pointer',
        }}>{tt('← BACK')}</button>
      </div>

      {/* Camera + skeleton overlay */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: 'scaleX(-1)',  // mirror for self-recording so motion reads natural
        }} />
        {/* not CSS-mirrored: the points are mirrored where they are drawn, so the angle numbers read the right way round;
            cropped exactly like the video (cover) so the lines sit on the body */}
        <canvas ref={canvasRef} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          pointerEvents: 'none',
        }} />

        {status === 'counting' && show3d && camDims && (
          <div style={{ position: 'absolute', top: 60, insetInlineEnd: 16, width: 'min(44vw, 280px)', border: '1px solid rgba(255,255,255,0.14)', zIndex: 12 }}>
            <Suspense fallback={null}><LiveAnatomy getFrames={() => liveBufRef.current} dims={camDims} height={240} /></Suspense>
          </div>
        )}
        {/* Big rep count overlay */}
        {status === 'counting' && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: repColor, fontFamily: FN, fontSize: 180, fontWeight: 800,
            letterSpacing: '-0.02em', textShadow: '0 0 24px rgba(0,0,0,0.5)',
          }}>{reps}</div>
        )}
        {status === 'counting' && (
          <div style={{
            position: 'absolute', bottom: 90, left: 0, right: 0, textAlign: 'center',
            color: 'rgba(255,255,255,0.7)', fontFamily: FN, fontSize: 12, letterSpacing: '0.18em', fontWeight: 700,
          }}>
            {tt('PHASE:')} {tt(phase.toUpperCase())} · <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{isReal(lastAngle) ? `${Math.round(lastAngle)}°` : '—'}</span>
          </div>
        )}
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFFFFF', fontFamily: FN, fontSize: 14, letterSpacing: '0.18em', fontWeight: 700,
          }}>{tt('STARTING CAMERA + POSE…')}</div>
        )}
        {status === 'idle' && !error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
            color: '#FFFFFF', fontFamily: FN, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 64 }}>🎯</div>
            <div style={{ fontSize: 14, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>
              {tt('READY TO COUNT')}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 340, lineHeight: 1.5 }}>
              {tt('Stand 2m from the camera with your full body in frame. Tap START or say "start" / "התחל" once set up.')}
            </div>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
            color: '#FFFFFF', fontFamily: FN, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36 }}>⚠</div>
            <div style={{ fontSize: 13, color: C.rd, letterSpacing: '0.04em' }}>{tt(error)}</div>
          </div>
        )}
      </div>

      {/* the two on-camera tools, their own row (a phone has no room for them in the bar below): one joined pair */}
      <div style={{ background: 'rgba(0,0,0,0.85)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {[[showSkeleton && showAngles, (f) => { const on = typeof f === 'function' ? f(showSkeleton && showAngles) : f; setShowSkeleton(on); setShowAngles(on); }, 'JOINT ANGLES'],
          [show3d, (f) => { const vv = videoRef.current; if (vv && vv.videoWidth) setCamDims({ w: vv.videoWidth, h: vv.videoHeight }); setShow3d(f); }, 'ANATOMY']].map(([on, set, label]) => (
          <button key={label} onClick={() => set((x) => !x)} aria-pressed={on}
            style={{
              height: 40, background: 'transparent', color: on ? C.ac : 'rgba(255,255,255,0.7)',
              border: '1px solid ' + (on ? C.ac : 'rgba(255,255,255,0.3)'),
              fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{tt(label)}</button>
        ))}
      </div>
      {/* Bottom control bar */}
      <div style={{
        background: 'rgba(0,0,0,0.85)', borderTop: '1px solid rgba(255,255,255,0.1)',
        padding: 14, display: 'flex', gap: 10, alignItems: 'stretch',
      }}>
        <button onClick={voiceOn ? stopVoice : startVoice}
          style={{
            padding: '10px 14px',
            background: voiceOn ? C.ac : 'transparent',
            color: '#FFFFFF',
            border: '1px solid ' + (voiceOn ? C.ac : 'rgba(255,255,255,0.3)'),
            fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            cursor: 'pointer',
            minWidth: 130, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{voiceOn ? `🎤 ${tt('LISTENING')}` : `🎤 ${tt('VOICE OFF')}`}</button>
        {/* (the 3D body is the ANATOMY tool in the row above - #774) */}
        {status !== 'counting' ? (
          <button onClick={beginCounting}
            style={{
              flex: 1, padding: '14px', background: C.ac,
              border: `1px solid ${C.ac}`, color: '#FFFFFF',
              fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>{tt('START COUNTING →')}</button>
        ) : (
          <button onClick={stopCounting}
            style={{
              flex: 1, padding: '14px', background: C.rd,
              border: `1px solid ${C.rd}`, color: '#FFFFFF',
              fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>■ {reps === 1 ? tt('STOP · 1 REPS') : tt('STOP · {n} REPS').replace('{n}', reps)}</button>
        )}
      </div>
    </div>
  ), document.body);
}

// the skeleton + joint angles: the shared engine (poseOverlay.js), on the camera's native-resolution canvas, mirrored
// like the self-view video
function drawSkeleton(canvas, video, ovl, tools, t = null) {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (ovl) ovl.draw(ctx, { w, h, px: (p) => (1 - p.x) * w, py: (p) => p.y * h, skeleton: tools.skeleton, angles: tools.angles, t });
}
