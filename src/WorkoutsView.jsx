import React, { useState, useEffect, useMemo } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, FH, uid } from './theme';

// Hebrew renders ~3px smaller than Nord at the same fontSize (smaller
// x-height, missing ascenders/descenders). Same pattern that's already
// applied to NotesWidget, PlansView, WorkoutReview.
const isHebrew = (s) => /[֐-׿]/.test(s || '');
import { Btn, TextArea, Badge, Card, ConfirmDialog, EmptyState, baseInput, isRefined5b, CollapsibleSection } from './ui';
import { supabase } from './supabase';

function WorkoutLogger({ workout, exercises, priorWorkouts, onUpdate, onComplete, onBack }) {
  const updateSet = (ei,si,u) => { const exs=[...workout.exercises]; const sets=[...exs[ei].sets]; sets[si]={...sets[si],...u}; exs[ei]={...exs[ei],sets}; onUpdate({exercises:exs}); };
  const updateEx = (ei,u) => { const exs=[...workout.exercises]; exs[ei]={...exs[ei],...u}; onUpdate({exercises:exs}); };
  // Group consecutive exercises that share a superset letter into one block —
  // like the athlete portal renders them — instead of a big "Group A" badge on
  // every row.
  const groups = [];
  workout.exercises.forEach((ex,i) => {
    const ss = ex.superset || '';
    const last = groups[groups.length-1];
    if (ss && last && last.ss === ss) last.items.push({ex,i});
    else groups.push({ ss, items:[{ex,i}] });
  });
  // Library lookup Map — 1,467 exercises; this view re-renders on every set
  // keystroke, so a linear .find per exercise card was the slowest input
  // path in the coach app.
  const exById = useMemo(() => new Map((exercises || []).map(e => [e.id, e])), [exercises]);
  // Most-recent prior top set per exerciseId — the "last time" reference,
  // the in-person equivalent of the athlete portal's previous-week ghost
  // row. Precomputed ONCE per priorWorkouts change (it used to re-sort the
  // whole history per exercise per render).
  const lastTimeById = useMemo(() => {
    const out = new Map();
    const sorted = (priorWorkouts || []).slice().sort((a, b) => new Date(b.completedAt || b.date) - new Date(a.completedAt || a.date));
    for (const pw of sorted) {
      for (const pex of (pw.exercises || [])) {
        // Tolerate both shapes: coach workouts use exerciseId/completed;
        // athlete client_workouts use eid/done.
        const id = pex.exerciseId || pex.eid;
        if (!id || out.has(id)) continue;
        const sets = pex.sets || [];
        // A logged load qualifies even if the "done" box was skipped.
        const done = sets.filter(s => (s.completed || s.done) && parseFloat(s.load) > 0);
        const logged = done.length ? done : sets.filter(s => parseFloat(s.load) > 0);
        if (!logged.length) continue;
        const top = logged.reduce((a, b) => parseFloat(b.load) > parseFloat(a.load) ? b : a);
        out.set(id, { load: top.load, reps: top.reps, date: pw.completedAt || pw.date });
      }
    }
    return out;
  }, [priorWorkouts]);
  const lastTimeFor = (ex) => lastTimeById.get(ex.exerciseId) || null;
  // Per-set previous-week reference (the portal's progressive-overload ghost):
  // what the athlete logged for THIS plan + day in the immediately previous
  // week. Keyed by exercise id → that exercise's set array. Tolerates both
  // shapes (eid/exerciseId). Empty on week 1 (no week before it).
  const prevWeek = useMemo(() => {
    const tgt = (Number(workout.week) || 1) - 1;
    const out = new Map();
    if (tgt < 1) return out;
    for (const pw of (priorWorkouts || [])) {
      if (pw.planName !== workout.planName || pw.dayName !== workout.dayName) continue;
      if ((Number(pw.week) || 0) !== tgt) continue;
      for (const pex of (pw.exercises || [])) {
        const id = pex.exerciseId || pex.eid;
        if (!id || out.has(id)) continue;
        out.set(id, pex.sets || []);
      }
    }
    return out;
  }, [priorWorkouts, workout.week, workout.planName, workout.dayName]);
  // Collapse (long in-person sessions): a finished exercise folds to a
  // one-line summary so the rest of the list stays scannable. Auto-collapses
  // once every set is logged; tap the summary (or the HIDE control) to toggle.
  const [manualCollapse, setManualCollapse] = useState({}); // exIdx → explicit override
  const [groupCollapse, setGroupCollapse] = useState({});   // superset gi → explicit override
  // Sticky progress header pins below the coach nav (position:sticky top:0).
  // Measure the nav height so it stays correct at any width / wrap.
  const [stickyTop, setStickyTop] = useState(57);
  useEffect(() => {
    const measure = () => { const h = document.querySelector('header'); if (h) setStickyTop(Math.round(h.getBoundingClientRect().height)); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const allDone = (ex) => ex.sets.length > 0 && ex.sets.every(s => s.completed);
  const isCollapsed = (ex, exIdx) =>
    manualCollapse[exIdx] !== undefined ? manualCollapse[exIdx] : allDone(ex);
  const toggleCollapse = (ex, exIdx) =>
    setManualCollapse(m => ({ ...m, [exIdx]: !isCollapsed(ex, exIdx) }));
  // Superset-level collapse: one control for the whole group (both members),
  // instead of a HIDE per exercise. Auto-collapses once every member is done.
  const groupAllDone = (items) => items.length > 0 && items.every(({ ex }) => allDone(ex));
  const isGroupCollapsed = (gi, items) =>
    groupCollapse[gi] !== undefined ? groupCollapse[gi] : groupAllDone(items);
  const toggleGroup = (gi, items) =>
    setGroupCollapse(m => ({ ...m, [gi]: !isGroupCollapsed(gi, items) }));

  const renderExercise = (ex, exIdx, inGroup, withDivider, groupControlled = false) => {
    const exData = exById.get(ex.exerciseId);
    const videoUrl = ex.videoUrl ?? ex.vid ?? exData?.videoLink ?? '';
    const prevSets = prevWeek.get(ex.exerciseId);   // previous-week set array (or undefined)
    const prevWeekNum = (Number(workout.week) || 1) - 1;
    const cue = ex.q || exData?.cues || ex.notes;
    const doneCount = ex.sets.filter(s => s.completed).length;
    // Collapsed = a one-line summary the coach can tap to reopen. Skipped when
    // groupControlled — a superset's single header drives both members, so each
    // member always renders full (no per-exercise collapse inside a superset).
    if (isCollapsed(ex, exIdx) && !groupControlled) {
      const fullyDone = allDone(ex);
      return (
        <div key={ex.id} onClick={() => toggleCollapse(ex, exIdx)}
          style={{
            background: inGroup ? 'transparent' : 'var(--c-sf)',
            border: inGroup ? 'none' : `1px solid ${C.cardBd}`,
            borderTop: withDivider ? `1px solid ${C.cardBd}` : undefined,
            borderLeft: `3px solid ${fullyDone ? C.gn : C.cardBd}`,
            borderRadius: 0, padding: inGroup ? '12px' : '14px',
            marginBottom: inGroup ? 0 : 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
          <span style={{ fontWeight: 700, color: C.tx, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullyDone && <span style={{ color: C.gn, marginRight: 6 }}>✓</span>}
            {exIdx+1}. {exData?.title||ex.title||"Unknown"}
          </span>
          <span style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: fullyDone ? C.gn : C.tm, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {doneCount}/{ex.sets.length} SETS · OPEN ▾
          </span>
        </div>
      );
    }
    return (
      <div key={ex.id} style={{background: inGroup ? 'transparent' : 'var(--c-sf)', border: inGroup ? 'none' : `1px solid ${C.cardBd}`, borderTop: withDivider ? `1px solid ${C.cardBd}` : undefined, borderRadius:0, padding: inGroup ? '10px 0 4px' : 14, marginBottom: inGroup ? 0 : 10}}>
        {/* Header: title + meta on the left (wraps freely), HIDE control fixed
            top-right. alignItems:flex-start keeps HIDE aligned to the first
            line even when the meta wraps to two rows. */}
        <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8}}>
          <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontWeight:700,color:C.tx}}>{exIdx+1}. {exData?.title||ex.title||"Unknown"}</span>
            <span style={{fontWeight:400,color:C.tm,fontSize:12}}>{ex.reps} reps · RPE {ex.rpe||"—"} · Rest {ex.rest}s</span>
            {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.1em',color:C.ac,border:`1px solid ${C.ac}`,padding:'2px 8px',textDecoration:'none'}}>▶ VIDEO</a>}
          </div>
          {!groupControlled && <button onClick={() => toggleCollapse(ex, exIdx)} title="Collapse this exercise"
            style={{flexShrink:0,display:'inline-flex',alignItems:'center',gap:5,height:24,background:'transparent',border:`1px solid ${C.cardBd}`,color:C.tm,cursor:'pointer',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',padding:'0 9px',borderRadius:0}}>HIDE ▴</button>}
        </div>
        {/* Coach cue — was tiny faded italic (unreadable). Now a readable
            accent-barred block: full-size, not italic, RTL-aware for Hebrew. */}
        {cue && (
          <div style={{display:'flex',gap:10,marginBottom:10,background:'rgba(57,189,255,0.06)',borderInlineStart:`3px solid ${C.ac}`,padding:'9px 12px'}}>
            <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',color:C.ac,flexShrink:0,paddingTop:2}}>CUE</span>
            <div style={{minWidth:0,flex:1,fontSize:13,color:C.tx,lineHeight:1.5,direction:isHebrew(cue)?'rtl':'ltr',textAlign:isHebrew(cue)?'right':'left',fontFamily:isHebrew(cue)?FH:FB,wordBreak:'break-word'}}>{cue}</div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",marginBottom:4}}>
          {["SET","REPS","LOAD","RPE","DONE"].map(h=><div key={h} style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',textAlign:"center"}}>{h}</div>)}</div>
        {ex.sets.map((set,sIdx)=>{
          // Ghost row above each set: what the athlete logged for this same set
          // index in the previous week (progressive-overload reference).
          const prior = prevSets?.[sIdx];
          return <React.Fragment key={sIdx}>
            {prior && (parseFloat(prior.load)>0 || prior.reps) && (
              <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",marginTop:sIdx===0?0:6,opacity:0.5}}>
                <span style={{fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:C.ac,textAlign:"center"}}>W{prevWeekNum}</span>
                <div style={{fontFamily:FB,fontSize:13,color:C.tx,textAlign:"center",fontVariantNumeric:'tabular-nums'}}>{prior.reps||'—'}</div>
                <div style={{fontFamily:FB,fontSize:13,color:C.tx,textAlign:"center",fontVariantNumeric:'tabular-nums'}}>{parseFloat(prior.load)||'—'}</div>
                <div style={{fontFamily:FB,fontSize:13,color:C.tx,textAlign:"center",fontVariantNumeric:'tabular-nums'}}>{prior.rpe||'—'}</div>
                <div/>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",padding:"4px 0",opacity:set.completed?.5:1}}>
              <span style={{fontFamily:FN,fontSize:13,color:C.tm,textAlign:"center"}}>{set.setNum}</span>
              <input type="number" value={set.reps} onChange={e=>updateSet(exIdx,sIdx,{reps:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
              <input type="number" value={set.load} onChange={e=>updateSet(exIdx,sIdx,{load:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
              <input value={set.rpe} onChange={e=>updateSet(exIdx,sIdx,{rpe:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
              <div style={{textAlign:"center"}}><input type="checkbox" checked={set.completed} onChange={e=>updateSet(exIdx,sIdx,{completed:e.target.checked})} style={{width:18,height:18,accentColor:C.gn,cursor:"pointer"}}/></div>
            </div>
          </React.Fragment>;})}
        {/* Coach's session note — separate from the prescribed cue above, so
            this field starts blank instead of echoing the plan's note. */}
        <input value={ex.coachNote||""} onChange={e=>updateEx(exIdx,{coachNote:e.target.value})} placeholder="Notes for this exercise…" style={{...baseInput,marginTop:6,padding:"6px 8px",fontSize:12,width:"100%",boxSizing:"border-box"}} />
      </div>);
  };
  const totalSets = workout.exercises.reduce((a,ex)=>a+ex.sets.length,0);
  const doneSets = workout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.completed).length,0);
  const pct = totalSets>0?Math.round(doneSets/totalSets*100):0;
  const isCompleted = workout.status==="completed";
  return (
    <div>
      {/* Sticky progress header — pinned just below the coach nav so the %
          progress + Back stay on screen through a long scroll. The Complete
          action lives at the BOTTOM, after Session Observations (Ohad). */}
      <div style={{position:'sticky',top:stickyTop,zIndex:40,background:C.bg,paddingTop:8,paddingBottom:10,marginBottom:8,borderBottom:`1px solid ${C.cardBd}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0}}>← BACK</button>
          {isCompleted&&<Badge color={C.gn} style={{fontSize:13,padding:"6px 14px"}}>Completed</Badge>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:FN,color:C.tm,marginBottom:4}}>
          <span>{workout.dayName} {workout.planName&&<span style={{color:C.td}}>({workout.planName})</span>}</span>
          <span style={{color:C.tx,fontWeight:700}}>W{workout.week} · {doneSets}/{totalSets} · {pct}%</span></div>
        <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:6,overflow:"hidden"}}><div style={{background:C.gn,height:"100%",width:`${pct}%`,transition:"width 0.3s"}}/></div>
      </div>
      {groups.map((g,gi) => g.ss ? (() => {
        // One expand/collapse for the whole superset — drives both members.
        const collapsed = isGroupCollapsed(gi, g.items);
        const allD = groupAllDone(g.items);
        const doneSets = g.items.reduce((a,{ex})=>a+ex.sets.filter(s=>s.completed).length,0);
        const totalSets = g.items.reduce((a,{ex})=>a+ex.sets.length,0);
        const titles = g.items.map(({ex})=>(exById.get(ex.exerciseId)?.title)||ex.title||'?').join(' + ');
        return (
        <div key={gi} style={{border:`1px solid ${C.pu}`, borderLeft:`3px solid ${allD?C.gn:C.pu}`, borderRadius:0, padding:'8px 12px', marginBottom:10, background: 'var(--c-sf)'}}>
          <button onClick={()=>toggleGroup(gi,g.items)} title={collapsed?'Expand superset':'Collapse superset'}
            style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,background:'transparent',border:'none',cursor:'pointer',padding:0,textAlign:'left'}}>
            <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',color:allD?C.gn:C.pu,textTransform:'uppercase',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {allD && <span style={{marginRight:6}}>✓</span>}Superset {g.ss}{collapsed && <span style={{color:C.tm,fontWeight:600,letterSpacing:'0.04em',textTransform:'none'}}> · {titles}</span>}
            </span>
            <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',color:allD?C.gn:C.tm,flexShrink:0,whiteSpace:'nowrap'}}>{doneSets}/{totalSets} SETS · {collapsed?'OPEN ▾':'HIDE ▴'}</span>
          </button>
          {!collapsed && <div style={{marginTop:4}}>{g.items.map(({ex,i},k) => renderExercise(ex, i, true, k>0, true))}</div>}
        </div>
        );
      })() : (
        g.items.map(({ex,i}) => renderExercise(ex, i, false))
      ))}
      <TextArea label="Workout Notes" value={workout.notes||""} onChange={e=>onUpdate({notes:e.target.value})} placeholder="Session observations..." />
      {/* Primary Complete action at the very bottom — after every set + the
          session notes (Ohad: "complete workout … beneath session observations"). */}
      {!isCompleted
        ? <Btn variant="success" onClick={onComplete} style={{width:'100%',marginTop:14,padding:'14px',fontSize:14,fontWeight:700}}>Complete Workout</Btn>
        : <div style={{marginTop:14,textAlign:'center'}}><Badge color={C.gn} style={{fontSize:13,padding:"8px 16px"}}>Completed</Badge></div>}
    </div>);
}

export default function WorkoutsView({ workouts, setWorkouts, planIndex, trainees, exercises, onDecrementSession, clientWorkouts = [], setClientWorkouts, deleteClientWorkout }) {
  const libById = useMemo(() => new Map((exercises || []).map(e => [e.id, e])), [exercises]);
  // The active session is LOCAL (component state), never persisted as an
  // "in-progress" record — a half-logged session shouldn't be saved unless an
  // athlete is genuinely live in the app. On Complete it's written to
  // client_workouts (the athlete's portal history).
  const [active, setActive] = useState(null);
  const [filterTrainee, setFilterTrainee] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedTrainees, setExpandedTrainees] = useState({});
  // Picker state — search box + which athlete row is expanded (accordion) +
  // the chosen "log into" week per plan (picked before entering the logger).
  const [pickSearch, setPickSearch] = useState("");
  const [pickOpen, setPickOpen] = useState(null);
  const [weekByPlan, setWeekByPlan] = useState({});
  // Default week for a plan = the athlete's next un-logged week (max logged in
  // their portal history + 1, capped at block length), else W1.
  const defaultWeekFor = (p) => {
    const wks = (clientWorkouts || []).filter(x => x.clientId === p.traineeId && x.planName === p.name).map(x => Number(x.week) || 1);
    const max = wks.length ? Math.max(...wks) : 0;
    return Math.min(Number(p.weeks) || 4, Math.max(1, max + 1));
  };
  // Seed the trainee filter from sessionStorage — set by the "LOG SESSION"
  // button on TraineeDetail so the coach lands here pre-filtered to the
  // athlete they were just looking at. Stash is consumed on first mount.
  useEffect(() => {
    try {
      const tid = sessionStorage.getItem('expo-pendingInPersonTrainee');
      if (tid) { setFilterTrainee(tid); sessionStorage.removeItem('expo-pendingInPersonTrainee'); }
    } catch {}
  }, []);
  const startWorkout = async (planSummary, dayIdx, weekArg) => {
    // Load full plan data from Supabase
    const { data: fullPlan } = await supabase.from('plans').select('*').eq('id', planSummary.id).single();
    if (!fullPlan) return;
    const days = fullPlan.data?.days || [];
    const day = days[dayIdx];
    if (!day) return;
    // Drive-imported plans store exercises under day.ex with compressed keys
    // (eid/s/r) instead of day.exercises (id/exerciseId/sets/reps). Without
    // this fallback the in-person log crashes on old-shape plans — 174 of the
    // 209 production plans use the old shape. Mirror useFullPlan's normalize.
    const dayExercises = Array.isArray(day.exercises) ? day.exercises : (Array.isArray(day.ex) ? day.ex.map(e => ({
      id: e.id || uid(),
      exerciseId: e.exerciseId || e.eid || '',
      sets: e.sets ?? e.s ?? 3,
      reps: e.reps ?? e.r ?? '',
      tempo: e.tempo ?? '',
      superset: e.superset ?? '',
      notes: e.notes ?? e.n ?? '',
    })) : []);
    // Week comes from the picker (chosen before entering the logger). Fall back
    // to the athlete's next un-logged week for this plan+day if none passed.
    const planWeeks = Number(fullPlan.data?.weeks) || 4;
    let week = Number(weekArg) || 0;
    if (week < 1) {
      const loggedWeeks = (clientWorkouts || [])
        .filter(x => x.clientId === fullPlan.trainee_id && x.planName === fullPlan.name && x.dayName === day.name)
        .map(x => Number(x.week) || 1);
      week = loggedWeeks.length ? Math.max(...loggedWeeks) + 1 : 1;
    }
    week = Math.min(planWeeks, Math.max(1, week));
    const w = {id:uid(),planId:fullPlan.id,traineeId:fullPlan.trainee_id,dayName:day.name,planName:fullPlan.name,
      date:new Date().toISOString(),status:"in-progress", week, planWeeks,
      exercises:dayExercises.map(ex=>({...ex,id:uid(),sets:Array.from({length:Number(ex.sets)||3},(_,i)=>({setNum:i+1,reps:"",load:"",rpe:"",completed:false}))})),
      notes:""};
    setActive(w);
  };
  const updateActive = (updates) => setActive(prev => prev ? { ...prev, ...updates } : prev);
  const completeWorkout = () => {
    const w = active;
    if (!w) return;
    const finishedAt = new Date().toISOString();
    if (w.traineeId) onDecrementSession(w.traineeId);
    // FULL PORTAL INTEGRATION: write a client_workouts row so the in-person
    // session shows in the athlete's portal History / PRs / previous-week
    // ghost — the same store + shape the portal logs to. reviewedAt is set
    // (the coach logged it, nothing to review) and source tags its origin.
    if (setClientWorkouts) {
      const row = {
        id: 'cw_' + uid(), clientId: w.traineeId, planName: w.planName, dayName: w.dayName,
        week: Number(w.week) || 1, date: finishedAt, completedAt: finishedAt,
        notes: w.notes || '', formVideos: [], reviewedAt: finishedAt, source: 'coach-session',
        exercises: (w.exercises || []).map(ex => ({
          eid: ex.exerciseId || '',
          title: libById.get(ex.exerciseId)?.title || ex.title || '',
          prescribed: `${(ex.sets || []).length}×${ex.reps || ''}`,
          sets: (ex.sets || []).map(s => ({ reps: s.reps, load: s.load, rpe: s.rpe, done: !!s.completed })),
          substitution: null,
        })),
      };
      setClientWorkouts(prev => [...prev, row]);
    }
    setActive(null);
  };
  // Filter the plan picker. Without this, the picker dumps all 209
  // production plans into one scroll. Active-only by default and a
  // trainee filter that piggybacks the same state the Completed
  // filter below already uses, so the coach only sees relevant
  // starting points.
  // NOTE: every useMemo lives ABOVE the early `return` below — React
  // requires identical hook order each render. Crash repro before this
  // ordering fix was React #300 ("rendered more hooks than during the
  // previous render") when activeWorkout toggled between renders.
  const activeTraineeIds = useMemo(
    () => new Set((trainees || []).filter(t => t.status !== 'Archived').map(t => t.id)),
    [trainees]
  );
  const visiblePlans = useMemo(
    () => (planIndex || []).filter(p =>
      p.active !== false &&
      activeTraineeIds.has(p.traineeId) &&
      (!filterTrainee || p.traineeId === filterTrainee)
    ),
    [planIndex, activeTraineeIds, filterTrainee]
  );
  // Group visiblePlans by trainee and pick the latest block per trainee
  // (most recently updated). For an in-person session, the coach is
  // almost always logging against the trainee's CURRENT block, not an
  // older one. So default the picker to one card per trainee. The
  // expander reveals the older blocks for the rare "they're running a
  // different program today" case.
  const plansByTrainee = useMemo(() => {
    const m = new Map();
    for (const p of visiblePlans) {
      if (!m.has(p.traineeId)) m.set(p.traineeId, []);
      m.get(p.traineeId).push(p);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }
    return m;
  }, [visiblePlans]);
  if (active) {
    const w = active;
    // Previous-week reference reads the athlete's portal history (the same
    // store the portal logs to, which now includes coach-logged sessions).
    const priorWorkouts = (clientWorkouts||[]).filter(x => x.clientId===w.traineeId);
    return <WorkoutLogger workout={w} exercises={exercises} priorWorkouts={priorWorkouts} onUpdate={updateActive} onComplete={completeWorkout} onBack={()=>setActive(null)} />;
  }
  // "Completed" = coach-logged sessions in the athlete's portal history.
  const completed = (clientWorkouts||[])
    .filter(w => w.source==='coach-session' && (!filterTrainee || w.clientId===filterTrainee))
    .slice().sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
  const toggleExpanded = (tid) => setExpandedTrainees(prev => ({ ...prev, [tid]: !prev[tid] }));
  return (
    <div>
      {/* Picker — search-first accordion. One calm row per athlete (name +
          current block); tap to reveal that block's day buttons. Replaces the
          old wall of full-height cards (every athlete's buttons + older-block
          bars on screen at once = too much). */}
      <h3 style={{fontFamily:FN,fontSize:9,fontWeight:700,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',margin:'0 0 12px'}}>
        Start a Session
      </h3>
      {planIndex.length===0 ? (
        <div style={{color:C.td,fontSize:13,marginBottom:20}}>Create a plan first.</div>
      ) : (
        <div style={{marginBottom:24}}>
          {filterTrainee ? (
            <button onClick={()=>setFilterTrainee("")} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.08em',padding:'0 0 10px'}}>← all athletes</button>
          ) : (
            <input value={pickSearch} onChange={e=>setPickSearch(e.target.value)} placeholder="Search athlete…"
              style={{...baseInput,width:'100%',boxSizing:'border-box',padding:'10px 12px',fontSize:14,marginBottom:10}} />
          )}
          <div style={{border:`1px solid ${C.cardBd}`}}>
            {(() => {
              const rows = Array.from(plansByTrainee.entries())
                .map(([tid,plans])=>({tid,plans,name:(trainees.find(t=>t.id===tid)?.name)||''}))
                .filter(r => filterTrainee ? r.tid===filterTrainee : (!pickSearch || r.name.toLowerCase().includes(pickSearch.toLowerCase())))
                .sort((a,b)=>a.name.localeCompare(b.name));
              if (!rows.length) return <div style={{color:C.td,fontSize:13,padding:'18px',textAlign:'center'}}>No athletes match.</div>;
              // Auto-open when the list is down to one (search hit or deep-link).
              const forceOpen = (filterTrainee || (rows.length===1 ? rows[0].tid : null));
              return rows.map(({tid,plans,name},ri)=>{
                const open = pickOpen===tid || forceOpen===tid;
                const latest = plans[0];
                const heb = isHebrew(name);
                const olderOpen = !!expandedTrainees[tid];
                const blocks = olderOpen ? plans : [latest];
                return (
                  <div key={tid} style={{borderTop: ri===0?'none':`1px solid ${C.cardBd}`}}>
                    <button onClick={()=>setPickOpen(open && pickOpen===tid ? null : tid)}
                      onMouseEnter={e=>{if(!open)e.currentTarget.style.background='rgba(57,189,255,0.04)';}}
                      onMouseLeave={e=>{if(!open)e.currentTarget.style.background='transparent';}}
                      style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
                        background: open?'var(--c-sf)':'transparent',border:'none',cursor:'pointer',padding:'12px 14px',textAlign:'left',transition:'background .12s'}}>
                      <span style={{display:'flex',alignItems:'baseline',gap:10,minWidth:0}}>
                        <span style={{fontFamily:heb?FH:FB,fontSize:heb?16:14,fontWeight:600,color:C.tx,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</span>
                        <span style={{fontFamily:FN,fontSize:11,color:C.tm,whiteSpace:'nowrap'}}>{latest.name}</span>
                      </span>
                      <span style={{fontFamily:FN,fontSize:12,color:'#FFF',flexShrink:0,transform:open?'rotate(180deg)':'none',transition:'transform .15s'}}>▾</span>
                    </button>
                    {open && (
                      <div style={{padding:'0 14px 14px'}}>
                        {blocks.map((p,bi)=>{
                          const pw = Number(p.weeks)||4;
                          const selWeek = weekByPlan[p.id] ?? defaultWeekFor(p);
                          return (
                          <div key={p.id} style={{marginTop: bi===0?2:10, paddingTop: bi===0?0:10, borderTop: bi===0?'none':`1px solid ${C.cardBd}`}}>
                            {blocks.length>1 && <div style={{fontFamily:FN,fontSize:10,color:C.td,letterSpacing:'0.08em',marginBottom:6}}>{p.name}</div>}
                            {/* Week to log into — chosen here, before the logger opens. */}
                            {pw>1 && <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap',marginBottom:8}}>
                              <span style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.14em',color:C.tm,marginRight:2}}>LOG INTO</span>
                              {Array.from({length:pw},(_,i)=>i+1).map(wn=>(
                                <button key={wn} onClick={()=>setWeekByPlan(m=>({...m,[p.id]:wn}))}
                                  style={{minWidth:32,padding:'3px 0',borderRadius:0,border:`${selWeek===wn?'2px':'1px'} solid ${selWeek===wn?C.ac:C.cardBd}`,background:selWeek===wn?'rgba(57,189,255,0.1)':'transparent',color:selWeek===wn?C.ac:C.tm,fontFamily:FN,fontSize:10,fontWeight:700,cursor:'pointer'}}>W{wn}</button>
                              ))}
                            </div>}
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{(p.dayNames||[]).map((dName,i)=><Btn key={i} variant="ghost" onClick={()=>startWorkout(p,i,selWeek)} style={{fontSize:12,padding:"5px 12px"}}>▶ {dName}</Btn>)}</div>
                          </div>
                          );
                        })}
                        {plans.length>1 && (
                          <button onClick={()=>toggleExpanded(tid)}
                            style={{marginTop:10,background:'transparent',border:'none',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.1em',cursor:'pointer',padding:'4px 0'}}>
                            {olderOpen ? 'HIDE OLDER BLOCKS' : `+ ${plans.length-1} OLDER BLOCK${plans.length-1===1?'':'S'}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
      {/* No "logged" list here — a completed session writes straight to the
          athlete's portal History (and shows on their page + Review). The
          Single page's only job is to START/log a session. */}
    </div>);
}
