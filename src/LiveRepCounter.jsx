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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { ANGLE_DEFS, angleAt, detectChannels, isReal } from './repCounter';

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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const recognitionRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | loading | listening | counting | stopped
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState('top'); // top | bottom
  const [lastAngle, setLastAngle] = useState(null);
  const [error, setError] = useState(null);
  const [voiceOn, setVoiceOn] = useState(false);

  const { kind, channels } = detectChannels(exerciseTitle);
  const thr = KIND_THRESHOLDS[kind];

  // Smoothing buffer + phase tracking lives in refs so the RAF loop
  // doesn't trigger React re-renders every frame.
  const angleBufRef = useRef([]);
  const phaseRef = useRef('top');

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
      numPoses: 1,
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
      setError('Voice trigger needs the Web Speech API — open in Chrome or Edge.');
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
        if (status !== 'counting') beginCounting();
      } else if (VOICE_STOP_PHRASES.some(p => text.includes(p))) {
        if (status === 'counting') stopCounting();
      }
    };
    rec.onerror = (e) => { console.warn('voice err:', e.error); };
    rec.onend = () => { if (voiceOn) { try { rec.start(); } catch {} } };
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
    const ts = performance.now();
    let result;
    try { result = lm.detectForVideo(v, ts); } catch { result = null; }

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
        setLastAngle(smooth);
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
      drawSkeleton(canvasRef.current, v, result.landmarks?.[0]);
    } else {
      drawSkeleton(canvasRef.current, v, null);
    }
    rafRef.current = requestAnimationFrame(frameLoop);
  }, [channels, thr]);

  const beginCounting = useCallback(async () => {
    if (status === 'counting') return;
    setError(null);
    setStatus('loading');
    try {
      if (!streamRef.current) await startCamera();
      await loadPose();
      setReps(0);
      angleBufRef.current = [];
      phaseRef.current = 'top';
      setPhase('top');
      setStatus('counting');
      rafRef.current = requestAnimationFrame(frameLoop);
    } catch (e) {
      setStatus('idle');
      setError(e.message || 'Could not start counting.');
    }
  }, [status, startCamera, loadPose, frameLoop]);

  const stopCounting = useCallback(() => {
    setStatus('stopped');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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
  return (
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
            LIVE COUNT · {exerciseTitle.toUpperCase()}
          </div>
          {targetReps && (
            <div style={{ fontFamily: FN, fontSize: 11, color: '#FFFFFF', letterSpacing: '0.12em', fontWeight: 700, marginTop: 4 }}>
              TARGET: {targetReps}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(0,0,0,0.5)', border: `1px solid rgba(255,255,255,0.3)`,
          color: '#FFFFFF', padding: '6px 12px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
          cursor: 'pointer',
        }}>← BACK</button>
      </div>

      {/* Camera + skeleton overlay */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: 'scaleX(-1)',  // mirror for self-recording so motion reads natural
        }} />
        <canvas ref={canvasRef} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          transform: 'scaleX(-1)',
          pointerEvents: 'none',
        }} />

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
            PHASE: {phase.toUpperCase()} · {isReal(lastAngle) ? `${Math.round(lastAngle)}°` : '—'}
          </div>
        )}
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFFFFF', fontFamily: FN, fontSize: 14, letterSpacing: '0.18em', fontWeight: 700,
          }}>STARTING CAMERA + POSE…</div>
        )}
        {status === 'idle' && !error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
            color: '#FFFFFF', fontFamily: FN, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 64 }}>🎯</div>
            <div style={{ fontSize: 14, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>
              READY TO COUNT
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 340, lineHeight: 1.5 }}>
              Stand 2m from the camera with your full body in frame. Tap START or say "start" / "התחל" once set up.
            </div>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
            color: '#FFFFFF', fontFamily: FN, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36 }}>⚠</div>
            <div style={{ fontSize: 13, color: C.rd, letterSpacing: '0.04em' }}>{error}</div>
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <div style={{
        background: 'rgba(0,0,0,0.85)', borderTop: '1px solid rgba(255,255,255,0.1)',
        padding: 14, display: 'flex', gap: 10, alignItems: 'center',
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
          }}>{voiceOn ? '🎤 LISTENING' : '🎤 VOICE OFF'}</button>
        {status !== 'counting' ? (
          <button onClick={beginCounting}
            style={{
              flex: 1, padding: '14px', background: C.ac,
              border: `1px solid ${C.ac}`, color: '#FFFFFF',
              fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>START COUNTING →</button>
        ) : (
          <button onClick={stopCounting}
            style={{
              flex: 1, padding: '14px', background: C.rd,
              border: `1px solid ${C.rd}`, color: '#FFFFFF',
              fontFamily: FN, fontSize: 14, fontWeight: 700, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>■ STOP · {reps} REPS</button>
        )}
      </div>
    </div>
  );
}

// Lightweight skeleton overlay — connections list from MediaPipe Pose
// landmark spec. Kept minimal so the live overlay stays fast.
const POSE_CONNECTIONS = [
  [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 12], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];
function drawSkeleton(canvas, video, landmarks) {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;
  ctx.strokeStyle = '#3BA0FF';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#3BA0FF';
  POSE_CONNECTIONS.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b];
    if (!la || !lb) return;
    ctx.beginPath();
    ctx.moveTo(la.x * w, la.y * h);
    ctx.lineTo(lb.x * w, lb.y * h);
    ctx.stroke();
  });
  landmarks.forEach(lm => {
    if (!lm) return;
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}
