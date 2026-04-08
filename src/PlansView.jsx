import React, { useState } from 'react';
import { C, FN, FB, uid, REQUIRED_PATTERNS, SUPERSET_LABELS, CATEGORIES } from './theme';
import { Btn, Input, Select, Badge, Card, ConfirmDialog, EmptyState, baseInput } from './ui';
const defaultPlanEx = () => ({ id: uid(), exerciseId: "", sets: 3, reps: "8-12", load: "", rpe: "", tempo: "", rest: "90", notes: "", order: 0, superset: "" });
const defaultDay = (n) => ({ id: uid(), name: `Day ${n}`, exercises: [] });
const defaultPlan = () => ({ id: uid(), name: "", traineeId: "", days: [defaultDay(1)], phase: "", notes: "", createdAt: new Date().toISOString() });

function PatternCoverage({ plan, exercises }) {
  const pats = new Set();
  plan.days.forEach(d => d.exercises.forEach(pe => { const ex = exercises.find(e => e.id === pe.exerciseId); if (ex?.movementPattern) pats.add(ex.movementPattern); }));
  const missing = REQUIRED_PATTERNS.filter(p => !pats.has(p));
  if (exercises.length === 0) return null;
  return (<div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: missing.length > 0 ? C.or : C.gn, marginBottom: 8 }}>PATTERN COVERAGE: {REQUIRED_PATTERNS.length - missing.length}/{REQUIRED_PATTERNS.length}</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{REQUIRED_PATTERNS.map(p => <Badge key={p} color={pats.has(p) ? C.gn : C.rd}>{pats.has(p) ? "✓" : "✗"} {p}</Badge>)}</div>
  </div>);
}

function ExPicker({ exercises, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sel = exercises.find(e => e.id === value);
  const filt = exercises.filter(e => !search || e.title.toLowerCase().includes(search.toLowerCase()));
  return (<div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: "uppercase", fontFamily: FN }}>{label}</label>}
    <button onClick={() => setOpen(!open)} style={{ ...baseInput, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: sel ? C.tx : C.td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ? sel.title : "Select..."}</span><span style={{color:C.td}}>▼</span></button>
    {open && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 6, marginTop: 2, maxHeight: 250, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 6, borderBottom: `1px solid ${C.bd}` }}><input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} autoFocus style={{ ...baseInput, padding: "5px 8px", fontSize: 12 }} /></div>
      <div style={{ overflowY: "auto", maxHeight: 200 }}>
        {filt.length === 0 ? <div style={{padding:12,fontSize:12,color:C.td,textAlign:"center"}}>No exercises found</div> :
          filt.map(ex => <button key={ex.id} onClick={() => {onChange(ex.id);setOpen(false);setSearch("")}} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",background:ex.id===value?C.acD:"transparent",color:C.tx,cursor:"pointer",fontSize:12,fontFamily:FB,borderBottom:`1px solid ${C.bd}`}}>
            <div style={{fontWeight:600}}>{ex.title}</div><div style={{fontSize:10,color:C.td}}>{[ex.category,ex.movementPattern].filter(Boolean).join(" · ")}</div></button>)}
      </div></div>}
  </div>);
}

function PlanEditor({ plan: init, onSave, onCancel, trainees, exercises, weeklyFocus, setWeeklyFocus }) {
  const [plan, setPlan] = useState(init);
  const [activeDay, setActiveDay] = useState(0);
  const updateDay = (i, u) => setPlan(p => ({...p, days: p.days.map((d,idx) => idx===i ? {...d,...u} : d)}));
  const addDay = () => { setPlan(p => ({...p, days: [...p.days, defaultDay(p.days.length+1)]})); setActiveDay(plan.days.length); };
  const removeDay = i => { if (plan.days.length<=1) return; setPlan(p => ({...p, days: p.days.filter((_,idx)=>idx!==i)})); if (activeDay>=plan.days.length-1) setActiveDay(Math.max(0,plan.days.length-2)); };
  const addEx = () => { const ex = defaultPlanEx(); ex.order = plan.days[activeDay]?.exercises.length||0; updateDay(activeDay, {exercises:[...(plan.days[activeDay]?.exercises||[]),ex]}); };
  const updateEx = (ei,u) => { const exs=[...plan.days[activeDay].exercises]; exs[ei]={...exs[ei],...u}; updateDay(activeDay,{exercises:exs}); };
  const removeEx = ei => updateDay(activeDay, {exercises:plan.days[activeDay].exercises.filter((_,i)=>i!==ei)});
  const moveEx = (ei,dir) => { const exs=[...plan.days[activeDay].exercises]; const si=ei+dir; if(si<0||si>=exs.length) return; [exs[ei],exs[si]]=[exs[si],exs[ei]]; updateDay(activeDay,{exercises:exs}); };
  const day = plan.days[activeDay];
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onCancel} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back</button>
        <Btn onClick={() => onSave(plan)}>Save Plan</Btn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
        <Input label="Plan Name" value={plan.name} onChange={e => setPlan({...plan,name:e.target.value})} placeholder="Hypertrophy Block A" />
        <Select label="Assign to Trainee" options={[{value:"",label:"Unassigned"},...trainees.map(t=>({value:t.id,label:t.name}))]} value={plan.traineeId} onChange={v => setPlan({...plan,traineeId:v})} />
        <Input label="Phase / Block" value={plan.phase||""} onChange={e => setPlan({...plan,phase:e.target.value})} placeholder="Accumulation..." />
      </div>
      <PatternCoverage plan={plan} exercises={exercises} />
      <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {plan.days.map((d,i) => <div key={d.id} style={{display:"flex"}}>
          <button onClick={()=>setActiveDay(i)} style={{padding:"6px 14px",fontSize:12,borderRadius:"6px 0 0 6px",border:"none",background:i===activeDay?C.ac:C.sf2,color:i===activeDay?"#fff":C.tm,cursor:"pointer",fontFamily:FB,fontWeight:600}}>{d.name} ({d.exercises.length})</button>
          {plan.days.length>1&&<button onClick={()=>removeDay(i)} style={{padding:"6px 6px",fontSize:10,borderRadius:"0 6px 6px 0",border:"none",borderLeft:`1px solid ${C.bd}`,background:i===activeDay?C.ac:C.sf2,color:i===activeDay?"#fff":C.td,cursor:"pointer",opacity:0.7}}>×</button>}
        </div>)}
        <Btn variant="ghost" onClick={addDay} style={{padding:"6px 12px",fontSize:12}}>+</Btn>
      </div>
      {day&&<div style={{marginBottom:12}}><Input label={`Day ${activeDay+1} Name`} value={day.name} onChange={e=>updateDay(activeDay,{name:e.target.value})} /></div>}
      {day&&day.exercises.length===0?
        <div style={{textAlign:"center",padding:30,color:C.td}}><p style={{fontSize:13}}>No exercises.</p><Btn onClick={addEx} style={{marginTop:8}}>+ Add Exercise</Btn></div>
      :<div>
        {day?.exercises.map((ex,exIdx) => {
          const exData = exercises.find(e=>e.id===ex.exerciseId);
          const sc = ex.superset==="A"?C.ac:ex.superset==="B"?C.pu:ex.superset==="C"?C.or:"transparent";
          return(<div key={ex.id} style={{background:C.sf,border:`1px solid ${ex.superset?sc+"60":C.bd}`,borderLeft:ex.superset?`3px solid ${sc}`:`1px solid ${C.bd}`,borderRadius:8,padding:12,marginBottom:8}}>
            <div style={{display:"grid",gridTemplateColumns:"40px 1fr",gap:12,alignItems:"start"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,paddingTop:4}}>
                <span style={{fontFamily:FN,fontSize:12,color:C.td,fontWeight:700}}>{exIdx+1}</span>
                <button onClick={()=>moveEx(exIdx,-1)} disabled={exIdx===0} style={{background:"none",border:"none",color:C.td,cursor:"pointer",fontSize:10,opacity:exIdx===0?.3:1}}>▲</button>
                <button onClick={()=>moveEx(exIdx,1)} disabled={exIdx===day.exercises.length-1} style={{background:"none",border:"none",color:C.td,cursor:"pointer",fontSize:10,opacity:exIdx===day.exercises.length-1?.3:1}}>▼</button>
              </div>
              <div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 60px 1fr 1fr 1fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
                  <ExPicker exercises={exercises} value={ex.exerciseId} onChange={id=>updateEx(exIdx,{exerciseId:id})} label="Exercise" />
                  <Select label="Group" options={SUPERSET_LABELS.map(s=>({value:s,label:s||"—"}))} value={ex.superset||""} onChange={v=>updateEx(exIdx,{superset:v})} />
                  <Input label="Sets" type="number" value={ex.sets} onChange={e=>updateEx(exIdx,{sets:parseInt(e.target.value)||0})} />
                  <Input label="Reps" value={ex.reps} onChange={e=>updateEx(exIdx,{reps:e.target.value})} placeholder="8-12" />
                  <Input label="Load" value={ex.load} onChange={e=>updateEx(exIdx,{load:e.target.value})} placeholder="kg/%" />
                  <Input label="RPE" value={ex.rpe} onChange={e=>updateEx(exIdx,{rpe:e.target.value})} placeholder="7-8" />
                  <Input label="Tempo" value={ex.tempo} onChange={e=>updateEx(exIdx,{tempo:e.target.value})} placeholder="3010" />
                  <button onClick={()=>removeEx(exIdx)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,marginBottom:4,opacity:0.6}}>🗑</button>
                </div>
                {exData&&<div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  {exData.movementPattern&&<Badge color={C.gn}>{exData.movementPattern}</Badge>}
                  {exData.laterality&&<Badge color={C.tm}>{exData.laterality}</Badge>}
                  {exData.primaryMuscles&&<span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
                </div>}
                <Input value={ex.notes} onChange={e=>updateEx(exIdx,{notes:e.target.value})} placeholder="Notes, modifications..." style={{marginTop:6}} />
                {/* Weekly Focus — W1-W4 inline */}
                {plan.name && day && (
                  <div style={{marginTop:6,background:C.acD,borderRadius:6,padding:"8px 10px",border:`1px solid ${C.ac}20`}}>
                    <div style={{fontSize:9,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:4}}>WEEKLY FOCUS</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
                      {[1,2,3,4].map(w => {
                        const fk = `${plan.name}|${day.name}|${ex.exerciseId}|W${w}`;
                        return <input key={w} value={weeklyFocus?.[fk]||""} onChange={e=>{const v=e.target.value;setWeeklyFocus(prev=>({...prev,[fk]:v}))}}
                          placeholder={`W${w}`} style={{background:C.sf2,border:`1px solid ${weeklyFocus?.[fk]?C.ac+"40":C.bd}`,borderRadius:4,padding:"4px 6px",color:C.tx,fontFamily:FB,fontSize:11,outline:"none",boxSizing:"border-box"}} />;
                      })}
                    </div>
                  </div>
                )}
              </div></div></div>);
        })}
        <Btn variant="ghost" onClick={addEx} style={{width:"100%",justifyContent:"center",marginTop:8}}>+ Add Exercise</Btn>
      </div>}
    </div>);
}

export default function PlansView({ plans, setPlans, trainees, exercises, weeklyFocus, setWeeklyFocus }) {
  const [editPlan, setEditPlan] = useState(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const filtered = plans.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const handleSave = plan => { setPlans(prev => { const idx=prev.findIndex(p=>p.id===plan.id); return idx>=0?prev.map(p=>p.id===plan.id?plan:p):[...prev,plan]; }); setEditPlan(null); };
  const handleDup = plan => { const dup={...plan,id:uid(),name:plan.name+" (copy)",days:plan.days.map(d=>({...d,id:uid(),exercises:d.exercises.map(e=>({...e,id:uid()}))}))}; setPlans(prev=>[...prev,dup]); };
  if (editPlan) return <PlanEditor plan={editPlan} onSave={handleSave} onCancel={()=>setEditPlan(null)} trainees={trainees} exercises={exercises} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} />;
  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:20,alignItems:"center"}}>
        <div style={{flex:1}}><input placeholder="Search plans..." value={search} onChange={e=>setSearch(e.target.value)} style={{...baseInput,paddingLeft:12}} /></div>
        <Btn onClick={()=>setEditPlan(defaultPlan())}>+ New Plan</Btn>
      </div>
      {filtered.length===0?<EmptyState icon="📋" message="No plans yet." />:(
        <div style={{display:"grid",gap:12}}>{filtered.map(p => {
          const trainee=trainees.find(t=>t.id===p.traineeId);
          return<Card key={p.id} onClick={()=>setEditPlan({...p})}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{fontWeight:700,fontSize:15,color:C.tx}}>{p.name||"Untitled"}</div>
                <div style={{fontSize:12,color:C.tm,marginTop:4}}>{trainee?trainee.name:"Unassigned"} · {p.days.length} days · {p.days.reduce((a,d)=>a+d.exercises.length,0)} exercises</div>
                {p.phase&&<Badge color={C.ac} style={{marginTop:6}}>{p.phase}</Badge>}</div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={e=>{e.stopPropagation();handleDup(p)}} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",padding:4}}>📋</button>
                <button onClick={e=>{e.stopPropagation();setConfirmDelete(p.id)}} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,opacity:0.6}}>🗑</button>
              </div></div></Card>})}</div>)}
      <ConfirmDialog open={!!confirmDelete} title="Delete Plan?" message="Existing workouts will remain."
        onConfirm={()=>{setPlans(prev=>prev.filter(x=>x.id!==confirmDelete));setConfirmDelete(null)}} onCancel={()=>setConfirmDelete(null)} />
    </div>);
}
