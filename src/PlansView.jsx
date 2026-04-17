import React, { useState, useMemo, useCallback } from 'react';
import { C, FN, FB, uid, REQUIRED_PATTERNS, SUPERSET_LABELS, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';
import { Btn, Input, Select, Badge, Card, ConfirmDialog, EmptyState, baseInput } from './ui';
import { useFullPlan, savePlan, deletePlan, duplicatePlan } from './usePlansStore';

const defaultPlanEx = () => ({ id: uid(), exerciseId: "", sets: 3, reps: "8-12", load: "", rpe: "", tempo: "", rest: "90", notes: "", order: 0, superset: "", wk: null });
const defaultDay = (n) => ({ id: uid(), name: `Day ${n}`, exercises: [] });

const PAGE_SIZE = 25;

function PatternCoverage({ plan, exercises }) {
  const pats = useMemo(() => {
    const s = new Set();
    plan.days.forEach(d => d.exercises.forEach(pe => {
      const ex = exercises.find(e => e.id === pe.exerciseId);
      if (ex?.movementPattern) s.add(ex.movementPattern);
    }));
    return s;
  }, [plan.days, exercises]);
  const missing = REQUIRED_PATTERNS.filter(p => !pats.has(p));
  if (exercises.length === 0) return null;
  return (<div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: missing.length > 0 ? C.or : C.gn, marginBottom: 8 }}>PATTERN COVERAGE: {REQUIRED_PATTERNS.length - missing.length}/{REQUIRED_PATTERNS.length}</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{REQUIRED_PATTERNS.map(p => <Badge key={p} color={pats.has(p) ? C.gn : C.rd}>{pats.has(p) ? "✓" : "✗"} {p}</Badge>)}</div>
  </div>);
}

// Shared modal for browsing and picking an exercise.
// Props: open, onClose, onPick(exerciseId), exercises, currentId, title
function ExerciseBrowserModal({ open, onClose, onPick, exercises, currentId, title }) {
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [filters, setFilters] = useState({ category: "", resistanceType: "", bodyPosition: "", movementType: "", movementPattern: "", laterality: "" });
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters({ category: "", resistanceType: "", bodyPosition: "", movementType: "", movementPattern: "", laterality: "" });
  const clearAll = () => { setSearch(""); clearFilters(); };

  const filt = useMemo(() => {
    if (!open) return [];
    const q = search.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const match = (ex) => {
      if (filters.category && ex.category !== filters.category) return false;
      if (filters.resistanceType && ex.resistanceType !== filters.resistanceType) return false;
      if (filters.bodyPosition && ex.bodyPosition !== filters.bodyPosition) return false;
      if (filters.movementType && ex.movementType !== filters.movementType) return false;
      if (filters.movementPattern && ex.movementPattern !== filters.movementPattern) return false;
      if (filters.laterality && ex.laterality !== filters.laterality) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        ex.title, ex.category, ex.resistanceType, ex.bodyPosition, ex.movementType,
        ex.movementPattern, ex.laterality, ex.primaryMuscles, ex.secondaryMuscles,
        ex.primaryJoints, ex.jointMovements
      ].filter(Boolean).join(' ').toLowerCase();
      return tokens.every(t => haystack.includes(t));
    };
    return exercises.filter(match).slice(0, 200);
  }, [exercises, search, filters, open]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setSearch("");
      clearFilters();
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  React.useEffect(() => { setActiveIdx(0); }, [search, filters]);

  // Scroll active row into view
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const pick = (ex) => { onPick(ex.id); onClose(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filt.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filt[activeIdx]) pick(filt[activeIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const subtitle = (ex) => [ex.resistanceType, ex.bodyPosition, ex.movementType].filter(Boolean).join(' · ');
  const muscles = (ex) => [ex.primaryMuscles, ex.secondaryMuscles].filter(Boolean).join(' / ');
  const filterSelectStyle = { ...baseInput, padding: '7px 10px', fontSize: 12 };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, width: 'min(900px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 12px' }}>
          <h3 style={{ margin: 0, fontFamily: FN, fontSize: 16, color: C.tx, fontWeight: 700 }}>{title || 'Select Exercise'}</h3>
          <button onClick={onClose} style={{ background: C.sf2, border: `1px solid ${C.bd}`, color: C.tm, cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '0 22px' }}>
          <input
            ref={inputRef}
            placeholder="Search by title, muscle, pattern, position..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={onKeyDown}
            style={{ ...baseInput, padding: '10px 14px', fontSize: 14 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginTop: 10 }}>
            <select value={filters.category} onChange={e => setF('category', e.target.value)} style={filterSelectStyle}><option value="">Any Category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.resistanceType} onChange={e => setF('resistanceType', e.target.value)} style={filterSelectStyle}><option value="">Any Resistance</option>{RESISTANCE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.bodyPosition} onChange={e => setF('bodyPosition', e.target.value)} style={filterSelectStyle}><option value="">Any Body Position</option>{BODY_POSITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.movementType} onChange={e => setF('movementType', e.target.value)} style={filterSelectStyle}><option value="">Any Movement Type</option>{MOVEMENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.movementPattern} onChange={e => setF('movementPattern', e.target.value)} style={filterSelectStyle}><option value="">Any Pattern</option>{MOVEMENT_PATTERNS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.laterality} onChange={e => setF('laterality', e.target.value)} style={filterSelectStyle}><option value="">Any Laterality</option>{LATERALITY.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11, fontFamily: FN, color: C.td }}>
            <span>{filt.length}{(search.trim() || activeFilterCount > 0) && exercises.length > filt.length ? ` of ${exercises.length}` : ''} result{filt.length === 1 ? '' : 's'} · ↑↓ navigate · Enter select · Esc close</span>
            {(search.trim() || activeFilterCount > 0) && <button onClick={clearAll} style={{ background: 'none', border: 'none', color: C.ac, cursor: 'pointer', fontSize: 11, fontFamily: FN, textDecoration: 'underline' }}>Clear all</button>}
          </div>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 22px 22px', marginTop: 10 }}>
          {filt.length === 0 ? (
            <div style={{ padding: 40, fontSize: 13, color: C.td, textAlign: 'center' }}>No exercises found. Try relaxing filters or the search term.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {filt.map((ex, idx) => {
                const isActive = idx === activeIdx;
                const isSelected = ex.id === currentId;
                return (
                  <button
                    key={ex.id}
                    data-idx={idx}
                    onClick={() => pick(ex)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    style={{
                      textAlign: 'left', padding: '10px 12px',
                      background: isActive ? C.sf2 : (isSelected ? C.acD : C.sf),
                      border: `1px solid ${isActive ? C.ac + '60' : (isSelected ? C.ac + '80' : C.bd)}`,
                      borderRadius: 8, cursor: 'pointer', fontFamily: FB, color: C.tx,
                      transition: 'all 0.1s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ex.title}</div>
                      {ex.movementPattern && <span style={{ fontSize: 9, fontFamily: FN, fontWeight: 700, color: C.gn, whiteSpace: 'nowrap' }}>{ex.movementPattern}</span>}
                    </div>
                    {subtitle(ex) && <div style={{ fontSize: 10, color: C.tm, fontFamily: FN, marginBottom: 2 }}>{subtitle(ex)}</div>}
                    {muscles(ex) && <div style={{ fontSize: 10, color: C.td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{muscles(ex)}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Small button shown inline in an exercise row. Clicking it opens the browser modal.
function ExPicker({ exercises, value, onChange, label }) {
  const [modalOpen, setModalOpen] = useState(false);
  const sel = exercises.find(e => e.id === value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', fontFamily: FN }}>{label}</label>}
      <button onClick={() => setModalOpen(true)} style={{ ...baseInput, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: sel ? C.tx : C.td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel ? sel.title : 'Select exercise...'}</span>
        <span style={{ color: C.td, fontSize: 10 }}>▼</span>
      </button>
      <ExerciseBrowserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPick={id => { onChange(id); setModalOpen(false); }}
        exercises={exercises}
        currentId={value}
        title={sel ? `Change Exercise (currently: ${sel.title})` : 'Select Exercise'}
      />
    </div>
  );
}

function PlanEditor({ plan: init, onSave, onCancel, trainees, exercises, weeklyFocus, setWeeklyFocus }) {
  const [plan, setPlan] = useState(init);
  const [activeDay, setActiveDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const updateDay = (i, u) => setPlan(p => ({...p, days: p.days.map((d,idx) => idx===i ? {...d,...u} : d)}));
  const addDay = () => { setPlan(p => ({...p, days: [...p.days, defaultDay(p.days.length+1)]})); setActiveDay(plan.days.length); };
  const removeDay = i => { if (plan.days.length<=1) return; setPlan(p => ({...p, days: p.days.filter((_,idx)=>idx!==i)})); if (activeDay>=plan.days.length-1) setActiveDay(Math.max(0,plan.days.length-2)); };
  const addExWithId = (exerciseId) => {
    const ex = defaultPlanEx();
    ex.order = plan.days[activeDay]?.exercises.length || 0;
    ex.exerciseId = exerciseId;
    updateDay(activeDay, { exercises: [...(plan.days[activeDay]?.exercises || []), ex] });
  };
  const updateEx = (ei,u) => { const exs=[...plan.days[activeDay].exercises]; exs[ei]={...exs[ei],...u}; updateDay(activeDay,{exercises:exs}); };
  const removeEx = ei => updateDay(activeDay, {exercises:plan.days[activeDay].exercises.filter((_,i)=>i!==ei)});
  const moveEx = (ei,dir) => { const exs=[...plan.days[activeDay].exercises]; const si=ei+dir; if(si<0||si>=exs.length) return; [exs[ei],exs[si]]=[exs[si],exs[ei]]; updateDay(activeDay,{exercises:exs}); };
  const day = plan.days[activeDay];
  const handleSave = async () => { setSaving(true); await onSave(plan); setSaving(false); };
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onCancel} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back</button>
        <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Program'}</Btn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12,marginBottom:20}}>
        <Input label="Program Name" value={plan.name} onChange={e => setPlan({...plan,name:e.target.value})} placeholder="Hypertrophy Block A" />
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
        <div style={{textAlign:"center",padding:30,color:C.td}}><p style={{fontSize:13}}>No exercises.</p><Btn onClick={()=>setAddExerciseOpen(true)} style={{marginTop:8}}>+ Add Exercise</Btn></div>
      :<div>
        {day?.exercises.map((ex,exIdx) => {
          const exData = exercises.find(e=>e.id===ex.exerciseId);
          const exTitle = exData ? exData.title : (ex.notes?.match(/^\[(.+)\]$/)?.[1] || '');
          const sc = ex.superset==="A"?C.ac:ex.superset==="B"?C.pu:ex.superset==="C"?C.or:"transparent";
          return(<div key={ex.id} style={{background:C.sf,border:`1px solid ${ex.superset?sc+"60":C.bd}`,borderLeft:ex.superset?`3px solid ${sc}`:`1px solid ${C.bd}`,borderRadius:8,padding:12,marginBottom:8}}>
            <div style={{display:"grid",gridTemplateColumns:"40px 1fr",gap:12,alignItems:"start"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,paddingTop:4}}>
                <span style={{fontFamily:FN,fontSize:12,color:C.td,fontWeight:700}}>{exIdx+1}</span>
                <button onClick={()=>moveEx(exIdx,-1)} disabled={exIdx===0} style={{background:"none",border:"none",color:C.td,cursor:"pointer",fontSize:10,opacity:exIdx===0?.3:1}}>▲</button>
                <button onClick={()=>moveEx(exIdx,1)} disabled={exIdx===day.exercises.length-1} style={{background:"none",border:"none",color:C.td,cursor:"pointer",fontSize:10,opacity:exIdx===day.exercises.length-1?.3:1}}>▼</button>
              </div>
              <div style={{overflowX:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 60px 1fr 1fr 1fr 1fr 1fr auto",minWidth:700,gap:8,alignItems:"end"}}>
                  <ExPicker exercises={exercises} value={ex.exerciseId} onChange={id=>updateEx(exIdx,{exerciseId:id})} label="Exercise" />
                  <Select label="Group" options={SUPERSET_LABELS.map(s=>({value:s,label:s||"—"}))} value={ex.superset||""} onChange={v=>updateEx(exIdx,{superset:v})} />
                  <Input label="Sets" type="number" value={ex.sets} onChange={e=>updateEx(exIdx,{sets:parseInt(e.target.value)||0})} />
                  <Input label="Reps" value={ex.reps} onChange={e=>updateEx(exIdx,{reps:e.target.value})} placeholder="8-12" />
                  <Input label="Load" value={ex.load} onChange={e=>updateEx(exIdx,{load:e.target.value})} placeholder="kg/%" />
                  <Input label="RPE" value={ex.rpe} onChange={e=>updateEx(exIdx,{rpe:e.target.value})} placeholder="7-8" />
                  <Input label="Tempo" value={ex.tempo} onChange={e=>updateEx(exIdx,{tempo:e.target.value})} placeholder="3010" />
                  <button onClick={()=>removeEx(exIdx)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,marginBottom:4,opacity:0.6}}>🗑</button>
                </div>
                {exData?<div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  {exData.movementPattern&&<Badge color={C.gn}>{exData.movementPattern}</Badge>}
                  {exData.laterality&&<Badge color={C.tm}>{exData.laterality}</Badge>}
                  {exData.primaryMuscles&&<span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
                </div>:exTitle?<div style={{fontSize:11,color:C.or,marginTop:4}}>📝 {exTitle}</div>:null}
                <Input value={ex.notes} onChange={e=>updateEx(exIdx,{notes:e.target.value})} placeholder="Notes, modifications..." style={{marginTop:6}} />
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
        <Btn variant="ghost" onClick={()=>setAddExerciseOpen(true)} style={{width:"100%",justifyContent:"center",marginTop:8}}>+ Add Exercise</Btn>
      </div>}
      <ExerciseBrowserModal
        open={addExerciseOpen}
        onClose={()=>setAddExerciseOpen(false)}
        onPick={id=>{ addExWithId(id); setAddExerciseOpen(false); }}
        exercises={exercises}
        title="Add Exercise to Day"
      />
    </div>);
}

export default function PlansView({ planIndex, reloadIndex, trainees, exercises, weeklyFocus, setWeeklyFocus, openPlanId, onPlanOpened }) {
  const { plan: editPlanData, loading: editLoading, load: loadFullPlan, clear: clearPlan, setPlan: setEditPlan } = useFullPlan();
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterTrainee, setFilterTrainee] = useState("");

  // Auto-open plan if requested from TraineeDetail
  React.useEffect(() => {
    if (openPlanId && !editMode) {
      loadFullPlan(openPlanId).then(() => { setEditMode(true); if (onPlanOpened) onPlanOpened(); });
    }
  }, [openPlanId]);

  const traineeMap = useMemo(() => { const m = {}; trainees.forEach(t => { m[t.id] = t.name; }); return m; }, [trainees]);

  const filtered = useMemo(() => {
    let result = planIndex;
    if (search) { const q = search.toLowerCase(); result = result.filter(p => p.name.toLowerCase().includes(q) || (traineeMap[p.traineeId]||'').toLowerCase().includes(q)); }
    if (filterTrainee) result = result.filter(p => p.traineeId === filterTrainee);
    return result;
  }, [planIndex, search, filterTrainee, traineeMap]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const handleOpenPlan = async (planId) => { await loadFullPlan(planId); setEditMode(true); };
  const handleNewPlan = () => {
    setEditPlan({ id: 'pl_' + uid(), name: "", traineeId: "", phase: "", notes: "", active: true, createdAt: new Date().toISOString(), days: [defaultDay(1)], warmup: [] });
    setEditMode(true);
  };
  const handleSave = async (plan) => { await savePlan(plan); setEditMode(false); clearPlan(); await reloadIndex(); };
  const handleCancel = () => { setEditMode(false); clearPlan(); };
  const handleDuplicate = async (planId) => {
    const { supabase: sb } = await import('./supabase');
    const { data } = await sb.from('plans').select('*').eq('id', planId).single();
    if (data) { await duplicatePlan({ id: data.id, name: data.name, traineeId: data.trainee_id, phase: data.phase, notes: data.notes, active: data.active, createdAt: data.created_at, days: data.data?.days||[], warmup: data.data?.warmup||[] }); await reloadIndex(); }
  };
  const handleDelete = async (planId) => { await deletePlan(planId); setConfirmDelete(null); await reloadIndex(); };

  const traineeOptions = useMemo(() => {
    const ids = [...new Set(planIndex.map(p => p.traineeId).filter(Boolean))];
    return ids.map(id => ({ value: id, label: traineeMap[id] || id })).sort((a,b) => a.label.localeCompare(b.label));
  }, [planIndex, traineeMap]);

  if (editMode) {
    if (editLoading || !editPlanData) return <div style={{textAlign:"center",padding:60,color:C.td}}><div style={{fontSize:14}}>Loading program...</div></div>;
    return <PlanEditor plan={editPlanData} onSave={handleSave} onCancel={handleCancel} trainees={trainees} exercises={exercises} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} />;
  }

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:20,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180}}><input placeholder="Search programs..." value={search} onChange={e=>{setSearch(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,paddingLeft:12}} /></div>
        <select value={filterTrainee} onChange={e=>{setFilterTrainee(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,width:180}}>
          <option value="">All Clients ({planIndex.length})</option>
          {traineeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Btn onClick={handleNewPlan}>+ New Program</Btn>
      </div>
      <div style={{fontSize:12,color:C.td,marginBottom:12,fontFamily:FN}}>
        Showing {visible.length} of {filtered.length} programs{filtered.length !== planIndex.length ? ` (${planIndex.length} total)` : ''}
      </div>
      {filtered.length===0?<EmptyState icon="📋" message="No programs match your search." />:(
        <div style={{display:"grid",gap:10}}>{visible.map(p => {
          const tName = traineeMap[p.traineeId] || "Unassigned";
          return <Card key={p.id} onClick={()=>handleOpenPlan(p.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{fontWeight:700,fontSize:15,color:C.tx}}>{p.name||"Untitled"}</div>
                <div style={{fontSize:12,color:C.tm,marginTop:4}}>{tName} · {p.dayCount} days · {p.exerciseCount} exercises</div>
                {p.phase&&<Badge color={C.ac} style={{marginTop:6}}>{p.phase}</Badge>}</div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={e=>{e.stopPropagation();handleDuplicate(p.id)}} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",padding:4}}>📋</button>
                <button onClick={e=>{e.stopPropagation();setConfirmDelete(p.id)}} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,opacity:0.6}}>🗑</button>
              </div></div></Card>})}
          {hasMore && <Btn variant="ghost" onClick={()=>setVisibleCount(c=>c+PAGE_SIZE)} style={{width:"100%",justifyContent:"center",marginTop:8}}>Load more ({filtered.length - visibleCount} remaining)</Btn>}
        </div>)}
      <ConfirmDialog open={!!confirmDelete} title="Delete Program?" message="Existing workouts will remain." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)} />
    </div>);
}
