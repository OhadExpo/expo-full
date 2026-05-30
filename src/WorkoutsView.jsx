import React, { useState, useEffect, useMemo } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, FH, uid } from './theme';

// Hebrew renders ~3px smaller than Nord at the same fontSize (smaller
// x-height, missing ascenders/descenders). Same pattern that's already
// applied to NotesWidget, PlansView, WorkoutReview.
const isHebrew = (s) => /[֐-׿]/.test(s || '');
import { Btn, TextArea, Badge, Card, ConfirmDialog, EmptyState, baseInput, isRefined5b } from './ui';
import { supabase } from './supabase';

function WorkoutLogger({ workout, exercises, onUpdate, onComplete, onBack }) {
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
  const renderExercise = (ex, exIdx, inGroup, withDivider) => {
    const exData = exercises.find(e=>e.id===ex.exerciseId);
    const videoUrl = ex.videoUrl ?? ex.vid ?? exData?.videoLink ?? '';
    return (
      <div key={ex.id} style={{background: inGroup ? 'transparent' : (isRefined5b() ? '#FFFFFF' : 'var(--c-sf)'), border: inGroup ? 'none' : `1px solid ${C.cardBd}`, borderTop: withDivider ? `1px solid ${C.cardBd}` : undefined, borderRadius:0, padding: inGroup ? '10px 0 4px' : 14, marginBottom: inGroup ? 0 : 10}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <span style={{fontWeight:700,color:C.tx}}>{exIdx+1}. {exData?.title||ex.title||"Unknown"}</span>
          <span style={{fontWeight:400,color:C.tm,fontSize:12}}>{ex.reps} reps · RPE {ex.rpe||"—"} · Rest {ex.rest}s</span>
          {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.1em',color:C.ac,border:`1px solid ${C.ac}`,padding:'2px 8px',textDecoration:'none'}}>▶ VIDEO</a>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",marginBottom:4}}>
          {["SET","REPS","LOAD","RPE","DONE"].map(h=><div key={h} style={{fontSize:9,fontFamily:FN,color:C.tm,letterSpacing:'0.18em',textAlign:"center"}}>{h}</div>)}</div>
        {ex.sets.map((set,sIdx)=>(
          <div key={sIdx} style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",padding:"4px 0",opacity:set.completed?.5:1}}>
            <span style={{fontFamily:FN,fontSize:13,color:C.tm,textAlign:"center"}}>{set.setNum}</span>
            <input type="number" value={set.reps} onChange={e=>updateSet(exIdx,sIdx,{reps:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
            <input type="number" value={set.load} onChange={e=>updateSet(exIdx,sIdx,{load:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
            <input value={set.rpe} onChange={e=>updateSet(exIdx,sIdx,{rpe:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
            <div style={{textAlign:"center"}}><input type="checkbox" checked={set.completed} onChange={e=>updateSet(exIdx,sIdx,{completed:e.target.checked})} style={{width:18,height:18,accentColor:C.gn,cursor:"pointer"}}/></div>
          </div>))}
        <input value={ex.notes||""} onChange={e=>updateEx(exIdx,{notes:e.target.value})} placeholder="Notes for this exercise…" style={{...baseInput,marginTop:6,padding:"6px 8px",fontSize:12,width:"100%",boxSizing:"border-box"}} />
      </div>);
  };
  const totalSets = workout.exercises.reduce((a,ex)=>a+ex.sets.length,0);
  const doneSets = workout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.completed).length,0);
  const pct = totalSets>0?Math.round(doneSets/totalSets*100):0;
  const isCompleted = workout.status==="completed";
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0}}>← BACK</button>
        {!isCompleted&&<Btn variant="success" onClick={onComplete}>Complete Workout</Btn>}
        {isCompleted&&<Badge color={C.gn} style={{fontSize:13,padding:"6px 14px"}}>Completed</Badge>}
      </div>
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:FN,color:C.tm,marginBottom:4}}>
          <span>{workout.dayName} {workout.planName&&<span style={{color:C.td}}>({workout.planName})</span>}</span>
          <span>{doneSets}/{totalSets} · {pct}%</span></div>
        <div style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:6,overflow:"hidden"}}><div style={{background:C.gn,height:"100%",width:`${pct}%`,transition:"width 0.3s"}}/></div>
      </div>
      {groups.map((g,gi) => g.ss ? (
        <div key={gi} style={{border:`1px solid ${C.pu}`, borderLeft:`3px solid ${C.pu}`, borderRadius:0, padding:'8px 12px 4px', marginBottom:10, background: isRefined5b() ? '#FFFFFF' : 'var(--c-sf)'}}>
          <div style={{fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.18em',color:C.pu,textTransform:'uppercase',marginBottom:2}}>Superset {g.ss}</div>
          {g.items.map(({ex,i},k) => renderExercise(ex, i, true, k>0))}
        </div>
      ) : (
        g.items.map(({ex,i}) => renderExercise(ex, i, false))
      ))}
      <TextArea label="Workout Notes" value={workout.notes||""} onChange={e=>onUpdate({notes:e.target.value})} placeholder="Session observations..." />
    </div>);
}

export default function WorkoutsView({ workouts, setWorkouts, planIndex, trainees, exercises, onDecrementSession }) {
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [filterTrainee, setFilterTrainee] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedTrainees, setExpandedTrainees] = useState({});
  // Seed the trainee filter from sessionStorage — set by the "LOG SESSION"
  // button on TraineeDetail so the coach lands here pre-filtered to the
  // athlete they were just looking at. Stash is consumed on first mount.
  useEffect(() => {
    try {
      const tid = sessionStorage.getItem('expo-pendingInPersonTrainee');
      if (tid) { setFilterTrainee(tid); sessionStorage.removeItem('expo-pendingInPersonTrainee'); }
    } catch {}
  }, []);
  const startWorkout = async (planSummary, dayIdx) => {
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
    const w = {id:uid(),planId:fullPlan.id,traineeId:fullPlan.trainee_id,dayName:day.name,planName:fullPlan.name,
      date:new Date().toISOString(),status:"in-progress",
      exercises:dayExercises.map(ex=>({...ex,id:uid(),sets:Array.from({length:ex.sets},(_,i)=>({setNum:i+1,reps:"",load:"",rpe:"",completed:false}))})),
      notes:""};
    setWorkouts(prev=>[...prev,w]); setActiveWorkout(w.id);
  };
  const updateWorkout = (wId,updates) => setWorkouts(prev=>prev.map(w=>w.id===wId?{...w,...updates}:w));
  const completeWorkout = wId => {
    const w = workouts.find(x=>x.id===wId);
    updateWorkout(wId,{status:"completed",completedAt:new Date().toISOString()});
    if(w?.traineeId) onDecrementSession(w.traineeId);
    setActiveWorkout(null);
  };
  // Effect (not render-time mutation) handles the "active id points to a
  // workout that just disappeared" case. Calling setState during render
  // was triggering React's no-write-during-render warning and could
  // double-fire under StrictMode.
  useEffect(() => {
    if (activeWorkout && !workouts.find(x => x.id === activeWorkout)) {
      setActiveWorkout(null);
    }
  }, [activeWorkout, workouts]);
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
  if (activeWorkout) {
    const w = workouts.find(x => x.id === activeWorkout);
    if (!w) return null;
    return <WorkoutLogger workout={w} exercises={exercises} onUpdate={u=>updateWorkout(activeWorkout,u)} onComplete={()=>completeWorkout(activeWorkout)} onBack={()=>setActiveWorkout(null)} />;
  }
  const completed = workouts.filter(w=>w.status==="completed"&&(!filterTrainee||w.traineeId===filterTrainee));
  const inProgress = workouts.filter(w=>w.status==="in-progress");
  const toggleExpanded = (tid) => setExpandedTrainees(prev => ({ ...prev, [tid]: !prev[tid] }));
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:'wrap'}}>
        <h3 style={{fontFamily:FN,fontSize:9,fontWeight:700,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',margin:0}}>
          Start Workout from Plan <span style={{color:C.td,fontWeight:400}}>({visiblePlans.length})</span>
        </h3>
        {planIndex.length > 0 && (
          <select value={filterTrainee} onChange={e=>setFilterTrainee(e.target.value)} style={{...baseInput,width:200,padding:"4px 8px",fontSize:12}}>
            <option value="">All active athletes</option>
            {trainees.filter(t=>t.status!=='Archived').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {planIndex.length===0?<div style={{color:C.td,fontSize:13,marginBottom:20}}>Create a plan first.</div>:visiblePlans.length===0?
        <div style={{color:C.td,fontSize:13,marginBottom:20,padding:'14px 0',textAlign:'center'}}>No active plans matching the filter.</div>:filterTrainee?(
        // Single-trainee view: show that trainee's plans flat, latest
        // first. The dropdown filter already narrowed the list, so
        // there's no need to group by trainee.
        <div style={{display:"grid",gap:8,marginBottom:24}}>{(plansByTrainee.get(filterTrainee)||[]).map(p=>{
          const trainee=trainees.find(t=>t.id===p.traineeId);
          const tName = trainee?.name || '';
          const heb = isHebrew(tName);
          return<Card key={p.id}><div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap',marginBottom:8}}>
            <span style={{fontWeight:600,color:C.tx,fontSize:14}}>{p.name}</span>
            {trainee&&<span style={{fontWeight:400,color:C.tm,fontSize:heb?16:13,fontFamily:heb?FH:undefined}}>— {tName}</span>}
          </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{(p.dayNames||[]).map((dName,i)=><Btn key={i} variant="ghost" onClick={()=>startWorkout(p,i)} style={{fontSize:12,padding:"4px 12px"}}>▶ {dName}</Btn>)}</div></Card>})}</div>
      ):(
        // Multi-trainee view: one card per trainee showing their
        // latest block. The "+ N OLDER BLOCKS" toggle per trainee
        // reveals the rest. Coach in a session almost always needs
        // the current block, so this keeps the list to N (trainee
        // count) instead of N * blocks-per-trainee.
        <div style={{display:"grid",gap:8,marginBottom:24}}>{Array.from(plansByTrainee.entries()).map(([tid, plans])=>{
          const trainee=trainees.find(t=>t.id===tid);
          const tName = trainee?.name || '';
          const heb = isHebrew(tName);
          const isOpen = !!expandedTrainees[tid];
          const visible = isOpen ? plans : plans.slice(0, 1);
          return <Card key={tid}>
            {visible.map((p, idx) => (
              <div key={p.id} style={{paddingTop: idx === 0 ? 0 : 10, marginTop: idx === 0 ? 0 : 10, borderTop: idx === 0 ? 'none' : `1px solid ${C.cardBd}`}}>
                <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap',marginBottom:8}}>
                  <span style={{fontWeight:600,color:C.tx,fontSize:14}}>{p.name}</span>
                  {idx === 0 && trainee && <span style={{fontWeight:400,color:C.tm,fontSize:heb?16:13,fontFamily:heb?FH:undefined}}>— {tName}</span>}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{(p.dayNames||[]).map((dName,i)=><Btn key={i} variant="ghost" onClick={()=>startWorkout(p,i)} style={{fontSize:12,padding:"4px 12px"}}>▶ {dName}</Btn>)}</div>
              </div>
            ))}
            {plans.length > 1 && (
              <button onClick={()=>toggleExpanded(tid)}
                style={{
                  marginTop: 10, width: '100%', padding: '4px 0',
                  background: 'transparent', border: `1px solid ${C.cardBd}`,
                  color: C.tm, fontFamily: FN, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em', cursor: 'pointer',
                }}>
                {isOpen ? 'HIDE OLDER BLOCKS' : `+ ${plans.length - 1} OLDER BLOCK${plans.length - 1 === 1 ? '' : 'S'}`}
              </button>
            )}
          </Card>;
        })}</div>
      )}
      {inProgress.length>0&&<><h3 style={{fontFamily:FN,fontSize:9,fontWeight:700,color:C.or,textTransform:"uppercase",letterSpacing:'0.18em',marginBottom:12}}>In Progress ({inProgress.length})</h3>
        {inProgress.map(w=>{const trainee=trainees.find(t=>t.id===w.traineeId); return<Card key={w.id} onClick={()=>setActiveWorkout(w.id)} style={{marginBottom:8,borderColor:'rgba(255,165,2,0.251)'}}>
          <div style={{fontWeight:600,color:C.tx}}>{w.dayName}</div><div style={{fontSize:12,color:C.tm}}>{trainee?.name||"—"} · {fmtPrettyDate(w.date)}</div></Card>})}</>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,marginBottom:12}}>
        <h3 style={{fontFamily:FN,fontSize:12,color:C.td,textTransform:"uppercase",margin:0}}>Completed ({completed.length})</h3>
        <select value={filterTrainee} onChange={e=>setFilterTrainee(e.target.value)} style={{...baseInput,width:180,padding:"4px 8px",fontSize:12}}>
          <option value="">All Athletes</option>{trainees.filter(t=>t.status!=='Archived').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {completed.length===0?<EmptyState icon="📊" message="No completed workouts yet." />:
        completed.slice().reverse().map(w=>{const trainee=trainees.find(t=>t.id===w.traineeId);
          return<Card key={w.id} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:600,color:C.tx}}>{w.dayName} {w.planName&&<span style={{fontWeight:400,color:C.td,fontSize:12}}>({w.planName})</span>}</div>
              <div style={{fontSize:12,color:C.tm}}>{trainee?.name||"—"} · {fmtPrettyDate(w.date)}</div></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}><Badge color={C.gn}>Completed</Badge>
              <button onClick={()=>setActiveWorkout(w.id)} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",padding:4}}>✏️</button>
              <button onClick={()=>setConfirmDelete(w.id)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,opacity:0.6}}>🗑</button></div></div></Card>})}
      <ConfirmDialog open={!!confirmDelete} title="Delete Workout?" message="Session count will not be restored."
        onConfirm={()=>{setWorkouts(prev=>prev.filter(w=>w.id!==confirmDelete));setConfirmDelete(null)}} onCancel={()=>setConfirmDelete(null)} />
    </div>);
}
