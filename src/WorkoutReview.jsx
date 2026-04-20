import React, { useState, useRef, useEffect } from 'react';
import WorkoutsView from './WorkoutsView';
import { C, FN, FB, ytId, EXPO_ICON } from './theme';
import { EX } from './exerciseData';

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

const ANGLE_DEFS = [
  { name: 'L SHO', a:23, b:11, c:13 },
  { name: 'R SHO', a:24, b:12, c:14 },
  { name: 'L ELB', a:11, b:13, c:15 },
  { name: 'R ELB', a:12, b:14, c:16 },
  { name: 'L HIP', a:11, b:23, c:25 },
  { name: 'R HIP', a:12, b:24, c:26 },
  { name: 'L KNE', a:23, b:25, c:27 },
  { name: 'R KNE', a:24, b:26, c:28 },
];

const angleAt = (lms, ai, bi, ci) => {
  const a = lms[ai], b = lms[bi], c = lms[ci];
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return null;
  const cos = (v1x*v2x + v1y*v2y) / (m1*m2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
};

// Form-video player: speed control (0.125x recovers old fast-motion webm),
// fullscreen, and an optional MediaPipe Pose overlay with live joint angles.
function FormVideoPlayer({ url }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const [speed, setSpeed] = useState(1);
  const [poseOn, setPoseOn] = useState(false);
  const [poseLoading, setPoseLoading] = useState(false);
  const [poseError, setPoseError] = useState('');
  const [angles, setAngles] = useState({});

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);

  const fullscreen = () => {
    const v = videoRef.current; if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  };

  const togglePose = async () => {
    if (poseOn) { setPoseOn(false); return; }
    if (!landmarkerRef.current) {
      setPoseLoading(true);
      setPoseError('');
      try {
        const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
        );
        // Try GPU first; fall back to CPU if the device rejects it.
        try {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        } catch {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }
      } catch (e) {
        console.error('Pose load failed:', e);
        setPoseError('Model load failed');
        setPoseLoading(false);
        return;
      }
      setPoseLoading(false);
    }
    setPoseOn(true);
  };

  useEffect(() => {
    if (!poseOn) {
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
      if (active) setAngles(pendingAngles);
    }, 200);

    const detect = (now, metadata) => {
      if (!active) return;
      const w = v.clientWidth, h = v.clientHeight;
      if (w > 0 && h > 0 && v.readyState >= 2) {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        // Use the video's media timestamp when available (rVFC metadata) so
        // detectForVideo gets a stable time per video frame.
        const ts = metadata?.mediaTime != null ? metadata.mediaTime * 1000 : (now ?? performance.now());
        if (ts !== lastTs) {
          lastTs = ts;
          try {
            const result = lm.detectForVideo(v, ts);
            ctx.clearRect(0, 0, w, h);
            const lms = result.landmarks?.[0];
            if (lms) {
              ctx.strokeStyle = '#3BA0FF';
              ctx.lineWidth = 2;
              for (const [i, j] of POSE_CONNECTIONS) {
                const a = lms[i], b = lms[j];
                if (!a || !b) continue;
                ctx.beginPath();
                ctx.moveTo(a.x*w, a.y*h);
                ctx.lineTo(b.x*w, b.y*h);
                ctx.stroke();
              }
              ctx.fillStyle = '#fff';
              for (const p of lms) {
                ctx.beginPath();
                ctx.arc(p.x*w, p.y*h, 3, 0, 2*Math.PI);
                ctx.fill();
              }
              const next = {};
              for (const d of ANGLE_DEFS) {
                const val = angleAt(lms, d.a, d.b, d.c);
                if (val != null) next[d.name] = Math.round(val);
              }
              pendingAngles = next;
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
    detect(performance.now(), null);

    // Re-detect on scrub / load so a paused video updates its overlay.
    const detectOnce = () => detect(performance.now(), null);
    v.addEventListener('seeked', detectOnce);
    v.addEventListener('loadeddata', detectOnce);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (hudInterval) clearInterval(hudInterval);
      v.removeEventListener('seeked', detectOnce);
      v.removeEventListener('loadeddata', detectOnce);
    };
  }, [poseOn]);

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
        {poseOn && Object.keys(angles).length > 0 && (
          <div style={{position:'absolute',top:6,right:6,background:'rgba(10,10,11,0.78)',
            borderRadius:6,padding:'6px 8px',pointerEvents:'none',fontFamily:FN,fontSize:10,
            color:'#fff',lineHeight:1.5,minWidth:96}}>
            {ANGLE_DEFS.map(d => (
              <div key={d.name} style={{display:'flex',justifyContent:'space-between',gap:8}}>
                <span style={{color:C.td}}>{d.name}</span>
                <span>{angles[d.name] != null ? angles[d.name] + '°' : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:9,fontFamily:FN,color:C.td,marginRight:4,letterSpacing:0.5}}>SPEED</span>
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
        {poseError && <span style={{fontSize:9,color:C.rd,marginLeft:4}}>{poseError}</span>}
        <button onClick={fullscreen}
          style={{marginLeft:'auto',padding:'3px 10px',borderRadius:4,border:`1px solid ${C.bd}`,
            background:'transparent',color:C.tm,fontFamily:FN,fontSize:10,cursor:'pointer'}}>⛶ FULL</button>
      </div>
    </div>
  );
}

export default function WorkoutReview({ clientWorkouts, weeklyFocus, setWeeklyFocus, workouts, setWorkouts, planIndex, trainees, exercises, onDecrementSession, markReviewed }) {
  const [subTab, setSubTab] = useState("review");
  const [selectedWo, setSelectedWo] = useState(null);
  const [expandedEx, setExpandedEx] = useState(null);

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
                      <div style={{fontSize:10,fontFamily:FN,color:C.gn,fontWeight:700,marginBottom:6}}>📹 FORM VIDEO SUBMITTED</div>
                      {formVideo.cloudUrl ? (
                        <FormVideoPlayer url={formVideo.cloudUrl} />
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
