import React, { useState, useRef, useEffect } from 'react';
import { C, FN, FB, uid, ytId, EXPO_LOGO, EXPO_ICON, EXPO_LOGO_NAV } from './theme';
import { EX } from './exerciseData';
import { supabase } from './supabase';
import { PasswordChangeModal } from './auth';
import { traineeIdsFor, memberIndexFromId } from './traineeUtils';
import { countRepsForVideo } from './repCounter';

// EX dict now imported from exerciseData.js (single source of truth)
// Previously inline — see exerciseData.js for all client exercises

// Build reverse lookup: exercise title → EX key
const EX_BY_TITLE = {};
Object.entries(EX).forEach(([k,v]) => { if(v.t) EX_BY_TITLE[v.t.toLowerCase()] = k; });

// Convert trainer-side plan to portal compressed format.
// Accepts two day shapes:
//   a) Trainer UI shape: d.exercises = [{ exerciseId, title, sets, reps, tempo, superset, notes }]
//   b) Drive-import / compressed shape: d.ex = [{ eid, s, r, tempo, superset, n }]
// Drive-imported plans store only `eid`; the title/video/cues live in the trainer exercise library,
// so we must look them up there. This path covers the majority of plans in Supabase.
function trainerPlanToPortal(plan, trainerExercises) {
  return {
    name: plan.name,
    phase: plan.phase || '',
    weeks: plan.weeks || 4,
    rest: (plan.notes || '').replace(/imported from sheets/gi, '').trim(),
    warmup: Array.isArray(plan.warmup) ? plan.warmup : [],
    days: (plan.days || []).map(d => {
      const rawList = Array.isArray(d.exercises) ? d.exercises : (Array.isArray(d.ex) ? d.ex : []);
      return {
        name: d.name,
        ex: rawList.map((pe, peIdx) => {
          // Normalize: compressed shape uses eid/s/r, trainer shape uses exerciseId/sets/reps.
          const libId = pe.exerciseId || pe.eid || null;
          let exData = libId ? trainerExercises.find(e => e.id === libId) : null;
          if (!exData && pe.title) {
            const needle = pe.title.toLowerCase().trim();
            exData = trainerExercises.find(e => (e.title || '').toLowerCase().trim() === needle) || null;
          }
          const title = (pe.title || exData?.title || 'Exercise ' + (peIdx + 1)).trim();
          let eid = EX_BY_TITLE[title.toLowerCase()];
          if (!eid) {
            const stableKey = pe.id || libId || title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            eid = 'dyn_' + stableKey;
            if (!EX[eid]) {
              EX[eid] = {
                t: title,
                vid: exData?.videoLink || '',
                q: exData?.cues || '',
              };
            }
          }
          const sets = pe.sets ?? pe.s ?? 3;
          const reps = pe.reps ?? pe.r ?? '8-12';
          const notes = pe.notes ?? pe.n;
          const out = { eid, s: sets, r: reps };
          if (pe.tempo) out.tempo = pe.tempo;
          if (pe.superset) out.superset = pe.superset;
          if (notes) out.n = notes;
          if (Array.isArray(pe.wk) && pe.wk.length) out.wk = pe.wk;
          if (Array.isArray(pe.wkS) && pe.wkS.length) out.wkS = pe.wkS;
          return out;
        })
      };
    })
  };
}


const bi = {background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 10px",color:C.tx,fontFamily:FB,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"};
const Bg = ({children,color=C.ac,style:s}) => <span style={{display:"inline-block",padding:"3px 10px",borderRadius:5,fontSize:11,fontWeight:600,fontFamily:FN,background:`${color}18`,color,...s}}>{children}</span>;

// StepLogger: warmup steps → pre-workout → exercise steps → finish
function StepLogger({day, plan, weekNum, clientId, onBack, onComplete, weeklyFocus}) {
  // Steps: 'wu0','wu1',... → 'pre' → 0,1,2,... (group indices) → 'end'
  const warmup = plan.warmup || [];
  const wuCount = warmup.length;
  const exCount = day.ex.length;

  // Group consecutive exercises sharing the same superset letter.
  // groups[i] = { exIdxs: [0,1,...], superset: 'A' | '' }
  const groups = (() => {
    const out = [];
    let cur = null;
    day.ex.forEach((ex, i) => {
      const ss = ex.superset || '';
      if (ss && cur && cur.superset === ss) { cur.exIdxs.push(i); }
      else { cur = { superset: ss, exIdxs: [i] }; out.push(cur); }
    });
    return out;
  })();
  const groupCount = groups.length;

  const [step, setStep] = useState(wuCount > 0 ? 'wu0' : 'pre');
  const [ar, setAr] = useState({pain:'',energy:'',sleep:''});
  const [notes, setNotes] = useState('');
  // Per-week sets (ex.wkS) takes precedence over the scalar ex.s for allocating log rows.
  // weekNum is 0-indexed; fall back to the flat sets count (or 3) if the week is missing.
  const setCountFor = (ex) => {
    const perWeek = Array.isArray(ex.wkS) ? parseInt(ex.wkS[weekNum], 10) : NaN;
    if (Number.isFinite(perWeek) && perWeek > 0) return perWeek;
    return typeof ex.s === 'number' ? ex.s : 3;
  };
  const [allSets, setAllSets] = useState(() => day.ex.map(ex => Array.from({length:setCountFor(ex)}, () => ({reps:'',load:'',rpe:'',done:false}))));
  const [fv, setFv] = useState(() => day.ex.map(() => ({note:'',has:false})));
  const [wuDone, setWuDone] = useState(() => warmup.map(() => false));
  const uSet = (ei,si,f,v) => {const n=[...allSets];n[ei]=[...n[ei]];n[ei][si]={...n[ei][si],[f]:v};setAllSets(n)};

  // Smart video handling: Safari/iOS skips compression (iOS pre-compresses),
  // Chrome/Android uses Canvas+MediaRecorder at accelerated playback.
  // Files under 25MB skip compression on all browsers.
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  // Tracks whether this StepLogger is still mounted. Compression kicks off an
  // rAF draw loop and a MediaRecorder that would otherwise keep running if the
  // user navigates away mid-upload (memory leak + orphan MediaRecorder).
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const compressVideoChrome = (file, onProgress) => new Promise((resolve, reject) => {
    const MAX_SEC = 59;
    const TARGET_H = 720;
    const BITRATE = 2_500_000;

    const src = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.src = src;

    vid.onloadedmetadata = () => {
      const duration = Math.min(vid.duration, MAX_SEC);
      const scale = vid.videoHeight > TARGET_H ? TARGET_H / vid.videoHeight : 1;
      const w = Math.round(vid.videoWidth * scale / 2) * 2;
      const h = Math.round(vid.videoHeight * scale / 2) * 2;

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');

      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp8')
        ? 'video/webm; codecs=vp8' : 'video/webm';
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        URL.revokeObjectURL(src);
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve({ blob, ext: '.webm', originalSize: file.size, compressedSize: blob.size });
      };

      vid.currentTime = 0;
      // playbackRate = 1 is critical: canvas.captureStream samples at wall-clock,
      // so any speedup bakes fast-motion into the output (8x was the old bug).
      vid.playbackRate = 1;

      vid.play().then(() => {
        recorder.start(100);
        const draw = () => {
          // Abort if the host component unmounted mid-compression — otherwise
          // the rAF loop + MediaRecorder + video element keep running in memory.
          if (!aliveRef.current) {
            if (recorder.state === 'recording') recorder.stop();
            vid.pause();
            URL.revokeObjectURL(src);
            reject(new Error('aborted'));
            return;
          }
          if (vid.ended || vid.paused || vid.currentTime >= duration) {
            if (recorder.state === 'recording') recorder.stop();
            vid.pause(); return;
          }
          ctx.drawImage(vid, 0, 0, w, h);
          if (onProgress) onProgress(Math.round((vid.currentTime / duration) * 100));
          requestAnimationFrame(draw);
        };
        draw();
        const wallTime = (duration / vid.playbackRate) + 3;
        setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); vid.pause(); } }, wallTime * 1000);
      }).catch(reject);
    };
    vid.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Failed to load video')); };
  });

  // Upload with real progress tracking via XMLHttpRequest
  // Supabase Storage REST API: POST raw body with Content-Type header
  const uploadWithProgress = (blob, path, contentType, onProgress) => new Promise((resolve, reject) => {
    const supaUrl = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
    const supaKey = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
    const url = `${supaUrl}/storage/v1/object/form-videos/${path}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${supaKey}`);
    xhr.setRequestHeader('apikey', supaKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${supaUrl}/storage/v1/object/public/form-videos/${path}`;
        resolve({ publicUrl });
      } else {
        console.error('Upload response:', xhr.status, xhr.responseText);
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(blob); // Send raw blob, NOT FormData
  });

  const handleVideoUpload = async (e, exIdx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Warn if file is very large on Safari (no compression available)
    if (isSafari && file.size > 50 * 1024 * 1024) {
      const sizeMB = Math.round(file.size / 1e6);
      if (!confirm(`This video is ${sizeMB}MB. Large videos may take a while to upload. For faster uploads, try recording a shorter clip (under 30 seconds) or select from your photo library instead of recording new.\n\nContinue upload?`)) return;
    }

    const previewUrl = URL.createObjectURL(file);
    // Upload token: identifies this specific upload so stale background-count
    // results from a replaced or removed video can't clobber the fresh state.
    const uploadToken = Date.now() + Math.random();
    setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], has:true, videoUrl:previewUrl, fileName:file.name, uploading:true, uploaded:false, compressProgress:0, uploadProgress:0, counting:true, repCount:null, repKind:null, uploadToken}; return n; });

    // Auto-count reps in parallel with compression + upload. Uses the local
    // File (pre-compression, higher quality) so pose detection has the best
    // available input. The result only lands on fv[exIdx] if the token still
    // matches — a replacement upload or video removal will have cycled the
    // token and the stale result is discarded.
    (async () => {
      try {
        const exTitle = EX[day.ex[exIdx]?.eid]?.t || '';
        const result = await countRepsForVideo(file, exTitle);
        setFv(prev => { const n=[...prev]; if(!n[exIdx] || n[exIdx].uploadToken !== uploadToken) return prev; n[exIdx]={...n[exIdx], counting:false, repCount:result.count, repKind:result.kind, countError:null, countFrames:result.frames, countFramesWithPose:result.framesWithPose, countDuration:result.duration, countCurrentTime:result.currentTime}; return n; });
      } catch (err) {
        console.warn('auto-count failed:', err);
        setFv(prev => { const n=[...prev]; if(!n[exIdx] || n[exIdx].uploadToken !== uploadToken) return prev; n[exIdx]={...n[exIdx], counting:false, repCount:null, countError: err?.message || 'Auto-count failed'}; return n; });
      }
    })();

    try {
      let uploadBlob = file;
      let ext = file.name.match(/\.[^.]+$/)?.[0] || '.mp4';
      let contentType = file.type || 'video/mp4';

      // Decide: compress or upload directly
      // Safari/iOS: NEVER compress (captureStream is broken on WebKit)
      // Chrome/Android: compress if file > 15MB
      const shouldCompress = !isSafari && file.size > 15 * 1024 * 1024;

      if (shouldCompress) {
        setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], phase:'compress'}; return n; });
        const result = await compressVideoChrome(file, pct => {
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], compressProgress:pct}; return n; });
        });
        uploadBlob = result.blob;
        ext = result.ext;
        contentType = result.blob.type;
        console.log(`Compressed: ${(file.size/1e6).toFixed(1)}MB → ${(result.compressedSize/1e6).toFixed(1)}MB`);
      }

      // Upload with progress (XHR for real-time %, falls back to Supabase client)
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], phase:'upload', compressProgress:100}; return n; });
      const ts = Date.now();
      const path = `${clientId}/${ts}-form${ext}`;

      let publicUrl;
      try {
        const result = await uploadWithProgress(uploadBlob, path, contentType, pct => {
          setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploadProgress:pct}; return n; });
        });
        publicUrl = result.publicUrl;
      } catch (xhrErr) {
        // Fallback: use Supabase JS client (no progress but reliable)
        console.warn('XHR upload failed, falling back to Supabase client:', xhrErr);
        const { error } = await supabase.storage.from('form-videos').upload(path, uploadBlob, { upsert: true, contentType });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('form-videos').getPublicUrl(path);
        publicUrl = urlData.publicUrl;
      }

      URL.revokeObjectURL(previewUrl);
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:true, has:true, cloudUrl:publicUrl, compressProgress:100, uploadProgress:100, uploadError:null}; return n; });
    } catch(err) {
      console.error('Video upload error:', err);
      URL.revokeObjectURL(previewUrl);
      const msg = err?.message || 'Upload failed';
      setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:false, has:false, videoUrl:null, uploadError:msg}; return n; });
      alert(`Video upload failed: ${msg}\n\nPlease try again or pick a shorter clip.`);
    }
  };

  const finish = () => onComplete({id:uid(),clientId,planName:plan.name,dayName:day.name,week:weekNum+1,date:new Date().toISOString(),autoregulation:ar,notes,
    formVideos:fv.map(f=>({has:f.has,note:f.note,fileName:f.fileName||null,cloudUrl:f.cloudUrl||null,repCount:f.repCount??null,repKind:f.repKind||null})),
    exercises:day.ex.map((ex,i)=>({eid:ex.eid,title:EX[ex.eid]?.t||'?',prescribed:(ex.wk&&ex.wk[weekNum])||`${(ex.wkS&&ex.wkS[weekNum])||ex.s}x${(ex.wk&&ex.wk[weekNum])||ex.r}`,sets:allSets[i]}))});

  // Navigation helpers
  const totalSteps = wuCount + 1 + groupCount; // warmups + pre + groups
  const stepIndex = typeof step === 'string' && step.startsWith('wu') ? parseInt(step.slice(2)) :
    step === 'pre' ? wuCount : step === 'end' ? totalSteps : wuCount + 1 + step;
  const goNext = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      const nd = [...wuDone]; nd[wi] = true; setWuDone(nd);
      if (wi + 1 < wuCount) setStep('wu' + (wi + 1));
      else setStep('pre');
    } else if (step === 'pre') setStep(0);
    else if (typeof step === 'number' && step < groupCount - 1) setStep(step + 1);
    else setStep('end');
  };
  const goPrev = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      if (wi > 0) setStep('wu' + (wi - 1)); else onBack();
    } else if (step === 'pre') setStep(wuCount > 0 ? 'wu' + (wuCount - 1) : null);
    else if (step === 0) setStep('pre');
    else if (typeof step === 'number') setStep(step - 1);
    else if (step === 'end') setStep(groupCount - 1);
  };

  // Progress bar with EXPO icon
  const bar = <div style={{padding:'10px 16px',background:C.sf,borderBottom:`1px solid ${C.bd}`,position:'sticky',top:0,zIndex:10}}>
    <div style={{display:'flex',alignItems:'center',marginBottom:6,position:'relative',height:32}}>
      <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:24,display:'block',flexShrink:0}} />
      <span style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontFamily:FN,fontSize:11,color:C.tm,whiteSpace:'nowrap',lineHeight:1}}>{day.name} · W{weekNum+1}</span>
      <button onClick={onBack} style={{marginLeft:'auto',background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0,lineHeight:1}}>← Exit</button></div>
    <div style={{display:'flex',gap:2}}>
      {/* Warm-up dots (orange) + Exercise dots (blue/green) */}
      {warmup.map((_,i) => <div key={'wu'+i} style={{flex:1,height:3,borderRadius:2,background:stepIndex>i?C.or:stepIndex===i?C.or+'80':C.bd}} />)}
      {/* Pre-workout dot */}
      <div style={{flex:1,height:3,borderRadius:2,background:stepIndex>wuCount?C.pu:stepIndex===wuCount?C.pu+'80':C.bd}} />
      {/* Group dots (one per superset group or solo exercise) */}
      {groups.map((_,i) => <div key={'g'+i} style={{flex:1,height:3,borderRadius:2,background:stepIndex>wuCount+1+i?C.gn:stepIndex===wuCount+1+i?C.ac:C.bd}} />)}
    </div>
    <div style={{fontSize:10,color:C.td,fontFamily:FN,marginTop:4,textAlign:'center'}}>
      {typeof step==='string'&&step.startsWith('wu') ? `Warm-Up ${parseInt(step.slice(2))+1}/${wuCount}` :
       step==='pre' ? 'Pre-Workout Check' :
       step==='end' ? 'Complete' :
       groups[step]?.superset ? `Superset ${groups[step].superset} · Group ${step+1}/${groupCount}` :
       `Exercise ${step+1}/${groupCount}`}
    </div></div>;

  // ===== WARM-UP STEP =====
  if (typeof step === 'string' && step.startsWith('wu')) {
    const wi = parseInt(step.slice(2));
    const wu = warmup[wi];
    const vid = ytId(wu.vid);
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
      <div style={{padding:20}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <div style={{background:C.orD,borderRadius:8,padding:'4px 10px',fontFamily:FN,fontSize:11,color:C.or,fontWeight:700}}>WARM-UP {wi+1}/{wuCount}</div></div>
        <h2 style={{margin:'0 0 6px',fontFamily:FN,fontSize:18}}>{wu.t}</h2>
        <div style={{fontSize:15,color:C.or,fontWeight:700,fontFamily:FN,marginBottom:14}}>{wu.rx}</div>
        {vid && <div style={{marginBottom:14,borderRadius:12,overflow:'hidden',aspectRatio:'16/9',background:C.sf2}}>
          <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>}
        {!vid && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:30,marginBottom:14,textAlign:'center',color:C.td}}>No video for this exercise</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:10,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:14,fontWeight:600,cursor:'pointer'}}>← Back</button>
          <button onClick={goNext} style={{flex:2,padding:14,borderRadius:10,border:'none',background:C.or,color:'#fff',fontFamily:FB,fontSize:14,fontWeight:700,cursor:'pointer'}}>
            {wi === wuCount - 1 ? 'Start Check-In →' : 'Next Warm-Up →'}</button></div>
      </div></div>;
  }

  // ===== PRE-WORKOUT CHECK =====
  if (step === 'pre') return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20}}>
      <h2 style={{margin:'0 0 16px',fontFamily:FN,fontSize:20}}>Pre-Workout Check</h2>
      {[['pain','Pain Level','0-10',C.rd],['energy','Energy','1-5',C.gn],['sleep','Sleep Quality','1-5',C.pu]].map(([k,l,rng,col]) =>
        <div key={k} style={{marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>{l} ({rng})</div>
          <div style={{display:'flex',gap:4}}>{(rng==='0-10'?[0,1,2,3,4,5,6,7,8,9,10]:[1,2,3,4,5]).map(n =>
            <div key={n} onClick={() => setAr({...ar,[k]:String(n)})} style={{flex:1,height:40,borderRadius:8,background:ar[k]===String(n)?`${col}25`:C.sf2,border:`2px solid ${ar[k]===String(n)?col:C.bd}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FN,fontSize:14,color:ar[k]===String(n)?col:C.tm,cursor:'pointer',fontWeight:ar[k]===String(n)?700:400}}>{n}</div>
          )}</div></div>)}
      {parseInt(ar.pain)>=4 && <div style={{background:C.rdD,borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:C.rd,fontWeight:600}}>⚠ Pain ≥4 — Modify: ROM → Tempo → Intensity → Volume</div>}
      {(parseInt(ar.energy)<=2||parseInt(ar.sleep)<=2) && <div style={{background:C.orD,borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:C.or,fontWeight:600}}>⚠ Low recovery — Auto-regulate down</div>}
      <div style={{display:'flex',gap:8}}>
        <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:10,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:14,fontWeight:600,cursor:'pointer'}}>← Back</button>
        <button onClick={goNext} style={{flex:2,padding:14,borderRadius:10,border:'none',background:C.ac,color:'#fff',fontFamily:FB,fontSize:15,fontWeight:700,cursor:'pointer'}}>Start Workout →</button></div>
    </div></div>;

  // ===== FINISH =====
  if (step === 'end') return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20,textAlign:'center'}}>
      <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:24,marginBottom:16}} />
      <h2 style={{margin:'0 0 8px',fontFamily:FN,fontSize:22}}>Nice Work! 🎉</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:20}}>Session complete. Any notes?</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel? Pain? Modifications?" style={{...bi,minHeight:120,resize:'vertical',marginBottom:16,textAlign:'left'}}/>
      {fv.some(f => f.uploading) ? (
        <button style={{width:'100%',padding:16,borderRadius:12,border:'none',background:C.sf3,color:C.td,fontFamily:FB,fontSize:16,fontWeight:700,cursor:'wait',opacity:0.6}}>⏳ Video uploading...</button>
      ) : (
        <button onClick={finish} style={{width:'100%',padding:16,borderRadius:12,border:'none',background:C.gn,color:'#fff',fontFamily:FB,fontSize:16,fontWeight:700,cursor:'pointer'}}>✓ Complete Workout</button>
      )}
      <button onClick={goPrev} style={{width:'100%',padding:12,border:'none',background:'transparent',color:C.tm,cursor:'pointer',marginTop:8}}>← Back</button>
    </div></div>;

  // ===== EXERCISE STEP (single exercise OR grouped superset) =====
  const group = groups[step]; if (!group) return null;
  const isSuperset = group.exIdxs.length > 1 && !!group.superset;
  const groupExs = group.exIdxs.map(idx => ({ idx, ex: day.ex[idx], d: EX[day.ex[idx].eid] })).filter(g => g.d);
  if (groupExs.length === 0) return null;

  // Any exercise in the group still uploading?
  const anyUploading = group.exIdxs.some(i => fv[i]?.uploading);

  // Render one complete exercise block: title → prescription → tempo → wave → notes → video → weekly focus → set log → form check
  const renderExerciseBlock = (g, blockIdx) => {
    const { idx: ei, ex, d } = g;
    const vid = ytId(d.vid);
    const hw = ex.wk?.length > 0;
    const wr = hw ? (ex.wk[weekNum] ?? ex.r) : null;
    const f = fv[ei];
    const fk = `${plan.name}|${day.name}|${ex.eid}|W${weekNum+1}`;
    const wf = weeklyFocus?.[fk];

    return <div key={ei} style={{marginBottom: blockIdx < groupExs.length - 1 ? 24 : 0, paddingBottom: blockIdx < groupExs.length - 1 ? 20 : 0, borderBottom: blockIdx < groupExs.length - 1 ? `2px dashed ${C.bd2}` : 'none'}}>
      {isSuperset && <div style={{fontSize:10,fontFamily:FN,color:C.ac,fontWeight:700,letterSpacing:'0.08em',textAlign:'center',marginBottom:8}}>EXERCISE {blockIdx+1} OF {groupExs.length}</div>}
      <h2 style={{margin:'0 0 6px',fontFamily:FN,fontSize:18,textAlign:'center'}}>{d.t}</h2>
      <div style={{fontSize:15,color:C.ac,fontWeight:700,fontFamily:FN,textAlign:'center'}}>{wr || `${ex.s} × ${ex.r}`}</div>
      {ex.tempo && <div style={{fontSize:13,color:C.or,marginTop:4,textAlign:'center'}}>⏱ {ex.tempo}</div>}

      {hw && <div style={{background:C.sf2,borderRadius:10,padding:10,marginTop:12,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
          {ex.wk.map((w,i) => <div key={i} style={{background:weekNum===i?C.acD:C.sf3,border:`1px solid ${weekNum===i?C.ac+'60':C.bd}`,borderRadius:6,padding:6,textAlign:'center'}}>
            <div style={{fontSize:9,color:C.td,fontFamily:FN}}>WK {i+1}</div>
            <div style={{fontSize:12,color:weekNum===i?C.ac:C.tx,fontWeight:600}}>{w}</div></div>)}</div></div>}

      {(d.q || ex.n) && <div style={{background:C.puD,borderRadius:10,padding:12,marginTop:12,marginBottom:12,fontSize:13,color:C.tx,lineHeight:1.6}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.pu,marginBottom:6,fontWeight:700,textAlign:'center'}}>EXERCISE NOTES</div>
        {d.q && <div style={{textAlign:/[\u0590-\u05FF]/.test(d.q)?'right':'left',direction:/[\u0590-\u05FF]/.test(d.q)?'rtl':'ltr'}}>{d.q}</div>}
        {d.q && ex.n && <div style={{borderTop:`1px solid ${C.pu}30`,margin:'8px 0'}}/>}
        {ex.n && <div style={{color:C.or,textAlign:/[\u0590-\u05FF]/.test(ex.n)?'right':'left',direction:/[\u0590-\u05FF]/.test(ex.n)?'rtl':'ltr'}}>{ex.n}</div>}</div>}

      {vid && <div style={{marginBottom:14,borderRadius:12,overflow:'hidden',aspectRatio:'16/9',background:C.sf2}}>
        <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>}

      <div style={{background:wf?C.acD:C.sf,border:'1px solid '+(wf?C.ac+'30':C.bd),borderLeft:'3px solid '+(wf?C.ac:C.bd),borderRadius:10,padding:12,marginBottom:12}}>
        <div style={{fontSize:10,fontFamily:FN,color:wf?C.ac:C.td,marginBottom:4,fontWeight:700}}>WEEKLY FOCUS</div>
        <div style={{fontSize:13,color:wf?C.tx:C.td,lineHeight:1.5}}>{wf || 'No focus set this week'}</div></div>

      <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 32px',gap:4,marginBottom:4}}>
          {['','REPS','KG','RPE','✓'].map(h => <div key={h} style={{fontSize:9,fontFamily:FN,color:C.td,textAlign:!h||h==='✓'?'center':'left'}}>{h}</div>)}</div>
        {(allSets[ei]||[]).map((set,si) => <div key={si} style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 32px',gap:4,alignItems:'center',marginBottom:4,opacity:set.done?.5:1}}>
          <div style={{fontFamily:FN,fontSize:13,color:C.td,textAlign:'center'}}>{si+1}</div>
          <input value={set.reps} onChange={e => uSet(ei,si,'reps',e.target.value)} placeholder="—" style={bi}/>
          <input value={set.load} onChange={e => uSet(ei,si,'load',e.target.value)} placeholder="kg" style={bi}/>
          <input value={set.rpe} onChange={e => uSet(ei,si,'rpe',e.target.value)} placeholder="—" style={bi}/>
          <div style={{textAlign:'center'}}><input type="checkbox" checked={set.done} onChange={e => uSet(ei,si,'done',e.target.checked)} style={{width:18,height:18,accentColor:C.gn,cursor:'pointer'}}/></div>
        </div>)}</div>

      <div style={{background:C.sf,border:`1px solid ${f.uploaded?C.gn+'60':C.bd}`,borderRadius:12,padding:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:11,fontFamily:FN,color:C.tm}}>FORM CHECK</div>
          {f.uploaded && <div style={{display:'flex',alignItems:'center',gap:4,background:C.gnD,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:14}}>✅</span><span style={{fontSize:11,fontFamily:FN,color:C.gn,fontWeight:700}}>UPLOADED</span></div>}
          {f.uploading && <div style={{display:'flex',alignItems:'center',gap:4,background:C.acD,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.ac,fontWeight:700}}>{f.phase==='compress' ? `⚙ Compressing ${f.compressProgress||0}%` : `☁ Uploading ${f.uploadProgress||0}%`}</span></div>}
          {f.counting && <div style={{display:'flex',alignItems:'center',gap:4,background:C.sf2,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.tm,fontWeight:700}}>⏱ Counting reps…</span></div>}
          {!f.counting && typeof f.repCount === 'number' && f.repKind && f.repKind !== 'none' && f.repCount > 0 && <div title={`kind=${f.repKind} · frames=${f.countFrames||0} · withPose=${f.countFramesWithPose||0} · duration=${f.countDuration||'?'}s`} style={{display:'flex',alignItems:'center',gap:4,background:C.gnD,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.gn,fontWeight:700}}>🔢 {f.repCount} REPS</span></div>}
          {!f.counting && f.repCount === 0 && f.repKind !== 'none' && <div title={`kind=${f.repKind} · frames=${f.countFrames||0} · withPose=${f.countFramesWithPose||0} · duration=${f.countDuration||'?'}s`} style={{display:'flex',alignItems:'center',gap:4,background:C.sf2,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.tm,fontWeight:700}}>⚠ No reps detected</span></div>}
          {!f.counting && f.countError && <div title={f.countError} style={{display:'flex',alignItems:'center',gap:4,background:C.rdD,padding:'3px 10px',borderRadius:20,maxWidth:'100%'}}>
            <span style={{fontSize:10,fontFamily:FN,color:C.rd,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>⚠ {f.countError}</span></div>}
        </div>
        {f.has && f.videoUrl ? (
          <div style={{marginBottom:10}}>
            <video src={f.videoUrl} controls playsInline style={{width:'100%',borderRadius:8,maxHeight:200,background:C.sf2}} />
            <button onClick={() => setFv(prev => { const n=[...prev]; n[ei]={...n[ei],has:false,videoUrl:null,uploaded:false,cloudUrl:null,counting:false,repCount:null,repKind:null,uploadToken:null}; return n; })}
              style={{width:'100%',marginTop:6,padding:8,borderRadius:6,border:`1px solid ${C.rd}30`,background:C.rdD,color:C.rd,fontFamily:FB,fontSize:12,cursor:'pointer'}}>
              Remove Video</button>
          </div>
        ) : (
          <div style={{display:'flex',gap:8}}>
            <label style={{flex:1,padding:'14px 8px',borderRadius:8,border:`1px dashed ${C.bd}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FB,fontSize:12,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:20}}>🎥</span>
              <span>Record</span>
              <input type="file" accept="video/*" capture="environment" style={{display:'none'}} onChange={async e => { await handleVideoUpload(e, ei); }} />
            </label>
            <label style={{flex:1,padding:'14px 8px',borderRadius:8,border:`1px dashed ${C.bd}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FB,fontSize:12,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:20}}>📁</span>
              <span>Gallery</span>
              <input type="file" accept="video/*" style={{display:'none'}} onChange={async e => { await handleVideoUpload(e, ei); }} />
            </label>
          </div>
        )}
        <textarea value={f.note} onChange={e => {const n=[...fv];n[ei]={...n[ei],note:e.target.value};setFv(n)}} placeholder="Notes for coach" style={{...bi,fontSize:13,minHeight:50,resize:'vertical',marginTop:8}}/>
      </div>
    </div>;
  };

  return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20}}>
      {isSuperset && <div style={{background:C.acD,border:`1px solid ${C.ac}40`,borderRadius:10,padding:'8px 12px',marginBottom:18,textAlign:'center'}}>
        <div style={{fontSize:11,fontFamily:FN,color:C.ac,fontWeight:700,letterSpacing:'0.08em'}}>SUPERSET {group.superset} · {groupExs.length} EXERCISES</div>
        <div style={{fontSize:11,color:C.tm,marginTop:3}}>Alternate between exercises each round</div>
      </div>}

      {groupExs.map(renderExerciseBlock)}

      <div style={{display:'flex',gap:8,marginTop:20}}>
        <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:10,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:14,fontWeight:600,cursor:'pointer'}}>← Back</button>
        <button onClick={anyUploading ? undefined : goNext} style={{flex:2,padding:14,borderRadius:10,border:'none',background:anyUploading?C.sf3:C.ac,color:anyUploading?C.td:'#fff',fontFamily:FB,fontSize:14,fontWeight:700,cursor:anyUploading?'wait':'pointer',opacity:anyUploading?0.6:1}}>
          {anyUploading ? `⚙ Processing video...` : step===groupCount-1 ? 'Finish →' : (isSuperset?'Next Block →':'Next Exercise →')}</button></div>
    </div></div>;
}

// Main client portal
export default function ClientPortal({ clientId, signOut, clientWorkouts, setClientWorkouts, bwLog, setBwLog, weeklyFocus, setWeeklyFocus, portalVis, trainerPlans, trainerExercises, trainees, onDecrementSession }) {
  // clientId comes from the authenticated session (resolved upstream in App.jsx).
  // The old email-lookup login lived inside this component and bypassed auth;
  // it's gone. Trainee is fixed for the session.
  const ci = clientId;
  const logOut = async () => {
    setVw('prog');
    if (signOut) await signOut();
  };
  const [wk, setWk] = useState(0);
  const [lg, setLg] = useState(null);
  const [vw, setVw] = useState('prog');
  const [bw, setBw] = useState('');
  const [clientPlans, setClientPlans] = useState([]); // Plans loaded from plans table for this client
  const [selectedBlockName, setSelectedBlockName] = useState(null); // which block bodyweight logs target when client has multiple visible plans
  const [bwDeleteConfirm, setBwDeleteConfirm] = useState(null); // BW log entry pending delete confirmation (null | entry)
  const [showPwModal, setShowPwModal] = useState(false);
  const [plansLoadError, setPlansLoadError] = useState(null);

  // Resolve client from trainees (Supabase)
  const trainee = (trainees || []).find(t => t.id === ci);

  // Restore last-viewed week when a client logs in so they don't land on W1
  // every session when they're mid-way through a block.
  React.useEffect(() => {
    if (!ci) return;
    try {
      const v = localStorage.getItem('expo-wk-' + ci);
      if (v != null) { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) setWk(n); }
    } catch {}
  }, [ci]);
  React.useEffect(() => {
    if (!ci) return;
    try { localStorage.setItem('expo-wk-' + ci, String(wk)); } catch {}
  }, [ci, wk]);

  // Load this client's plans from plans table when client changes.
  // Mount guard: rapid login/logout could otherwise race a stale fetch
  // into setClientPlans after the component remounted for a different user.
  const [plansReloadKey, setPlansReloadKey] = useState(0);
  React.useEffect(() => {
    if (!ci) { setClientPlans([]); return; }
    let alive = true;
    setPlansLoadError(null);
    (async () => {
      try {
        const { supabase: sb } = await import('./supabase');
        // Couples: a trainee may have plans under parent ID OR sub-member IDs (parent__0, parent__1).
        // Fetch all so the shared portal renders both members' plans.
        const ids = traineeIdsFor(ci);
        const { data, error } = await sb.from('plans').select('*').in('trainee_id', ids);
        if (!alive) return;
        if (error) throw error;
        if (data) {
          setClientPlans(data.map(p => ({
            id: p.id, name: p.name, traineeId: p.trainee_id, phase: p.phase,
            notes: p.notes, active: p.active, createdAt: p.created_at,
            days: p.data?.days || [], warmup: p.data?.warmup || [],
            weeks: p.data?.weeks || 4,
          })));
        }
      } catch (e) {
        if (alive) {
          console.error('ClientPortal plans load:', e);
          setPlansLoadError(e?.message || 'Could not load your programs.');
        }
      }
    })();
    return () => { alive = false; };
  }, [ci, plansReloadKey]);

  // Presence heartbeat — let the coach know this client is online.
  // Gated on document.visibilityState so a backgrounded tab doesn't keep
  // writing to Supabase every 30s for hours. When the tab comes back to
  // foreground we beat immediately so the coach sees them as online.
  React.useEffect(() => {
    if (!ci) return;
    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { supabase: sb } = await import('./supabase');
        const { data: existing } = await sb.from('store').select('value').eq('key', 'expo-presence').maybeSingle();
        const presence = existing?.value || {};
        presence[ci] = Date.now();
        await sb.from('store').upsert({ key: 'expo-presence', value: presence });
      } catch (e) { /* silent */ }
    };
    beat();
    const iv = setInterval(beat, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [ci]);

  const clientName = trainee?.name || '';

  // All plans live in the Supabase `plans` table (populated from Drive).
  // Preserve traineeId so the visibility key can include the couple member suffix.
  const mergedPlans = trainee
    ? clientPlans.map(p => ({ ...trainerPlanToPortal(p, trainerExercises || []), traineeId: p.traineeId }))
    : [];

  // Filter by portal visibility toggles, then sort blocks newest-first by "#N" in the name.
  // Plans without a block number fall to the end preserving their original order.
  const blockNum = n => { const m = /#(\d+)/.exec(n || ''); return m ? parseInt(m[1], 10) : -Infinity; };
  // visKey matches the trainer-side TraineeDetail keying. Couple member plans
  // get a `:m{N}` suffix so toggling one member's plan doesn't ghost into the other's.
  const visKeyFor = (p) => {
    const mi = memberIndexFromId(p.traineeId, ci);
    return mi != null ? `${clientName}:${p.name}:m${mi}` : `${clientName}:${p.name}`;
  };
  const visPlans = mergedPlans.filter(p => {
    if (!portalVis || !clientName) return true;
    return portalVis[visKeyFor(p)] !== false;
  }).slice().sort((a, b) => blockNum(b.name) - blockNum(a.name));

  // Active block for bodyweight logging — scopes uniqueness to (client, block, week)
  // Falls back to the first visible plan when no manual selection (or selection no longer visible).
  const activePlan = visPlans.find(p => p.name === selectedBlockName) || visPlans[0];

  // Clamp persisted wk to the current block's week count. Covers two cases:
  // (a) stored wk=7 carried over from an 8-week block into a new 4-week block,
  // (b) trainer shortened a plan after the client logged in.
  // Gated on activePlan being loaded — otherwise during the Supabase plans fetch
  // activePlan is undefined, the fallback `|| 4` kicks in, and a legit restored
  // wk=7 from an 8-week block gets clamped to 3 and written back to localStorage
  // before the 8-week plan actually arrives, permanently losing the client's week.
  React.useEffect(() => {
    if (!activePlan) return;
    const max = (activePlan.weeks || 4) - 1;
    if (wk > max) setWk(max);
  }, [activePlan?.weeks, wk]);

  const cw = clientWorkouts.filter(w => w.clientId === ci);
  const handleComplete = w => {
    setClientWorkouts(prev => [...prev, w]);
    if (bw && activePlan) setBwLog(prev => {
      const filtered = prev.filter(b => !(b.clientId===ci && b.blockName===activePlan.name && b.week===wk+1));
      return [...filtered, {date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw),blockName:activePlan.name,planId:activePlan.id||null}];
    });
    if(onDecrementSession && ci) onDecrementSession(ci);
    setLg(null);
  };

  // Step Logger — find plan by index across visible plans
  if (lg !== null && trainee) {
    let dayCount = 0; let targetPlan = null; let targetDayIdx = 0;
    for (const p of visPlans) { if (lg < dayCount + p.days.length) { targetPlan = p; targetDayIdx = lg - dayCount; break; } dayCount += p.days.length; }
    if (!targetPlan) { setLg(null); return null; }
    return <StepLogger day={targetPlan.days[targetDayIdx]} plan={targetPlan} weekNum={wk} clientId={ci} onBack={() => setLg(null)} onComplete={handleComplete} weeklyFocus={weeklyFocus}/>; }

  // BW Graph tab
  if (vw === 'bwt' && trainee) {
    const bwData = bwLog.filter(b => b.clientId === ci).sort((a,b) => new Date(a.date) - new Date(b.date));
    const existingBw = bwData.find(b => b.week === wk + 1 && b.blockName === activePlan?.name);
    const bwDisplay = bw || (existingBw ? String(existingBw.bw) : '');
    const maxBw = bwData.length ? Math.max(...bwData.map(b=>b.bw)) : 100;
    const minBw = bwData.length ? Math.min(...bwData.map(b=>b.bw)) : 50;
    const range = Math.max(maxBw - minBw, 2);
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      <div style={{padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <button onClick={logOut} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:12,padding:0}}>← Log Out</button>
          <img src={EXPO_ICON} alt="EXPO" style={{height:18,opacity:0.5}} />
        </div>
        <div style={{display:'flex',gap:4,marginBottom:14}}>{[['prog','Program'],['bwt','BW Graph'],['hist',`History (${cw.length})`]].map(([k,l]) =>
          <button key={k} onClick={() => setVw(k)} style={{flex:1,padding:8,borderRadius:6,border:`1px solid ${vw===k?C.ac:C.bd}`,background:vw===k?C.acD:'transparent',color:vw===k?C.ac:C.tm,fontFamily:FB,fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>)}</div>
        <h2 style={{margin:'0 0 4px',fontFamily:FN,fontSize:18}}>Bodyweight Tracking</h2>
        <div style={{color:C.tm,fontSize:12,marginBottom:16}}>{clientName} · {bwData.length} entries</div>

        {/* Quick log */}
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:16}}>
          {visPlans.length > 1 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {visPlans.map(p => <button key={p.name} onClick={() => setSelectedBlockName(p.name)}
              style={{padding:'4px 10px',borderRadius:14,border:`1px solid ${activePlan?.name===p.name?C.ac:C.bd}`,background:activePlan?.name===p.name?C.acD:'transparent',color:activePlan?.name===p.name?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:600,cursor:'pointer'}}>{p.name}</button>)}
          </div>}
          {visPlans.length > 1 && <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap'}}>
            {Array.from({length: activePlan?.weeks || 4}, (_, w) => <button key={w} onClick={() => setWk(w)} style={{flex:'1 1 40px',padding:'6px 0',borderRadius:6,border:`1px solid ${wk===w?C.ac:C.bd}`,background:wk===w?C.acD:'transparent',color:wk===w?C.ac:C.tm,fontFamily:FN,fontSize:11,fontWeight:600,cursor:'pointer'}}>W{w+1}</button>)}
          </div>}
          <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>LOG W{wk+1} · {activePlan?.name || 'NO ACTIVE BLOCK'}</div>
          <div style={{display:'flex',gap:8}}>
            <input value={bwDisplay} onChange={e => setBw(e.target.value)} placeholder="Weight in kg" type="number" disabled={!activePlan} style={{flex:1,background:C.sf2,border:`1px solid ${existingBw?C.gn+'60':C.bd}`,borderRadius:8,padding:'10px 12px',color:C.tx,fontFamily:FN,fontSize:14,outline:'none',boxSizing:'border-box',opacity:activePlan?1:0.5}}/>
            <button disabled={!activePlan} onClick={()=>{const val=bw||bwDisplay;if(val&&activePlan){setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.blockName===activePlan.name&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(val),blockName:activePlan.name,planId:activePlan.id||null}]});setBw('')}}}
              style={{padding:'10px 20px',borderRadius:8,border:'none',background:(bw&&activePlan)?C.ac:C.sf3,color:(bw&&activePlan)?'#fff':C.td,fontFamily:FB,fontSize:13,fontWeight:700,cursor:(bw&&activePlan)?'pointer':'default'}}>Save</button>
          </div>
          {!activePlan && <div style={{fontSize:10,color:C.td,marginTop:6}}>Assign an active program to log bodyweight.</div>}
        </div>

        {/* Graph */}
        {bwData.length < 2 ? (
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:40,textAlign:'center',color:C.td,marginBottom:16}}>
            <div style={{fontSize:24,marginBottom:8}}>📊</div>
            <div style={{fontSize:13}}>Log at least 2 weigh-ins to see your trend</div>
          </div>
        ) : (
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:10}}>TREND</div>
            <svg viewBox={`0 0 ${Math.max(bwData.length * 60, 300)} 175`} style={{width:'100%',height:175}}>
              {/* Grid lines */}
              {[0,0.25,0.5,0.75,1].map((p,i) => {
                const y = 10 + p * 130;
                const val = (maxBw - p * range).toFixed(1);
                return <g key={i}>
                  <line x1="40" y1={y} x2={Math.max(bwData.length*60,300)-10} y2={y} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4"/>
                  <text x="36" y={y+4} fill={C.td} fontSize="9" fontFamily={FN} textAnchor="end">{val}</text>
                </g>;
              })}
              {/* Line + dots */}
              <polyline fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                points={bwData.map((d,i) => `${50+i*50},${10+((maxBw-d.bw)/range)*130}`).join(' ')}/>
              {bwData.map((d,i) => {
                const x = 50 + i * 50;
                const y = 10 + ((maxBw - d.bw) / range) * 130;
                const prevBlock = i>0 ? bwData[i-1].blockName : null;
                const blockChanged = d.blockName && d.blockName !== prevBlock;
                const mNum = d.blockName?.match(/#(\d+)/);
                const blockAbbrev = mNum ? 'B'+mNum[1] : (d.blockName ? d.blockName.slice(0,4) : '?');
                return <g key={i}>
                  {blockChanged && <line x1={x-25} y1="10" x2={x-25} y2="140" stroke={C.bd2||C.bd} strokeWidth="0.5" strokeDasharray="2"/>}
                  <circle cx={x} cy={y} r="4" fill={C.ac} stroke={C.bg} strokeWidth="2"/>
                  <text x={x} y={y-10} fill={C.tx} fontSize="10" fontFamily={FN} textAnchor="middle" fontWeight="600">{d.bw}</text>
                  <text x={x} y={152} fill={C.td} fontSize="8" fontFamily={FN} textAnchor="middle">{blockAbbrev}·W{d.week||'?'}</text>
                  <text x={x} y={163} fill={C.td} fontSize="7" fontFamily={FN} textAnchor="middle">{new Date(d.date).toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})}</text>
                </g>;
              })}
            </svg>
            {/* Stats */}
            <div style={{display:'flex',gap:12,marginTop:10}}>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>LATEST</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData[bwData.length-1].bw}kg</div>
              </div>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>CHANGE</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:(bwData[bwData.length-1].bw-bwData[0].bw)<=0?C.gn:C.or}}>
                  {(bwData[bwData.length-1].bw-bwData[0].bw)>0?'+':''}{(bwData[bwData.length-1].bw-bwData[0].bw).toFixed(1)}kg</div>
              </div>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>ENTRIES</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Log history */}
        <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>HISTORY</div>
        {bwData.slice().reverse().map((d,i) => {
          const onEdit = () => { setBw(String(d.bw)); setWk((d.week||1)-1); if (d.blockName) setSelectedBlockName(d.blockName); };
          const onDelete = (e) => { e.stopPropagation(); setBwDeleteConfirm(d); };
          return <div key={i} onClick={onEdit} title="Click to edit" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:i%2===0?C.sf:'transparent',borderRadius:6,marginBottom:2,cursor:'pointer'}}>
            <div>
              <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{d.bw} kg</span>
              <span style={{fontSize:11,color:C.tm,marginLeft:8}}>{d.blockName||'?'} · W{d.week||'?'}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,color:C.td}}>{new Date(d.date).toLocaleDateString()}</span>
              <button onClick={onDelete} title="Delete entry" style={{background:'transparent',border:'none',color:C.td,cursor:'pointer',fontSize:14,padding:'2px 6px',borderRadius:4,lineHeight:1}}>×</button>
            </div>
          </div>;
        })}
        {bwData.length === 0 && <div style={{textAlign:'center',padding:20,color:C.td,fontSize:13}}>No bodyweight entries yet</div>}
      </div>
      {bwDeleteConfirm && <div onClick={() => setBwDeleteConfirm(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:20,maxWidth:320,width:'100%'}}>
          <div style={{fontFamily:FN,fontSize:13,color:C.td,marginBottom:6}}>DELETE ENTRY</div>
          <div style={{fontSize:14,color:C.tx,marginBottom:16}}>Remove {bwDeleteConfirm.bw}kg from {bwDeleteConfirm.blockName || '?'} · W{bwDeleteConfirm.week || '?'}?</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setBwDeleteConfirm(null)} style={{flex:1,padding:'10px 0',borderRadius:8,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:13,fontWeight:600,cursor:'pointer'}}>Cancel</button>
            <button onClick={() => { const d = bwDeleteConfirm; setBwLog(prev => prev.filter(b => !(b.clientId===d.clientId && b.blockName===d.blockName && b.week===d.week))); setBwDeleteConfirm(null); }} style={{flex:1,padding:'10px 0',borderRadius:8,border:'none',background:C.rd,color:'#fff',fontFamily:FB,fontSize:13,fontWeight:700,cursor:'pointer'}}>Delete</button>
          </div>
        </div>
      </div>}
    </div>;
  }

  // History
  if (vw === 'hist' && trainee) return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    <div style={{padding:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <button onClick={logOut} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:12,padding:0}}>← Log Out</button>
        <img src={EXPO_ICON} alt="EXPO" style={{height:18,opacity:0.5}} />
      </div>
      <div style={{display:'flex',gap:4,marginBottom:14}}>{[['prog','Program'],['bwt','BW Graph'],['hist',`History (${cw.length})`]].map(([k,l]) =>
        <button key={k} onClick={() => setVw(k)} style={{flex:1,padding:8,borderRadius:6,border:`1px solid ${vw===k?C.ac:C.bd}`,background:vw===k?C.acD:'transparent',color:vw===k?C.ac:C.tm,fontFamily:FB,fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>)}</div>
      <h2 style={{margin:'0 0 12px',fontFamily:FN,fontSize:18}}>History ({cw.length})</h2>
      {cw.length === 0 ? <div style={{textAlign:'center',padding:40,color:C.td}}>No workouts yet.</div> :
        cw.slice().reverse().map(w => <div key={w.id} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:12,marginBottom:8}}>
          <div style={{fontWeight:600,fontSize:13}}>{w.dayName} <span style={{color:C.tm,fontWeight:400}}>({w.planName})</span></div>
          <div style={{fontSize:11,color:C.tm}}>{new Date(w.date).toLocaleDateString()} · W{w.week}</div>
          {w.exercises.map((x,i) => <div key={i} style={{fontSize:11,color:C.tm,marginTop:2}}>{i+1}. {x.title} ({x.prescribed}) — {x.sets.filter(s=>s.done).length}/{x.sets.length}</div>)}
          {w.notes && <div style={{fontSize:11,color:C.tm,marginTop:4,background:C.sf2,padding:6,borderRadius:4}}>📝 {w.notes}</div>}
        </div>)}</div></div>;

  // Program view
  if (trainee) { const sl = Math.max(0, (trainee.sessionsRemaining || 0)); const lb = bwLog.filter(b => b.clientId === ci).slice(-1)[0]?.bw;
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      <div style={{background:`linear-gradient(135deg,${C.sf},${C.sf2})`,padding:'20px 20px 16px',borderBottom:`1px solid ${C.bd}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:28,display:'block'}} />
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button onClick={()=>setShowPwModal(true)} title="Change password" style={{background:'none',border:'none',color:C.tm,cursor:'pointer',padding:0,display:'flex',alignItems:'center'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
            <button onClick={logOut} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0}}>Log Out →</button>
          </div></div>
        <h1 style={{margin:'0 0 6px',fontFamily:FN,fontSize:20,color:C.tx,textAlign:'center'}}>Hey {clientName.split(' ')[0]} 💪</h1>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
          <div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{visPlans.map(p=><Bg key={p.name} color={C.ac}>{p.name}</Bg>)}</div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:22,fontWeight:700,fontFamily:FN,color:sl<=2?C.rd:C.gn}}>{sl}</div><div style={{fontSize:9,color:C.tm,fontFamily:FN}}>SESSIONS</div></div></div></div>
      <div style={{padding:20}}>
        <div style={{display:'flex',gap:4,marginBottom:14}}>{[['prog','Program'],['bwt','BW Graph'],['hist',`History (${cw.length})`]].map(([k,l]) =>
          <button key={k} onClick={() => setVw(k)} style={{flex:1,padding:8,borderRadius:6,border:`1px solid ${vw===k?C.ac:C.bd}`,background:vw===k?C.acD:'transparent',color:vw===k?C.ac:C.tm,fontFamily:FB,fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>)}</div>
        <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
          <div style={{flex:1}}><div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:4}}>Week</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{Array.from({length: activePlan?.weeks || 4}, (_, w) => <button key={w} onClick={() => setWk(w)} style={{flex:'1 1 40px',padding:'8px 0',borderRadius:6,border:`1px solid ${wk===w?C.ac:C.bd}`,background:wk===w?C.acD:'transparent',color:wk===w?C.ac:C.tm,fontFamily:FN,fontSize:12,fontWeight:600,cursor:'pointer'}}>W{w+1}</button>)}</div></div>
          <div style={{width:120}}><div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:4}}>BW {lb?`(${lb}kg)`:''}</div>
            <div style={{display:'flex',gap:4}}>
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="kg" type="number" disabled={!activePlan} style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:'8px',color:C.tx,fontFamily:FN,fontSize:12,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center',opacity:activePlan?1:0.5}}/>
            {bw && activePlan && <button onClick={()=>{setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.blockName===activePlan.name&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw),blockName:activePlan.name,planId:activePlan.id||null}]});setBw('')}} style={{background:C.acD,border:'none',borderRadius:6,padding:'4px 8px',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>Save</button>}
            </div></div></div>
        {activePlan?.rest && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,color:C.tm}}>⏱ {activePlan.rest}</div>}
        {plansLoadError && <div style={{background:C.rdD||'#3a1a1a',border:`1px solid ${C.rd||'#c94444'}`,borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:13,color:C.rd||'#ff6b6b',fontWeight:600,marginBottom:4}}>Couldn't load your programs</div>
          <div style={{fontSize:11,color:C.tm,marginBottom:8}}>{plansLoadError}</div>
          <button onClick={()=>{setPlansLoadError(null);setPlansReloadKey(k=>k+1);}} style={{background:'transparent',border:`1px solid ${C.rd||'#c94444'}`,color:C.rd||'#ff6b6b',borderRadius:6,padding:'6px 12px',fontFamily:FB,fontSize:12,fontWeight:600,cursor:'pointer'}}>Retry</button>
        </div>}
        {visPlans.length===0 && !plansLoadError && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:30,textAlign:'center',color:C.td,marginBottom:14}}><div style={{fontSize:20,marginBottom:8}}>📋</div><div style={{fontSize:13}}>No active programs right now. Contact your coach.</div></div>}
        {/* Per-plan block: divider → warm-up → rest → training days */}
        {(()=>{ let globalDayIdx = 0; return visPlans.map((vp,vpIdx) => <React.Fragment key={vp.name}>
          {visPlans.length>1 && <div style={{display:'flex',alignItems:'center',gap:10,margin:vpIdx===0?'0 0 12px':'20px 0 12px'}}>
            <div style={{flex:1,height:1,background:C.bd2}}/>
            <span style={{fontFamily:FN,fontSize:11,fontWeight:700,color:C.ac,letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{vp.name.toUpperCase()}</span>
            {vp.phase && <span style={{fontSize:10,color:C.tm}}>· {vp.phase}</span>}
            <div style={{flex:1,height:1,background:C.bd2}}/>
          </div>}
          {vp.warmup?.length > 0 && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{fontSize:11,fontFamily:FN,color:C.or,marginBottom:8,fontWeight:700}}>Warm-Up · {vp.name} ({vp.warmup.length})</div>
            {vp.warmup.map((w,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:i<vp.warmup.length-1?`1px solid ${C.bd}22`:'none'}}>
              <span style={{fontSize:13,color:C.tx}}>{w.t}</span>
              <div style={{display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:11,color:C.ac,fontFamily:FN,fontWeight:600}}>{w.rx}</span>
                {w.vid && <a href={w.vid} target="_blank" rel="noopener" style={{color:C.rd,fontSize:10,textDecoration:'none',padding:'2px 6px',background:C.rdD,borderRadius:4}}>▶</a>}</div></div>)}</div>}
          {vp.rest && visPlans.length>1 && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:11,color:C.tm}}>⏱ {vp.rest}</div>}
          {vp.days.map((day,di) => { const dayIdx = globalDayIdx++; const done = cw.some(w => w.dayName === day.name && w.week === wk + 1);
          return <div key={vp.name+'-'+di} style={{background:C.sf,border:`1px solid ${done?C.gn+'40':C.bd}`,borderRadius:12,marginBottom:12,padding:'14px 18px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div><span style={{fontWeight:700,fontSize:15}}>{day.name}</span>{done && <Bg color={C.gn} style={{fontSize:9,padding:'2px 6px',marginLeft:6}}>✓</Bg>}
                <div style={{fontSize:11,color:C.tm,marginTop:2}}>{day.ex.length} exercises</div></div>
              <button onClick={() => setLg(dayIdx)} style={{padding:'6px 12px',borderRadius:6,border:'none',background:done?C.gnD:C.acD,color:done?C.gn:C.ac,fontFamily:FB,fontSize:11,fontWeight:600,cursor:'pointer'}}>{done?'Again':'📝 Log'}</button></div>
            {day.ex.map((ex,i) => {const d = EX[ex.eid]; if(!d) return null; const hw = ex.wk?.length>0; const wr = hw ? (ex.wk[wk] ?? ex.r) : null;
              return <div key={i} style={{display:'flex',gap:8,alignItems:'center',padding:'4px 0',borderTop:i?`1px solid ${C.bd}22`:'none'}}>
                <div style={{width:22,height:22,borderRadius:4,background:C.acD,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FN,fontSize:10,fontWeight:700,color:C.ac,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:12}}>{d.t}</div>
                  <span style={{fontSize:11,fontWeight:700,color:C.ac,fontFamily:FN}}>{hw?(wr||''):((ex.wkS&&ex.wkS[wk])||ex.s)+'x'+ex.r}</span>
                  {ex.tempo && <span style={{fontSize:9,color:C.or,marginLeft:4}}>{ex.tempo}</span>}</div>
                {d.vid && <a href={d.vid} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:C.rd,fontSize:10,textDecoration:'none',padding:'2px 6px',background:C.rdD,borderRadius:4,flexShrink:0}}>▶</a>}
              </div>})}
          </div>})}</React.Fragment>)})()}
      </div>
      {showPwModal && <PasswordChangeModal onClose={()=>setShowPwModal(false)}/>}
      </div>; }

  // Falls through while trainees are still loading (ci set but not yet matched).
  // Auth is handled upstream in App.jsx — no login form here.
  return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20,gap:16}}>
    <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:50}} />
    <div style={{color:C.td,fontSize:13}}>Loading your program…</div>
  </div>;
}
