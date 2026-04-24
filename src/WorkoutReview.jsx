import React, { useState, useRef, useEffect } from 'react';
import WorkoutsView from './WorkoutsView';
import { C, FN, FB, ytId, EXPO_ICON } from './theme';
import { EX } from './exerciseData';
import {
  ANGLE_DEFS, angleAt, detectChannels, medianFilter, findPeaks, trimOutlierPeaks, SMOOTH_N,
} from './repCounter';

const bi = {background:C.sf2,border:`1px solid ${C.bd}`,padding:"8px 10px",borderRadius:6,
  color:C.tx,fontFamily:FB,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

// MediaPipe Pose landmark indices for skeleton drawing + joint-angle calc.
const POSE_CONNECTIONS = [
  [11,12],[11,23],[12,24],[23,24],   // torso
  [11,13],[13,15],                    // left arm
  [12,14],[14,16],                    // right arm
  [23,25],[25,27],                    // left leg
  [24,26],[26,28],                    // right leg
];

// ANGLE_DEFS, angleAt, detectChannels, medianFilter, findPeaks, SMOOTH_N
// now live in src/repCounter.js — imported above. They're shared with the
// client-side auto-count on upload (ClientPortal.jsx) so both paths run
// identical algorithm.

// Rep counting algorithm (ANGLE_DEFS / angleAt / detectChannels / medianFilter
// / findPeaks / SMOOTH_N) moved to src/repCounter.js — imported at the top so
// the client's upload-time auto-count runs the same code.

// Form-video player: speed control (0.125x recovers old fast-motion webm),
// frame-step (←/→ ~ 1/30s), fullscreen, and an optional MediaPipe Pose
// overlay with live joint angles + rep counter.
// `exerciseTitle` lets the rep counter auto-pick the right joint (knee/hip/
// elbow) instead of always-knee. If omitted, defaults to 'auto' which falls
// back to 'knee'. Trainer can override via the dropdown next to REPS.
// `onVideoRef` lets a parent grab the underlying <video> element (used by
// the side-by-side compare view to sync timing across two players).
function FormVideoPlayer({ url, exerciseTitle, onVideoRef }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  // Offline peak-detection rep counter state:
  //   signalBufs[channel] — dense arrays indexed by video-frame bucket
  //     (Math.round(vt * BUCKET_FPS)). Raw angle per bucket; NaN for frames
  //     MediaPipe hasn't visited yet. Scrubbing back re-visits the same
  //     bucket and overwrites, so the buffer always reflects the latest
  //     reading per frame regardless of playback order.
  //   lastPeakRunAt — video-time of the last findPeaks run; throttles re-runs
  //     to ~5 Hz so we aren't re-peak-finding on every frame.
  const repStateRef = useRef({ signalBufs: {}, lastPeakRunAt: -1 });
  // Ref-backed counters so the detection loop can increment them without
  // colliding with stale closure captures (the previous setState-from-closure
  // approach kept resetting count to 1 on every rep).
  const repsCountRef = useRef(0);
  const lastTempoRef = useRef(null);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [poseOn, setPoseOn] = useState(false);
  const [poseLoading, setPoseLoading] = useState(false);
  const [poseError, setPoseError] = useState('');
  const [angles, setAngles] = useState({});
  const [repsOn, setRepsOn] = useState(false);
  const [reps, setReps] = useState(0);
  const [tempo, setTempo] = useState(null); // seconds of video time for last rep
  // Override which joint-channels feed the peak detector. 'auto' = derive from
  // exercise title. Manual overrides let the trainer force a channel pair for
  // exercises the classifier mismapped.
  const [trackOverride, setTrackOverride] = useState('auto');
  const autoPick = detectChannels(exerciseTitle);
  const activeChannels =
    trackOverride === 'auto' ? autoPick.channels :
    trackOverride === 'hip'  ? ['L HIP', 'R HIP'] :
    trackOverride === 'knee' ? ['L KNE', 'R KNE'] :
    trackOverride === 'elbow'? ['L ELB', 'R ELB'] :
    trackOverride === 'sho'  ? ['L SHO', 'R SHO'] :
    []; // 'none'
  const activeKind =
    trackOverride === 'auto' ? autoPick.kind :
    trackOverride;
  // Ref-mirrored so the detection loop's closure can read the LATEST selection
  // without needing the effect to re-subscribe every render (activeChannels is
  // a fresh array each render → can't just put it in the effect's deps).
  const activeChannelsRef = useRef(activeChannels);
  useEffect(() => { activeChannelsRef.current = activeChannels; }, [trackOverride, exerciseTitle]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (videoRef.current) videoRef.current.loop = loop; }, [loop]);

  // Hand the <video> element back to the parent if it asked for it.
  useEffect(() => { if (onVideoRef && videoRef.current) onVideoRef(videoRef.current); }, [onVideoRef, url]);

  // Reset rep state when toggle flips or a new video loads. `trackOverride`
  // is intentionally NOT in this dep list — all 8 channels are stored in the
  // buffer, so switching the tracked region just re-runs findPeaks on a
  // different subset without needing a replay.
  useEffect(() => {
    setReps(0); setTempo(null);
    repsCountRef.current = 0;
    lastTempoRef.current = null;
    repStateRef.current = { signalBufs: {}, lastPeakRunAt: -1 };
  }, [repsOn, url]);

  // When the channel override changes (or auto-picked exerciseTitle changes),
  // force a fresh findPeaks on whatever data is already in the buffer. Without
  // this effect, a paused video wouldn't update the count because the detect
  // loop only fires on decoded frames.
  useEffect(() => {
    if (!repsOn) return;
    const st = repStateRef.current;
    if (activeChannels.length === 0) {
      repsCountRef.current = 0;
      setReps(0);
      return;
    }
    const vt = videoRef.current?.currentTime || 0;
    const curBucket = Math.round(vt * 30);
    const minDist = Math.max(4, Math.round(30 * 0.4));
    let bestCount = 0;
    for (const key of activeChannels) {
      const sig = st.signalBufs[key];
      if (!sig || sig.length < 10) continue;
      const truncated = sig.slice(0, Math.max(0, curBucket + 1));
      if (truncated.length < 10) continue;
      const smoothed = medianFilter(truncated, SMOOTH_N);
      // Invert to count troughs: every rep has exactly one flexion bottom
      // regardless of whether the clip starts extended or flexed.
      const inverted = smoothed.map(x => Number.isFinite(x) ? -x : x);
      const troughs = trimOutlierPeaks(findPeaks(inverted, 25, minDist), 2.0);
      if (troughs.length > bestCount) bestCount = troughs.length;
    }
    repsCountRef.current = bestCount;
    setReps(bestCount);
    st.lastPeakRunAt = -1;
  }, [trackOverride, exerciseTitle, repsOn]);

  const fullscreen = () => {
    const v = videoRef.current; if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  };

  // Frame-step assumes 30fps source (typical phone clip). For a 60fps clip
  // this advances 2 frames per click — close enough for form review.
  const stepFrame = (frames) => {
    const v = videoRef.current; if (!v) return;
    if (!v.paused) v.pause();
    const dt = frames / 30;
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.001, v.currentTime + dt));
  };

  // (No seek reset: signal buffer is indexed by frame bucket, so scrubbing
  // re-visits the same index and overwrites. Count survives scrub/step-frame.)

  // Shared lazy-loader so both POSE and REPS toggles can fetch the model.
  const ensureModel = async () => {
    if (landmarkerRef.current) return true;
    setPoseLoading(true);
    setPoseError('');
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
      );
      const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    } catch (e) {
      console.error('Pose load failed:', e);
      setPoseError('Model load failed');
      setPoseLoading(false);
      return false;
    }
    setPoseLoading(false);
    return true;
  };

  const togglePose = async () => {
    if (poseOn) { setPoseOn(false); return; }
    if (await ensureModel()) setPoseOn(true);
  };

  const toggleReps = async () => {
    if (repsOn) { setRepsOn(false); return; }
    if (await ensureModel()) setRepsOn(true);
  };

  useEffect(() => {
    // Detection runs whenever EITHER overlay (POSE) or rep counter (REPS) is on.
    if (!poseOn && !repsOn) {
      const c = canvasRef.current;
      if (c && c.width && c.height) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      setAngles({});
      return;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    const lm = landmarkerRef.current;
    if (!v || !c || !lm) return;

    let active = true;
    const ctx = c.getContext('2d');
    let lastTs = -1;
    let pendingAngles = {};
    // Throttle the React HUD update — angle numbers don't need 60Hz.
    const hudInterval = setInterval(() => {
      if (!active) return;
      setAngles(pendingAngles);
      // Always sync reps/tempo from refs — refs hold canonical state, the
      // detection loop mutates them directly.
      setReps(repsCountRef.current);
      setTempo(lastTempoRef.current);
    }, 200);

    const detect = () => {
      if (!active) return;
      const w = v.clientWidth, h = v.clientHeight;
      if (w > 0 && h > 0 && v.readyState >= 2) {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        // Use performance.now() consistently so timestamps stay monotonic.
        // (Mixing performance.now with metadata.mediaTime causes MediaPipe to
        // silently reject backward timestamps and break the loop.)
        const ts = Math.max(performance.now(), lastTs + 0.001);
        if (ts > lastTs) {
          lastTs = ts;
          try {
            const result = lm.detectForVideo(v, ts);
            ctx.clearRect(0, 0, w, h);
            const lms = result.landmarks?.[0];
            // worldLandmarks are 3D metric coords (meters, hip-centered) —
            // use them for joint-angle math so camera perspective doesn't
            // distort the result. Fall back to 2D `lms` if absent.
            const wlms = result.worldLandmarks?.[0] || lms;
            // Map normalized landmark coords (0..1 of the intrinsic frame)
            // into the letterboxed pixel rect inside the <video> element.
            // Default object-fit: contain — a portrait clip in a landscape
            // element leaves black bars on the sides; drawing at a.x*w
            // would stretch the skeleton across the whole element including
            // those bars. Compute the actual displayed rect and offset into it.
            const vw = v.videoWidth || w, vh = v.videoHeight || h;
            const s = Math.min(w / vw, h / vh);
            const dw = vw * s, dh = vh * s;
            const ox = (w - dw) / 2, oy = (h - dh) / 2;
            const px = (p) => ox + p.x * dw;
            const py = (p) => oy + p.y * dh;
            if (lms) {
              // Skeleton + dots only when the overlay is enabled. Rep counting
              // still runs silently when only REPS is on.
              if (poseOn) {
                ctx.strokeStyle = '#3BA0FF';
                ctx.lineWidth = 2;
                for (const [i, j] of POSE_CONNECTIONS) {
                  const a = lms[i], b = lms[j];
                  if (!a || !b) continue;
                  ctx.beginPath();
                  ctx.moveTo(px(a), py(a));
                  ctx.lineTo(px(b), py(b));
                  ctx.stroke();
                }
                ctx.fillStyle = '#fff';
                for (const p of lms) {
                  ctx.beginPath();
                  ctx.arc(px(p), py(p), 3, 0, 2*Math.PI);
                  ctx.fill();
                }
              }
              const next = {};
              for (const d of ANGLE_DEFS) {
                const val = angleAt(wlms, d.a, d.b, d.c);
                if (val != null) next[d.name] = Math.round(val);
              }
              pendingAngles = next;

              // Rep counter: write every frame's raw angles into dense per-
              // channel buffers at index = round(vt * BUCKET_FPS). Scrubbing
              // back re-visits the same index and overwrites. Every ~0.2s of
              // video time, median-filter each tracked channel's buffer and
              // run findPeaks; display max peak count across channels.
              // All 8 channels are stored (not just the active ones) so
              // switching the override dropdown doesn't require a replay.
              const BUCKET_FPS = 30;
              if (repsOn) {
                const st = repStateRef.current;
                const vt = v.currentTime;
                const bucket = Math.round(vt * BUCKET_FPS);
                for (const d of ANGLE_DEFS) {
                  const key = d.name;
                  if (!st.signalBufs[key]) st.signalBufs[key] = [];
                  const raw = next[key];
                  st.signalBufs[key][bucket] = raw != null ? raw : NaN;
                }
                // Read the CURRENT override selection from the ref — not the
                // closure-captured value, which would be stale if the user
                // changed the dropdown mid-playback.
                const activeCh = activeChannelsRef.current;
                if (activeCh.length === 0) {
                  repsCountRef.current = 0;
                } else {
                  // Run findPeaks every tick (no throttle — a full run is
                  // ~40k ops on a 30s clip, cheap enough to do per frame).
                  // Truncate each channel at the current playhead so the
                  // count reflects playback progress — scrubbing backward
                  // drops the count, matching user expectation.
                  const minDist = Math.max(4, Math.round(BUCKET_FPS * 0.4));
                  const curBucket = Math.round(v.currentTime * BUCKET_FPS);
                  let bestCount = 0;
                  for (const key of activeCh) {
                    const sig = st.signalBufs[key];
                    if (!sig || sig.length < 10) continue;
                    const truncated = sig.slice(0, Math.max(0, curBucket + 1));
                    if (truncated.length < 10) continue;
                    const smoothed = medianFilter(truncated, SMOOTH_N);
                    // Count troughs: invert signal, findPeaks = find flexion bottoms.
                    const inverted = smoothed.map(x => Number.isFinite(x) ? -x : x);
                    const troughs = trimOutlierPeaks(findPeaks(inverted, 25, minDist), 2.0);
                    if (troughs.length > bestCount) bestCount = troughs.length;
                  }
                  repsCountRef.current = bestCount;
                  lastTempoRef.current = bestCount > 1 ? vt / bestCount : null;
                }
              }
            }
          } catch { /* swallow per-frame detect errors */ }
        }
      }
      // Re-arm: rVFC fires once per actual decoded frame (idle when paused),
      // so we don't waste detection cycles on duplicate frames.
      if (typeof v.requestVideoFrameCallback === 'function') {
        v.requestVideoFrameCallback(detect);
      } else {
        rafRef.current = requestAnimationFrame(detect);
      }
    };

    // Kick off the loop and run an immediate detection so the overlay shows
    // even when the video is currently paused on a frame.
    if (typeof v.requestVideoFrameCallback === 'function') {
      v.requestVideoFrameCallback(detect);
    } else {
      rafRef.current = requestAnimationFrame(detect);
    }
    detect();

    // Re-detect on scrub / load so a paused video updates its overlay.
    v.addEventListener('seeked', detect);
    v.addEventListener('loadeddata', detect);

    // Pressing Play restarts the rep count from 0. Each play → pause cycle is
    // a fresh counting session. Clears only the rep-counter buffers, not the
    // pose-overlay cache. Deliberately no reset on `seeked` or `pause` — only
    // the Play button resets.
    const onPlay = () => {
      if (!repsOn) return;
      repStateRef.current.signalBufs = {};
      repsCountRef.current = 0;
      lastTempoRef.current = null;
      setReps(0);
      setTempo(null);
    };
    v.addEventListener('play', onPlay);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (hudInterval) clearInterval(hudInterval);
      v.removeEventListener('seeked', detect);
      v.removeEventListener('loadeddata', detect);
      v.removeEventListener('play', onPlay);
    };
  }, [poseOn, repsOn]);

  useEffect(() => () => {
    if (landmarkerRef.current) {
      try { landmarkerRef.current.close(); } catch {}
      landmarkerRef.current = null;
    }
  }, []);

  const speeds = [0.125, 0.25, 0.5, 1, 2];
  return (
    <div>
      <div style={{position:'relative',marginBottom:6,lineHeight:0}}>
        <video ref={videoRef} src={url} controls playsInline crossOrigin="anonymous"
          style={{display:'block',width:'100%',borderRadius:8,maxHeight:400,background:C.sf2}} />
        <canvas ref={canvasRef}
          style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',
            pointerEvents:'none',display:poseOn?'block':'none'}} />
        {(poseOn || repsOn) && (Object.keys(angles).length > 0 || repsOn) && (
          <div style={{position:'absolute',top:6,right:6,background:'rgba(10,10,11,0.78)',
            borderRadius:6,padding:'6px 8px',pointerEvents:'none',fontFamily:FN,fontSize:10,
            color:'#fff',lineHeight:1.5,minWidth:96}}>
            {repsOn && (
              <div style={{paddingBottom:4,marginBottom:poseOn?4:0,textAlign:'center',
                borderBottom:poseOn?`1px solid ${C.bd}`:'none'}}>
                <div style={{fontSize:9,color:C.td,letterSpacing:0.5}}>REPS</div>
                <div style={{fontSize:18,fontWeight:700,color:C.gn,lineHeight:1}}>{reps}</div>
                {tempo != null && <div style={{fontSize:9,color:C.tm,marginTop:2}}>{tempo.toFixed(1)}s</div>}
              </div>
            )}
            {poseOn && ANGLE_DEFS.map(d => (
              <div key={d.name} style={{display:'flex',justifyContent:'space-between',gap:8}}>
                <span style={{color:C.td}}>{d.name}</span>
                <span>{angles[d.name] != null ? angles[d.name] + '°' : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
        <button onClick={() => stepFrame(-1)} title="Previous frame"
          style={{padding:'3px 8px',borderRadius:4,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,cursor:'pointer'}}>◀</button>
        <button onClick={() => stepFrame(1)} title="Next frame"
          style={{padding:'3px 8px',borderRadius:4,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:11,cursor:'pointer'}}>▶</button>
        <span style={{fontSize:9,fontFamily:FN,color:C.td,marginLeft:6,marginRight:4,letterSpacing:0.5}}>SPEED</span>
        {speeds.map(s => (
          <button key={s} onClick={() => setSpeed(s)}
            style={{padding:'3px 8px',borderRadius:4,border:`1px solid ${speed===s?C.ac:C.bd}`,
              background:speed===s?C.acD:'transparent',color:speed===s?C.ac:C.tm,
              fontFamily:FN,fontSize:10,cursor:'pointer'}}>{s}x</button>
        ))}
        <button onClick={togglePose} disabled={poseLoading}
          style={{marginLeft:8,padding:'3px 10px',borderRadius:4,border:`1px solid ${poseOn?C.ac:C.bd}`,
            background:poseOn?C.acD:'transparent',color:poseOn?C.ac:C.tm,
            fontFamily:FN,fontSize:10,cursor:poseLoading?'wait':'pointer',opacity:poseLoading?0.6:1}}>
          {poseLoading ? 'LOADING…' : poseOn ? 'POSE ON' : 'POSE'}
        </button>
        <button onClick={toggleReps} disabled={poseLoading}
          title={activeKind === 'none' ? 'Isometric — counter off' : `Tracking ${activeKind} for rep cycles (${activeChannels.join(' + ')})`}
          style={{padding:'3px 10px',borderRadius:4,border:`1px solid ${repsOn?C.gn:C.bd}`,
            background:repsOn?C.gnD:'transparent',color:repsOn?C.gn:C.tm,
            fontFamily:FN,fontSize:10,cursor:poseLoading?'wait':'pointer',opacity:poseLoading?0.6:1}}>
          {repsOn ? `REPS ${reps}` : 'REPS'}
        </button>
        {repsOn && (
          <select value={trackOverride} onChange={e => setTrackOverride(e.target.value)}
            title="Which joint pair to count peaks on"
            style={{padding:'3px 6px',borderRadius:4,border:`1px solid ${C.bd}`,
              background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>
            <option value="auto">AUTO ({(autoPick.kind || 'none').toUpperCase()})</option>
            <option value="hip">HIP</option>
            <option value="knee">KNEE</option>
            <option value="elbow">ELBOW</option>
            <option value="sho">SHOULDER</option>
            <option value="none">SKIP</option>
          </select>
        )}
        {poseError && <span style={{fontSize:9,color:C.rd,marginLeft:4}}>{poseError}</span>}
        <button onClick={() => setLoop(v => !v)} title="Loop the video"
          style={{marginLeft:'auto',padding:'3px 10px',borderRadius:4,border:`1px solid ${loop?C.ac:C.bd}`,
            background:loop?C.acD:'transparent',color:loop?C.ac:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>↻ LOOP</button>
        <button onClick={fullscreen}
          style={{padding:'3px 10px',borderRadius:4,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>⛶ FULL</button>
      </div>
    </div>
  );
}

// Side-by-side video compare. Two FormVideoPlayer instances + a sync button
// that copies the left player's currentTime onto the right (cheap manual sync,
// good enough for "this week vs 4 weeks ago" form review).
function CompareModal({ leftLabel, leftUrl, leftTitle, rightLabel, rightUrl, rightTitle, onClose }) {
  const [leftVid, setLeftVid] = useState(null);
  const [rightVid, setRightVid] = useState(null);
  const sync = (target) => {
    if (!leftVid || !rightVid) return;
    if (target === 'right') rightVid.currentTime = leftVid.currentTime;
    else leftVid.currentTime = rightVid.currentTime;
  };
  const playBoth = () => { leftVid?.play(); rightVid?.play(); };
  const pauseBoth = () => { leftVid?.pause(); rightVid?.pause(); };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:32,overflow:'auto'}}>
      <div onClick={e => e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.bd}`,borderRadius:12,width:'min(1400px, 96vw)',padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h3 style={{margin:0,fontFamily:FN,fontSize:16,color:C.tx}}>Compare</h3>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={playBoth} style={{background:C.acD,border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:11,padding:'6px 12px',borderRadius:6,cursor:'pointer'}}>▶ PLAY BOTH</button>
            <button onClick={pauseBoth} style={{background:C.sf2,border:`1px solid ${C.bd}`,color:C.tm,fontFamily:FN,fontSize:11,padding:'6px 12px',borderRadius:6,cursor:'pointer'}}>❚❚ PAUSE</button>
            <button onClick={onClose} style={{background:'none',border:'none',color:C.tm,cursor:'pointer',fontSize:18,padding:'0 8px'}}>✕</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:12,alignItems:'start'}}>
          <div>
            <div style={{fontSize:11,fontFamily:FN,color:C.tm,marginBottom:6}}>{leftLabel}</div>
            <FormVideoPlayer url={leftUrl} exerciseTitle={leftTitle} onVideoRef={setLeftVid} />
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,paddingTop:24}}>
            <button onClick={() => sync('right')} title="Copy left timestamp to right"
              style={{background:C.sf2,border:`1px solid ${C.bd}`,color:C.tm,fontFamily:FN,fontSize:10,padding:'6px 8px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'}}>SYNC →</button>
            <button onClick={() => sync('left')} title="Copy right timestamp to left"
              style={{background:C.sf2,border:`1px solid ${C.bd}`,color:C.tm,fontFamily:FN,fontSize:10,padding:'6px 8px',borderRadius:4,cursor:'pointer',whiteSpace:'nowrap'}}>← SYNC</button>
          </div>
          <div>
            <div style={{fontSize:11,fontFamily:FN,color:C.tm,marginBottom:6}}>{rightLabel}</div>
            <FormVideoPlayer url={rightUrl} exerciseTitle={rightTitle} onVideoRef={setRightVid} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkoutReview({ clientWorkouts, weeklyFocus, setWeeklyFocus, workouts, setWorkouts, planIndex, trainees, exercises, onDecrementSession, markReviewed }) {
  const [subTab, setSubTab] = useState("review");
  const [selectedWo, setSelectedWo] = useState(null);
  const [expandedEx, setExpandedEx] = useState(null);
  // Compare flow: when set, shows picker modal for selecting the second video.
  // After pick, switches to CompareModal with both URLs.
  const [comparePicker, setComparePicker] = useState(null); // { left: {url,label}, candidates: [...] }
  const [compareActive, setCompareActive] = useState(null); // { left, right }

  const nameOf = (cid) => (trainees || []).find(t => t.id === cid)?.name || cid || 'unknown';

  // Group workouts by client — use real trainee names, no hardcoded ID map.
  const byClient = {};
  clientWorkouts.forEach(w => {
    const key = w.clientId || 'unknown';
    if (!byClient[key]) byClient[key] = { name: nameOf(key), workouts: [] };
    byClient[key].workouts.push(w);
  });

  const setFocus = (planName, dayName, eid, week, val) => {
    const fk = `${planName}|${dayName}|${eid}|W${week}`;
    setWeeklyFocus(prev => {
      const next = { ...prev };
      if (val.trim()) next[fk] = val.trim();
      else delete next[fk];
      return next;
    });
  };

  const getFocus = (planName, dayName, eid, week) => {
    const fk = `${planName}|${dayName}|${eid}|W${week}`;
    return weeklyFocus?.[fk] || '';
  };

  // ===== SUB-NAV =====
  const subNav = (
    <div style={{display:"flex",gap:4,marginBottom:16}}>
      {[["review","Review Client Workouts"],["log","Log In-Person Session"]].map(([k,l]) => (
        <button key={k} onClick={() => {setSubTab(k);setSelectedWo(null);setExpandedEx(null)}}
          style={{flex:1,padding:"10px 0",borderRadius:8,border:`1px solid ${subTab===k?C.ac:C.bd}`,
            background:subTab===k?C.acD:"transparent",color:subTab===k?C.ac:C.tm,
            fontFamily:FB,fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
      ))}
    </div>
  );

  // ===== LOG IN-PERSON SESSION (wraps WorkoutsView) =====
  if (subTab === "log") return (
    <div>
      {subNav}
      <WorkoutsView workouts={workouts} setWorkouts={setWorkouts} planIndex={planIndex} trainees={trainees} exercises={exercises} onDecrementSession={onDecrementSession} />
    </div>
  );

  // ===== WORKOUT DETAIL VIEW =====
  if (selectedWo) {
    const wo = clientWorkouts.find(w => w.id === selectedWo);
    if (!wo) { setSelectedWo(null); return null; }
    const nextWeek = (wo.week || 1) + 1 > 4 ? 4 : (wo.week || 1) + 1;
    const completedSets = wo.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const totalSets = wo.exercises.reduce((a, ex) => a + ex.sets.length, 0);

    return (
      <div>
        {/* Compare picker: pick second video from the same client */}
        {comparePicker && (
          <div onClick={() => setComparePicker(null)} style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:60,backdropFilter:'blur(4px)'}}>
            <div onClick={e => e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,width:520,maxHeight:'80vh',overflow:'auto',padding:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{margin:0,fontFamily:FN,fontSize:15,color:C.tx}}>Compare with…</h3>
                <button onClick={() => setComparePicker(null)} style={{background:'none',border:'none',color:C.tm,cursor:'pointer',fontSize:16}}>✕</button>
              </div>
              <div style={{fontSize:11,color:C.tm,marginBottom:10}}>{comparePicker.candidates.length} other video{comparePicker.candidates.length===1?'':'s'} from this client:</div>
              {comparePicker.candidates.map((c, i) => (
                <div key={i} onClick={() => { setCompareActive({ left: comparePicker.left, right: { url: c.cloudUrl, label: c.label, title: c.title } }); setComparePicker(null); }}
                  style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:8,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}>
                  <div style={{fontSize:12,color:C.tx}}>{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Compare modal: two players side by side */}
        {compareActive && (
          <CompareModal
            leftLabel={compareActive.left.label} leftUrl={compareActive.left.url} leftTitle={compareActive.left.title}
            rightLabel={compareActive.right.label} rightUrl={compareActive.right.url} rightTitle={compareActive.right.title}
            onClose={() => setCompareActive(null)}
          />
        )}
        <button onClick={() => { setSelectedWo(null); setExpandedEx(null); }}
          style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0,marginBottom:12}}>
          ← Back to workouts
        </button>

        {/* Workout header */}
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:16,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <h2 style={{margin:0,fontFamily:FN,fontSize:18,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {nameOf(wo.clientId)} — {wo.planName}
                {wo.reviewedAt && (
                  <span style={{fontSize:9,fontFamily:FN,color:C.gn,fontWeight:700,letterSpacing:0.5,
                    padding:"2px 6px",borderRadius:3,border:`1px solid ${C.gn}40`,background:C.gnD}}>
                    ✓ REVIEWED
                  </span>
                )}
              </h2>
              <div style={{fontSize:12,color:C.tm,marginTop:4}}>
                Week {wo.week} · {wo.dayName} · {new Date(wo.date).toLocaleDateString()}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:18,fontWeight:700,fontFamily:FN,color:C.gn}}>{completedSets}/{totalSets}</div>
              <div style={{fontSize:9,fontFamily:FN,color:C.td}}>SETS DONE</div>
            </div>
          </div>

          {/* Autoregulation data */}
          {wo.autoregulation && (
            <div style={{display:"flex",gap:12,marginTop:12}}>
              {[['Pain',wo.autoregulation.pain,C.rd],['Energy',wo.autoregulation.energy,C.gn],['Sleep',wo.autoregulation.sleep,C.pu]].map(([l,v,col]) => (
                <div key={l} style={{flex:1,background:C.sf2,borderRadius:6,padding:8,textAlign:"center"}}>
                  <div style={{fontSize:9,fontFamily:FN,color:C.td}}>{l.toUpperCase()}</div>
                  <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:v?col:C.td}}>{v || '—'}</div>
                </div>
              ))}
            </div>
          )}
          {wo.notes && (
            <div style={{marginTop:10,background:C.sf2,borderRadius:6,padding:10}}>
              <div style={{fontSize:9,fontFamily:FN,color:C.td,marginBottom:4}}>CLIENT NOTES</div>
              <div style={{fontSize:13,color:C.tx}}>{wo.notes}</div>
            </div>
          )}
        </div>

        {/* Exercise cards */}
        {wo.exercises.map((ex, i) => {
          const isExpanded = expandedEx === i;
          const doneSets = ex.sets.filter(s => s.done).length;
          const exName = EX[ex.eid]?.t || ex.title || ex.eid;
          const formVideo = wo.formVideos?.[i];
          const currentFocus = getFocus(wo.planName, wo.dayName, ex.eid, wo.week || 1);
          const nextFocus = getFocus(wo.planName, wo.dayName, ex.eid, nextWeek);

          return (
            <div key={i} style={{background:C.sf,border:`1px solid ${isExpanded?C.ac+'40':C.bd}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
              {/* Header row — click to expand */}
              <div onClick={() => setExpandedEx(isExpanded?null:i)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer"}}>
                <div style={{width:26,height:26,borderRadius:6,background:doneSets===ex.sets.length?C.gnD:C.acD,
                  display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FN,fontSize:11,fontWeight:700,
                  color:doneSets===ex.sets.length?C.gn:C.ac,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{exName}</div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    {ex.prescribed} · {doneSets}/{ex.sets.length} sets
                    {(formVideo?.has || formVideo?.cloudUrl) && <span style={{color:C.gn,marginLeft:6}}>📹</span>}
                  </div>
                </div>
                {nextFocus && <div style={{width:6,height:6,borderRadius:3,background:C.ac,flexShrink:0}} />}
                <span style={{color:C.td,fontSize:11}}>{isExpanded?'▲':'▼'}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.bd}`}}>
                  {/* Set-by-set data */}
                  <div style={{marginTop:10,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,marginBottom:4}}>
                      {['SET','REPS','LOAD','RPE'].map(h =>
                        <div key={h} style={{fontSize:9,fontFamily:FN,color:C.td,textAlign:h==='SET'?'center':'left'}}>{h}</div>)}
                    </div>
                    {ex.sets.map((set, si) => (
                      <div key={si} style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:4,padding:"3px 0",
                        opacity:set.done?1:0.4,borderBottom:si<ex.sets.length-1?`1px solid ${C.bd}22`:'none'}}>
                        <div style={{fontFamily:FN,fontSize:12,color:set.done?C.gn:C.td,textAlign:"center"}}>{set.done?'✓':si+1}</div>
                        <div style={{fontSize:12,color:C.tx}}>{set.reps||'—'}</div>
                        <div style={{fontSize:12,color:C.tx}}>{set.load?set.load+'kg':'—'}</div>
                        <div style={{fontSize:12,color:C.tx}}>{set.rpe||'—'}</div>
                      </div>
                    ))}
                  </div>

                  {/* Client's form video */}
                  {(formVideo?.has || formVideo?.cloudUrl) ? (
                    <div style={{background:C.gnD,border:`1px solid ${C.gn}30`,borderRadius:8,padding:12,marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{fontSize:10,fontFamily:FN,color:C.gn,fontWeight:700}}>📹 FORM VIDEO SUBMITTED</div>
                          {typeof formVideo.repCount === 'number' && formVideo.repKind && formVideo.repKind !== 'none' && <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,background:C.acD,padding:'2px 8px',borderRadius:10}}>🔢 {formVideo.repCount} REPS</div>}
                        </div>
                        {formVideo.cloudUrl && (() => {
                          // Build picker candidates: every other form video for this client.
                          const candidates = clientWorkouts
                            .filter(w => w.clientId === wo.clientId)
                            .flatMap(w => (w.formVideos || []).map((fv, fi) => fv?.cloudUrl ? {
                              cloudUrl: fv.cloudUrl,
                              title: w.exercises?.[fi]?.title || '',
                              label: `${w.planName} · W${w.week} · ${w.dayName} — ${w.exercises?.[fi]?.title || 'Exercise ' + (fi+1)} · ${new Date(w.date).toLocaleDateString()}`,
                            } : null))
                            .filter(v => v && v.cloudUrl !== formVideo.cloudUrl);
                          if (candidates.length === 0) return null;
                          const leftLabel = `${wo.planName} · W${wo.week} · ${wo.dayName} — ${ex.title || exName} · ${new Date(wo.date).toLocaleDateString()}`;
                          return (
                            <button onClick={() => setComparePicker({ left: { url: formVideo.cloudUrl, label: leftLabel, title: ex.title || exName }, candidates })}
                              style={{background:'transparent',border:`1px solid ${C.gn}60`,color:C.gn,fontFamily:FN,fontSize:9,padding:'3px 8px',borderRadius:4,cursor:'pointer',letterSpacing:0.5}}>
                              ⇄ COMPARE
                            </button>
                          );
                        })()}
                      </div>
                      {formVideo.cloudUrl ? (
                        <FormVideoPlayer url={formVideo.cloudUrl} exerciseTitle={ex.title || exName} />
                      ) : formVideo.fileName ? (
                        <div style={{fontSize:11,color:C.tm,marginBottom:4}}>File: {formVideo.fileName} (upload pending)</div>
                      ) : null}
                      {formVideo.note && <div style={{fontSize:12,color:C.tx,marginTop:6}}>Client note: {formVideo.note}</div>}
                    </div>
                  ) : (
                    <div style={{background:C.sf2,borderRadius:8,padding:10,marginBottom:10,textAlign:"center"}}>
                      <div style={{fontSize:11,color:C.td}}>No form video submitted</div>
                    </div>
                  )}

                  {/* Weekly Focus editor for NEXT week */}
                  <div style={{background:C.acD,borderRadius:8,padding:12,border:`1px solid ${C.ac}20`}}>
                    <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:6}}>
                      WEEKLY FOCUS — W{nextWeek} (next)
                    </div>
                    <textarea
                      value={nextFocus}
                      onChange={e => setFocus(wo.planName, wo.dayName, ex.eid, nextWeek, e.target.value)}
                      placeholder={`Based on this performance, what should they focus on next week?`}
                      style={{...bi,minHeight:50,resize:"vertical",borderColor:nextFocus?C.ac+'40':C.bd,fontSize:12}}
                    />
                    {/* All 4 weeks mini-view */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginTop:6}}>
                      {[1,2,3,4].map(w => {
                        const f = getFocus(wo.planName, wo.dayName, ex.eid, w);
                        const isCurrent = w === (wo.week||1);
                        const isNext = w === nextWeek;
                        return (
                          <div key={w} style={{padding:"3px 4px",borderRadius:3,
                            background:isNext?C.ac+'15':isCurrent?C.gn+'10':C.sf2,
                            border:`1px solid ${isNext?C.ac+'40':isCurrent?C.gn+'20':f?C.ac+'15':C.bd}`,
                            textAlign:"center"}}>
                            <div style={{fontSize:7,fontFamily:FN,color:isNext?C.ac:isCurrent?C.gn:C.td}}>
                              W{w}{isCurrent?' ✓':''}{isNext?' →':''}
                            </div>
                            <div style={{fontSize:9,color:f?C.tx:C.td,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {f||'—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Done — mark reviewed (or unmark) and return to list */}
        <div style={{display:"flex",gap:8,marginTop:20,marginBottom:8}}>
          {wo.reviewedAt ? (
            <>
              <button onClick={() => { markReviewed && markReviewed(wo.id, false); }}
                style={{padding:"12px 16px",borderRadius:8,border:`1px solid ${C.bd}`,
                  background:"transparent",color:C.tm,fontFamily:FN,fontSize:12,fontWeight:600,
                  cursor:"pointer"}}>
                UNMARK
              </button>
              <button onClick={() => { setSelectedWo(null); setExpandedEx(null); window.scrollTo(0,0); }}
                style={{flex:1,padding:"12px 0",borderRadius:8,border:`1px solid ${C.gn}`,
                  background:C.gn,color:"#0a0a0b",fontFamily:FN,fontSize:13,fontWeight:700,
                  letterSpacing:0.5,cursor:"pointer"}}>
                ✓ REVIEWED — BACK TO LIST
              </button>
            </>
          ) : (
            <button onClick={() => {
                markReviewed && markReviewed(wo.id, true);
                setSelectedWo(null); setExpandedEx(null); window.scrollTo(0,0);
              }}
              style={{flex:1,padding:"12px 0",borderRadius:8,border:`1px solid ${C.ac}`,
                background:C.ac,color:"#0a0a0b",fontFamily:FN,fontSize:13,fontWeight:700,
                letterSpacing:0.5,cursor:"pointer"}}>
              ✓ DONE — MARK REVIEWED
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===== WORKOUT LIST VIEW =====
  const allWorkouts = clientWorkouts.slice().reverse();

  if (allWorkouts.length === 0) return (
    <div>
      {subNav}
      <h2 style={{fontFamily:FN,fontSize:18,marginBottom:8}}>Workout Review</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:20}}>
        Review completed workouts, watch client form videos, and set weekly focus for next week.
      </div>
      <div style={{textAlign:"center",padding:60,color:C.td}}>
        <img src={EXPO_ICON} alt="" style={{height:32,opacity:0.2,marginBottom:12}} />
        <div style={{fontSize:14}}>No completed workouts yet</div>
        <div style={{fontSize:12,marginTop:4}}>Workouts logged in the Client Portal will appear here</div>
      </div>
    </div>
  );

  return (
    <div>
      {subNav}
      <h2 style={{fontFamily:FN,fontSize:18,marginBottom:4}}>Workout Review</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:16}}>
        Review completed workouts, watch client form videos, and write focus notes for next week.
      </div>

      {/* Group by client */}
      {Object.entries(byClient).map(([cid, data]) => (
        <div key={cid} style={{marginBottom:20}}>
          <div style={{fontSize:12,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:8}}>
            {data.name.toUpperCase()} ({data.workouts.length})
          </div>
          {data.workouts.slice()
            // Unreviewed first (by most-recent date), then reviewed (by most-recent date)
            .sort((a, b) => {
              const ar = a.reviewedAt ? 1 : 0;
              const br = b.reviewedAt ? 1 : 0;
              if (ar !== br) return ar - br;
              return new Date(b.date) - new Date(a.date);
            })
            .map(wo => {
            const doneSets = wo.exercises.reduce((a,ex) => a + ex.sets.filter(s=>s.done).length, 0);
            const totalSets = wo.exercises.reduce((a,ex) => a + ex.sets.length, 0);
            const hasFormVids = wo.formVideos?.some(f => f?.has);
            const reviewed = !!wo.reviewedAt;
            return (
              <div key={wo.id} onClick={() => setSelectedWo(wo.id)}
                style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:"12px 16px",
                  marginBottom:6,cursor:"pointer",transition:"border-color .15s",display:"flex",
                  justifyContent:"space-between",alignItems:"center",opacity:reviewed?0.55:1}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {wo.dayName}
                    <span style={{fontWeight:400,color:C.tm,fontSize:12}}>{wo.planName}</span>
                    {reviewed && (
                      <span style={{fontSize:8,fontFamily:FN,color:C.gn,fontWeight:700,letterSpacing:0.5,
                        padding:"1px 5px",borderRadius:3,border:`1px solid ${C.gn}40`,background:C.gnD}}>
                        ✓ REVIEWED
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>
                    W{wo.week} · {new Date(wo.date).toLocaleDateString()} · {doneSets}/{totalSets} sets
                    {hasFormVids && <span style={{color:C.gn,marginLeft:4}}>📹</span>}
                  </div>
                </div>
                <span style={{color:reviewed?C.td:C.ac,fontSize:12,marginLeft:8}}>{reviewed?'View →':'Review →'}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
