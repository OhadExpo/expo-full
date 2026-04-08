import React, { useState } from 'react';
import { C, FN, FB, uid } from './theme';
import { Btn, Input, TextArea, Badge, Card, ConfirmDialog, EmptyState, baseInput } from './ui';

function WorkoutLogger({ workout, exercises, onUpdate, onComplete, onBack }) {
  const updateSet = (ei,si,u) => { const exs=[...workout.exercises]; const sets=[...exs[ei].sets]; sets[si]={...sets[si],...u}; exs[ei]={...exs[ei],sets}; onUpdate({exercises:exs}); };
  const totalSets = workout.exercises.reduce((a,ex)=>a+ex.sets.length,0);
  const doneSets = workout.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.completed).length,0);
  const pct = totalSets>0?Math.round(doneSets/totalSets*100):0;
  const isCompleted = workout.status==="completed";
  const ar = workout.autoregulation||{};
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back</button>
        {!isCompleted&&<Btn variant="success" onClick={onComplete}>Complete Workout</Btn>}
        {isCompleted&&<Badge color={C.gn} style={{fontSize:13,padding:"6px 14px"}}>Completed</Badge>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        <Input label="Pain (0-10)" type="number" value={ar.painScore||""} onChange={e=>onUpdate({autoregulation:{...ar,painScore:e.target.value}})} placeholder="0-10" />
        <Input label="Energy (1-5)" type="number" value={ar.energyLevel||""} onChange={e=>onUpdate({autoregulation:{...ar,energyLevel:e.target.value}})} placeholder="1-5" />
        <Input label="Sleep (1-5)" type="number" value={ar.sleepQuality||""} onChange={e=>onUpdate({autoregulation:{...ar,sleepQuality:e.target.value}})} placeholder="1-5" />
      </div>
      {parseInt(ar.painScore)>=4&&<div style={{background:C.rdD,borderRadius:6,padding:8,marginBottom:12,fontSize:12,color:C.rd,fontWeight:600}}>⚠ Pain ≥4 — ROM → Tempo → Intensity → Volume</div>}
      {(parseInt(ar.energyLevel)<=2||parseInt(ar.sleepQuality)<=2)&&<div style={{background:C.orD,borderRadius:6,padding:8,marginBottom:12,fontSize:12,color:C.or,fontWeight:600}}>⚠ Low recovery — auto-regulate down</div>}
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:FN,color:C.tm,marginBottom:4}}>
          <span>{workout.dayName} {workout.planName&&<span style={{color:C.td}}>({workout.planName})</span>}</span>
          <span>{doneSets}/{totalSets} · {pct}%</span></div>
        <div style={{background:C.sf2,borderRadius:4,height:6,overflow:"hidden"}}><div style={{background:C.gn,height:"100%",width:`${pct}%`,transition:"width 0.3s",borderRadius:4}}/></div>
      </div>
      {workout.exercises.map((ex,exIdx) => {
        const exData = exercises.find(e=>e.id===ex.exerciseId);
        return(<div key={ex.id} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:14,marginBottom:10}}>
          <div style={{fontWeight:700,color:C.tx,marginBottom:8}}>{exIdx+1}. {exData?.title||"Unknown"}
            {ex.superset&&<Badge color={C.pu} style={{marginLeft:8}}>Group {ex.superset}</Badge>}
            <span style={{fontWeight:400,color:C.tm,fontSize:12,marginLeft:8}}>{ex.reps} reps · RPE {ex.rpe||"—"} · Rest {ex.rest}s</span></div>
          <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",marginBottom:4}}>
            {["SET","REPS","LOAD","RPE","DONE"].map(h=><div key={h} style={{fontSize:10,fontFamily:FN,color:C.td}}>{h}</div>)}</div>
          {ex.sets.map((set,sIdx)=>(
            <div key={sIdx} style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr 60px",gap:6,alignItems:"center",padding:"4px 0",opacity:set.completed?.5:1}}>
              <span style={{fontFamily:FN,fontSize:13,color:C.tm,textAlign:"center"}}>{set.setNum}</span>
              <input type="number" value={set.reps} onChange={e=>updateSet(exIdx,sIdx,{reps:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
              <input type="number" value={set.load} onChange={e=>updateSet(exIdx,sIdx,{load:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
              <input value={set.rpe} onChange={e=>updateSet(exIdx,sIdx,{rpe:e.target.value})} style={{...baseInput,padding:"5px 8px",fontSize:13}} placeholder="—" />
              <div style={{textAlign:"center"}}><input type="checkbox" checked={set.completed} onChange={e=>updateSet(exIdx,sIdx,{completed:e.target.checked})} style={{width:18,height:18,accentColor:C.gn,cursor:"pointer"}}/></div>
            </div>))}
        </div>);
      })}
      <TextArea label="Workout Notes" value={workout.notes||""} onChange={e=>onUpdate({notes:e.target.value})} placeholder="Session observations..." />
    </div>);
}

export default function WorkoutsView({ workouts, setWorkouts, plans, trainees, exercises, onDecrementSession }) {
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [filterTrainee, setFilterTrainee] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const startWorkout = (plan, dayIdx) => {
    const day = plan.days[dayIdx];
    const w = {id:uid(),planId:plan.id,traineeId:plan.traineeId,dayName:day.name,planName:plan.name,
      date:new Date().toISOString(),status:"in-progress",
      exercises:day.exercises.map(ex=>({...ex,id:uid(),sets:Array.from({length:ex.sets},(_,i)=>({setNum:i+1,reps:"",load:"",rpe:"",completed:false}))})),
      notes:"",autoregulation:{painScore:"",energyLevel:"",sleepQuality:""}};
    setWorkouts(prev=>[...prev,w]); setActiveWorkout(w.id);
  };
  const updateWorkout = (wId,updates) => setWorkouts(prev=>prev.map(w=>w.id===wId?{...w,...updates}:w));
  const completeWorkout = wId => {
    const w = workouts.find(x=>x.id===wId);
    updateWorkout(wId,{status:"completed",completedAt:new Date().toISOString()});
    if(w?.traineeId) onDecrementSession(w.traineeId);
    setActiveWorkout(null);
  };
  if (activeWorkout) { const w=workouts.find(x=>x.id===activeWorkout); if(!w){setActiveWorkout(null);return null;} return <WorkoutLogger workout={w} exercises={exercises} onUpdate={u=>updateWorkout(activeWorkout,u)} onComplete={()=>completeWorkout(activeWorkout)} onBack={()=>setActiveWorkout(null)} />; }
  const completed = workouts.filter(w=>w.status==="completed"&&(!filterTrainee||w.traineeId===filterTrainee));
  const inProgress = workouts.filter(w=>w.status==="in-progress");
  return (
    <div>
      <h3 style={{fontFamily:FN,fontSize:12,color:C.td,textTransform:"uppercase",marginBottom:12}}>Start Workout from Plan</h3>
      {plans.length===0?<div style={{color:C.td,fontSize:13,marginBottom:20}}>Create a plan first.</div>:(
        <div style={{display:"grid",gap:8,marginBottom:24}}>{plans.map(p=>{
          const trainee=trainees.find(t=>t.id===p.traineeId);
          return<Card key={p.id}><div style={{fontWeight:600,color:C.tx,marginBottom:8}}>{p.name} {trainee&&<span style={{fontWeight:400,color:C.tm}}>— {trainee.name}</span>}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{p.days.map((d,i)=><Btn key={d.id} variant="ghost" onClick={()=>startWorkout(p,i)} style={{fontSize:12,padding:"4px 12px"}}>▶ {d.name}</Btn>)}</div></Card>})}</div>)}
      {inProgress.length>0&&<><h3 style={{fontFamily:FN,fontSize:12,color:C.or,textTransform:"uppercase",marginBottom:12}}>In Progress ({inProgress.length})</h3>
        {inProgress.map(w=>{const trainee=trainees.find(t=>t.id===w.traineeId); return<Card key={w.id} onClick={()=>setActiveWorkout(w.id)} style={{marginBottom:8,borderColor:C.or+"40"}}>
          <div style={{fontWeight:600,color:C.tx}}>{w.dayName}</div><div style={{fontSize:12,color:C.tm}}>{trainee?.name||"—"} · {new Date(w.date).toLocaleDateString()}</div></Card>})}</>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,marginBottom:12}}>
        <h3 style={{fontFamily:FN,fontSize:12,color:C.td,textTransform:"uppercase",margin:0}}>Completed ({completed.length})</h3>
        <select value={filterTrainee} onChange={e=>setFilterTrainee(e.target.value)} style={{...baseInput,width:180,padding:"4px 8px",fontSize:12}}>
          <option value="">All Trainees</option>{trainees.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      {completed.length===0?<EmptyState icon="📊" message="No completed workouts yet." />:
        completed.slice().reverse().map(w=>{const trainee=trainees.find(t=>t.id===w.traineeId);
          return<Card key={w.id} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:600,color:C.tx}}>{w.dayName} {w.planName&&<span style={{fontWeight:400,color:C.td,fontSize:12}}>({w.planName})</span>}</div>
              <div style={{fontSize:12,color:C.tm}}>{trainee?.name||"—"} · {new Date(w.date).toLocaleDateString()}</div></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}><Badge color={C.gn}>Completed</Badge>
              <button onClick={()=>setActiveWorkout(w.id)} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",padding:4}}>✏️</button>
              <button onClick={()=>setConfirmDelete(w.id)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,opacity:0.6}}>🗑</button></div></div></Card>})}
      <ConfirmDialog open={!!confirmDelete} title="Delete Workout?" message="Session count will not be restored."
        onConfirm={()=>{setWorkouts(prev=>prev.filter(w=>w.id!==confirmDelete));setConfirmDelete(null)}} onCancel={()=>setConfirmDelete(null)} />
    </div>);
}
