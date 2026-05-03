import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { C, FN, FB, uid, REQUIRED_PATTERNS, SUPERSET_LABELS, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';
import { Btn, Input, Select, Badge, Card, ConfirmDialog, EmptyState, baseInput } from './ui';
import { useFullPlan, savePlan, deletePlan, duplicatePlan } from './usePlansStore';
import useAutosave, { autosaveStatusLabel } from './hooks/useAutosave';

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
  return (<div style={{ background: C.sf, border:`0.25px solid ${C.ac}4D`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
    <div style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: C.or, marginBottom: 8, letterSpacing:'0.06em' }}>PATTERN COVERAGE: {REQUIRED_PATTERNS.length - missing.length}/{REQUIRED_PATTERNS.length}</div>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{REQUIRED_PATTERNS.map(p => <Badge key={p} color={pats.has(p) ? C.gn : C.tm} style={pats.has(p) ? {} : {fontWeight:500,opacity:0.65}}>{pats.has(p) ? "✓" : "✗"} {p}</Badge>)}</div>
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
      <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border:`0.25px solid ${C.ac}4D`, borderRadius: 14, width: 'min(900px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 10 }}>
            <select value={filters.category} onChange={e => setF('category', e.target.value)} style={filterSelectStyle}><option value="">Category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.resistanceType} onChange={e => setF('resistanceType', e.target.value)} style={filterSelectStyle}><option value="">Resistance</option>{RESISTANCE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.bodyPosition} onChange={e => setF('bodyPosition', e.target.value)} style={filterSelectStyle}><option value="">Body Position</option>{BODY_POSITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.movementType} onChange={e => setF('movementType', e.target.value)} style={filterSelectStyle}><option value="">Movement Type</option>{MOVEMENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.movementPattern} onChange={e => setF('movementPattern', e.target.value)} style={filterSelectStyle}><option value="">Pattern</option>{MOVEMENT_PATTERNS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filters.laterality} onChange={e => setF('laterality', e.target.value)} style={filterSelectStyle}><option value="">Laterality</option>{LATERALITY.map(c => <option key={c} value={c}>{c}</option>)}</select>
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
function ExPicker({ exercises, value, onChange, label, fallbackTitle }) {
  const [modalOpen, setModalOpen] = useState(false);
  const sel = exercises.find(e => e.id === value);
  const displayTitle = sel?.title || fallbackTitle || '';
  const hasDisplay = !!displayTitle;
  const unlinked = !sel && !!fallbackTitle;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', fontFamily: FN }}>{label}</label>}
      <button onClick={() => setModalOpen(true)} style={{ ...baseInput, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: unlinked ? C.or + '60' : undefined }}>
        <span style={{ color: hasDisplay ? C.tx : C.td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {unlinked && <span style={{ color: C.or, marginRight: 6, fontSize: 10 }}>📝</span>}
          {hasDisplay ? displayTitle : 'Select exercise...'}
        </span>
        <span style={{ color: C.td, fontSize: 10 }}>▼</span>
      </button>
      <ExerciseBrowserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPick={id => { onChange(id); setModalOpen(false); }}
        exercises={exercises}
        currentId={value}
        title={sel ? `Change Exercise (currently: ${sel.title})` : (fallbackTitle ? `Link "${fallbackTitle}" to library` : 'Select Exercise')}
      />
    </div>
  );
}

function WarmupEditor({ plan, setPlan }) {
  const warmup = Array.isArray(plan.warmup) ? plan.warmup : [];
  const update = (idx, patch) => setPlan(p => ({ ...p, warmup: (p.warmup || []).map((w, i) => i === idx ? { ...w, ...patch } : w) }));
  const add = () => setPlan(p => ({ ...p, warmup: [...(p.warmup || []), { t: '', rx: '', vid: '' }] }));
  const remove = idx => setPlan(p => ({ ...p, warmup: (p.warmup || []).filter((_, i) => i !== idx) }));
  return (
    <div style={{ background: C.sf, border:`0.25px solid ${C.ac}4D`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: warmup.length ? 10 : 0 }}>
        <div style={{ fontSize: 12, fontFamily: FN, fontWeight: 700, color: C.or }}>WARM-UP ({warmup.length})</div>
        <Btn variant="ghost" onClick={add} style={{ padding: '4px 10px', fontSize: 11 }}>+ Add Warm-Up</Btn>
      </div>
      {warmup.map((w, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 30px', gap: 8, marginBottom: 6, alignItems: 'end' }}>
          <Input label={i === 0 ? 'Exercise' : ''} value={w.t || ''} onChange={e => update(i, { t: e.target.value })} placeholder="e.g. BW Step-Down" />
          <Input label={i === 0 ? 'Rx' : ''} value={w.rx || ''} onChange={e => update(i, { rx: e.target.value })} placeholder="1x10 E" />
          <Input label={i === 0 ? 'Video URL' : ''} value={w.vid || ''} onChange={e => update(i, { vid: e.target.value })} placeholder="https://youtube.com/..." />
          <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.rd, cursor: 'pointer', padding: 4, marginBottom: 4, opacity: 0.6, fontSize: 16 }}>🗑</button>
        </div>
      ))}
      {warmup.length === 0 && <div style={{ fontSize: 11, color: C.td, marginTop: 8 }}>No warm-ups. Click "+ Add Warm-Up" to add one.</div>}
    </div>
  );
}

function PlanEditor({ plan: init, onSave, onCancel, trainees, exercises, weeklyFocus, setWeeklyFocus }) {
  const [plan, setPlan] = useState(init);
  const [activeDay, setActiveDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  // Autosave: shared hook serializes saves, flushes on tab switch / screen
  // lock / browser back / refresh / close / unmount.
  const { status: autoStatus, flush: flushAutosave, markClean } = useAutosave(plan, savePlan);

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
  // Per-day variants — used by the overview table so a row in any day can be
  // edited without first switching `activeDay` (and without leaving overview).
  const updateExInDay = (di, ei, u) => setPlan(p => ({...p, days: p.days.map((d, idx) => {
    if (idx !== di) return d;
    const exs = [...(d.exercises || [])];
    exs[ei] = {...exs[ei], ...u};
    return {...d, exercises: exs};
  })}));
  const removeExFromDay = (di, ei) => setPlan(p => ({...p, days: p.days.map((d, idx) => idx === di ? {...d, exercises: (d.exercises||[]).filter((_,i) => i !== ei)} : d)}));
  const removeEx = ei => updateDay(activeDay, {exercises:plan.days[activeDay].exercises.filter((_,i)=>i!==ei)});
  const moveEx = (ei,dir) => { const exs=[...plan.days[activeDay].exercises]; const si=ei+dir; if(si<0||si>=exs.length) return; [exs[ei],exs[si]]=[exs[si],exs[ei]]; updateDay(activeDay,{exercises:exs}); };
  const day = plan.days[activeDay];
  const handleSave = async () => {
    setSaving(true);
    await onSave(plan);
    // Explicit save covered everything pending — clear dirty so the
    // visibilitychange/unmount paths don't issue a redundant write.
    markClean();
    setSaving(false);
  };
  const handleBack = async () => {
    // Awaiting flushAutosave resolves only after every queued + in-flight
    // save lands, so the latest data is on disk before the editor unmounts.
    await flushAutosave();
    onCancel();
  };
  const statusLabel = autosaveStatusLabel(autoStatus, C);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={handleBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back</button>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {statusLabel && <span aria-live="polite" style={{fontFamily:FN,fontSize:11,fontWeight:600,color:statusLabel.color,letterSpacing:"0.04em"}}>{statusLabel.text}</span>}
          <button onClick={()=>setOverview(v=>!v)} style={{background:overview?C.ac:C.sf2,border:`${overview?'2px':'0.25px'} solid ${overview?C.ac:`${C.ac}4D`}`,borderRadius:6,padding:"6px 12px",color:overview?"#fff":C.tm,cursor:"pointer",fontFamily:FN,fontSize:11,fontWeight:600}}>{overview?'✓ OVERVIEW':'OVERVIEW'}</button>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Program'}</Btn>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12,marginBottom:20}}>
        <Input label="Program Name" value={plan.name} onChange={e => setPlan({...plan,name:e.target.value})} placeholder="Hypertrophy Block A" />
        <Select label="Assign to Athlete" options={[{value:"",label:"Unassigned"}, ...trainees.flatMap(t => {
          if (t.members && t.members.length === 2) {
            return t.members.map((m, i) => ({ value: t.id + '__' + i, label: m.name || ('Member ' + (i+1)) }));
          }
          return [{ value: t.id, label: t.name }];
        })]} value={plan.traineeId} onChange={v => setPlan({...plan,traineeId:v})} />
        <Input label="Phase / Block" value={plan.phase||""} onChange={e => setPlan({...plan,phase:e.target.value})} placeholder="Accumulation..." />
        <Select label="Weeks" options={[3,4,5,6,8,12].map(n=>({value:String(n),label:n+' weeks'}))} value={String(plan.weeks||4)} onChange={v => {
          const n = parseInt(v) || 4;
          const resize = (arr) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : ""));
          // propagate week count to every per-week array across the program
          const nextDays = (plan.days || []).map(d => ({...d, exercises: (d.exercises||[]).map(ex => ({
            ...ex,
            wk: ex.wk ? resize(ex.wk) : ex.wk,
            wkS: ex.wkS ? resize(ex.wkS) : ex.wkS,
          }))}));
          setPlan({...plan, weeks: n, days: nextDays});
        }} />
      </div>
      <PatternCoverage plan={plan} exercises={exercises} />
      <WarmupEditor plan={plan} setPlan={setPlan} />
      {!overview && <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {plan.days.map((d,i) => <div key={d.id} style={{display:"flex"}}>
          <button onClick={()=>setActiveDay(i)} style={{padding:"6px 14px",fontSize:12,borderRadius:"6px 0 0 6px",border:"none",background:i===activeDay?C.ac:C.sf2,color:i===activeDay?"#fff":C.tm,cursor:"pointer",fontFamily:FB,fontWeight:600}}>{d.name} ({d.exercises.length})</button>
          {plan.days.length>1&&<button onClick={()=>removeDay(i)} style={{padding:"6px 6px",fontSize:10,borderRadius:"0 6px 6px 0",border:"none",borderLeft:`1px solid ${C.bd}`,background:i===activeDay?C.ac:C.sf2,color:i===activeDay?"#fff":C.td,cursor:"pointer",opacity:0.7}}>×</button>}
        </div>)}
        <Btn variant="ghost" onClick={addDay} style={{padding:"6px 12px",fontSize:12}}>+</Btn>
      </div>}
      {overview && <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
        {plan.days.map((d, dayIdx) => {
          const dayExs = d.exercises || [];
          const weeks = plan.weeks || 4;
          const resize = (arr, n, fill) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : fill));
          const tinyInput = {...baseInput, padding:"3px 6px", fontSize:11, minWidth:0, width:"100%", boxSizing:"border-box"};
          return (
            <div key={d.id} style={{background:C.sf,border:`0.25px solid ${C.ac}4D`,borderRadius:8,padding:12}}>
              <div style={{display:"flex",alignItems:"center",marginBottom:8,gap:10}}>
                <input value={d.name} onChange={e=>updateDay(dayIdx,{name:e.target.value})}
                  style={{...baseInput, fontFamily:FB, fontWeight:700, fontSize:14, color:C.tx, padding:"4px 8px", maxWidth:260}} />
                <span style={{color:C.td,fontSize:12,whiteSpace:"nowrap"}}>({dayExs.length} ex)</span>
                <button onClick={()=>{setActiveDay(dayIdx);setOverview(false)}} title="Open this day in the detail editor — needed to add exercises, change the exercise itself, or edit notes/URL"
                  style={{background:"none",border:`1px solid ${C.bd}`,borderRadius:6,padding:"3px 10px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:600,marginLeft:"auto"}}>DETAIL ▸</button>
              </div>
              {dayExs.length === 0 ? <div style={{color:C.td,fontSize:12,fontStyle:"italic"}}>No exercises.</div> :
                <div style={{overflowX:"auto",margin:"0 -12px",padding:"0 12px"}}><div style={{display:"grid",gridTemplateColumns:"22px minmax(140px,2fr) 56px minmax(80px,1fr) minmax(80px,1.2fr) minmax(60px,80px) minmax(48px,60px) minmax(56px,72px) 24px",gap:"6px 8px",fontSize:12,alignItems:"center",minWidth:600}}>
                  {["#","EXERCISE","GRP","SETS","REPS","LOAD","RPE","TEMPO",""].map((h,hi) =>
                    <div key={hi} style={{fontSize:9,fontFamily:FN,color:C.td,minWidth:0}}>{h}</div>)}
                  {dayExs.map((ex, exIdx) => {
                    const exData = exercises.find(e=>e.id===ex.exerciseId);
                    const title = exData?.title || ex.title || (ex.notes?.match(/^\[(.+)\]$/)?.[1]) || '(unresolved)';
                    const sc = ex.superset==="A"?C.ac:ex.superset==="B"?C.pu:ex.superset==="C"?C.or:C.td;
                    const update = (u) => updateExInDay(dayIdx, exIdx, u);
                    return <React.Fragment key={ex.id}>
                      <div style={{color:C.td, fontFamily:FN, minWidth:0}}>{exIdx+1}</div>
                      <div title="Exercise name links to the library — open DETAIL to swap the exercise or edit notes/URL"
                        style={{color:C.tx, minWidth:0, overflowWrap:"anywhere", wordBreak:"break-word", borderLeft:ex.superset?`3px solid ${sc}`:"none", paddingLeft:ex.superset?6:0}}>{title}</div>
                      <select value={ex.superset||""} onChange={e=>update({superset:e.target.value})}
                        style={{...tinyInput, color:sc, fontFamily:FN, fontWeight:600}}>
                        {SUPERSET_LABELS.map(s => <option key={s} value={s}>{s||"—"}</option>)}
                      </select>
                      {ex.wkS && Array.isArray(ex.wkS) && ex.wkS.length > 0 ? (
                        <div style={{display:"grid", gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`, gap:2}}>
                          {Array.from({length:weeks}).map((_,wi) => (
                            <input key={wi} value={ex.wkS[wi]||""} onChange={e=>{const next=resize(ex.wkS,weeks,""); next[wi]=e.target.value; update({wkS:next});}}
                              placeholder={"W"+(wi+1)} style={{...tinyInput, padding:"3px 4px", fontSize:10}} />
                          ))}
                        </div>
                      ) : (
                        <input type="number" value={ex.sets||""} onChange={e=>update({sets:parseInt(e.target.value)||0})} style={tinyInput} />
                      )}
                      {ex.wk && Array.isArray(ex.wk) && ex.wk.length > 0 ? (
                        <div style={{display:"grid", gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`, gap:2}}>
                          {Array.from({length:weeks}).map((_,wi) => (
                            <input key={wi} value={ex.wk[wi]||""} onChange={e=>{const next=resize(ex.wk,weeks,""); next[wi]=e.target.value; update({wk:next});}}
                              placeholder={"W"+(wi+1)} style={{...tinyInput, padding:"3px 4px", fontSize:10}} />
                          ))}
                        </div>
                      ) : (
                        <input value={ex.reps||""} onChange={e=>update({reps:e.target.value})} placeholder="8-12" style={tinyInput} />
                      )}
                      <input value={ex.load||""} onChange={e=>update({load:e.target.value})} placeholder="kg/%" style={tinyInput} />
                      <input value={ex.rpe||""} onChange={e=>update({rpe:e.target.value})} placeholder="7-8" style={tinyInput} />
                      <input value={ex.tempo||""} onChange={e=>update({tempo:e.target.value})} placeholder="3010" style={tinyInput} />
                      <button onClick={()=>removeExFromDay(dayIdx, exIdx)} title="Remove exercise from this day"
                        style={{background:"none",border:"none",color:C.rd,cursor:"pointer",fontSize:13,opacity:0.55,padding:0}}>🗑</button>
                    </React.Fragment>;
                  })}
                </div></div>
              }
            </div>
          );
        })}
      </div>}
      {!overview && day && <div style={{marginBottom:12}}><Input label={`Day ${activeDay+1} Name`} value={day.name} onChange={e=>updateDay(activeDay,{name:e.target.value})} /></div>}
      {!overview && (day&&day.exercises.length===0?
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
                <div style={{display:"grid",gridTemplateColumns:"2fr 90px minmax(70px,auto) minmax(70px,auto) 1fr 1fr 1fr auto",minWidth:720,gap:12,alignItems:"end"}}>
                  <ExPicker exercises={exercises} value={ex.exerciseId} onChange={id=>updateEx(exIdx,{exerciseId:id})} label="Exercise" fallbackTitle={ex.title} />
                  <div title="Superset letter — exercises sharing the same letter (A, B, C) are performed back-to-back as a superset. Leave blank for a standalone exercise." style={{minWidth:0}}>
                    <Select label="Superset" options={SUPERSET_LABELS.map(s=>({value:s,label:s||"—"}))} value={ex.superset||""} onChange={v=>updateEx(exIdx,{superset:v})} />
                  </div>
                  {(() => {
                    // Week count comes from plan.weeks — set once at the program level and applied to every per-week array
                    const weeks = plan.weeks || 4;
                    const resize = (arr, n, fill) => Array.from({length:n}, (_,i) => (arr && arr[i] !== undefined ? arr[i] : fill));
                    return <>
                      {ex.wkS && Array.isArray(ex.wkS) && ex.wkS.length > 0 ? (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Sets / Wk</label>
                            <button onClick={()=>updateEx(exIdx,{wkS:null,sets:parseInt(ex.wkS[0])||ex.sets||3})} title="Collapse to single sets value" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,marginLeft:"auto",fontFamily:FN}}>← flat</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(weeks,6)},minmax(42px,1fr))`,gap:3}}>
                            {Array.from({length:weeks}).map((_,i) => (
                              <input key={i} value={ex.wkS[i]||""} onChange={e=>{const next=resize(ex.wkS,weeks,""); next[i]=e.target.value; updateEx(exIdx,{wkS:next})}} placeholder={"W"+(i+1)} style={{...baseInput,padding:"4px 6px",fontSize:11,minWidth:0}} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Sets</label>
                            <button onClick={()=>updateEx(exIdx,{wkS:Array.from({length:weeks},()=>String(ex.sets||3))})} title="Set different sets per week" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,marginLeft:"auto",fontFamily:FN}}>per week →</button>
                          </div>
                          <input type="number" value={ex.sets} onChange={e=>updateEx(exIdx,{sets:parseInt(e.target.value)||0})} style={{...baseInput}} />
                        </div>
                      )}
                      {ex.wk && Array.isArray(ex.wk) && ex.wk.length > 0 ? (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Reps / Wk</label>
                            <button onClick={()=>updateEx(exIdx,{wk:null,reps:ex.wk[0]||"8-12"})} title="Collapse to single reps value" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,fontFamily:FN,marginLeft:"auto"}}>← flat</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(weeks,6)},minmax(42px,1fr))`,gap:3}}>
                            {Array.from({length:weeks}).map((_,i) => (
                              <input key={i} value={ex.wk[i]||""} onChange={e=>{const next=resize(ex.wk,weeks,""); next[i]=e.target.value; updateEx(exIdx,{wk:next})}} placeholder={"W"+(i+1)} style={{...baseInput,padding:"4px 6px",fontSize:11,minWidth:0}} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <label style={{fontSize:10,fontWeight:700,color:C.td,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:FN}}>Reps</label>
                            <button onClick={()=>updateEx(exIdx,{wk:Array.from({length:weeks},()=>ex.reps||""),reps:">"})} title="Set different reps per week" style={{background:"none",border:"none",color:C.ac,fontSize:10,cursor:"pointer",padding:0,marginLeft:"auto",fontFamily:FN}}>per week →</button>
                          </div>
                          <input value={ex.reps||""} onChange={e=>updateEx(exIdx,{reps:e.target.value})} placeholder="8-12" style={{...baseInput}} />
                        </div>
                      )}
                    </>;
                  })()}
                  <Input label="Load" value={ex.load} onChange={e=>updateEx(exIdx,{load:e.target.value})} placeholder="kg/%" />
                  <Input label="RPE" value={ex.rpe} onChange={e=>updateEx(exIdx,{rpe:e.target.value})} placeholder="7-8" />
                  <Input label="Tempo" value={ex.tempo} onChange={e=>updateEx(exIdx,{tempo:e.target.value})} placeholder="3010" />
                  <button onClick={()=>removeEx(exIdx)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:4,marginBottom:4,opacity:0.6}}>🗑</button>
                </div>
                {exData?<div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                  {exData.movementPattern&&<Badge color={C.gn}>{exData.movementPattern}</Badge>}
                  {exData.laterality&&<Badge color={C.tm}>{exData.laterality}</Badge>}
                  {exData.primaryMuscles&&<span style={{fontSize:11,color:C.td}}>{exData.primaryMuscles}</span>}
                </div>:exTitle?<div style={{fontSize:11,color:C.or,marginTop:4}}>📝 {exTitle}</div>:null}
                {(() => {
                  // Notes/Modifications: defaults to the library's cues so the coach
                  // sees the canonical technique notes inside the editable field. Typing
                  // here only mutates ex.notes on this plan row — the library row is
                  // never touched. Clearing falls back to the library cues again.
                  const libCues = exData?.cues || '';
                  const value = ex.notes || libCues;
                  return (
                    <textarea value={value}
                      onChange={e=>updateEx(exIdx,{notes:e.target.value})}
                      placeholder={libCues?"Notes / modifications (overrides library cues)":"Notes, modifications..."}
                      style={{...baseInput,marginTop:6,textAlign:'start',minHeight:64,padding:'10px 12px',lineHeight:1.5,resize:'vertical',fontFamily:FB,fontSize:13}} />
                  );
                })()}
                {(() => {
                  // Per-exercise URL.
                  // - undefined override → show library videoLink (read-only fallback)
                  // - any string override (including '') → use it; '' = explicit "no
                  //   video for this program" and the field stays empty even if the
                  //   library has one. Editing/clearing here never touches the library.
                  const libUrl = exData?.videoLink || '';
                  const hasOverride = ex.videoUrl !== undefined;
                  const value = hasOverride ? (ex.videoUrl || '') : libUrl;
                  const effective = value;
                  return (
                    <div style={{marginTop:6,display:"grid",gridTemplateColumns:effective?"1fr auto":"1fr",gap:6,alignItems:"center"}}>
                      <Input value={value} onChange={e=>updateEx(exIdx,{videoUrl:e.target.value})}
                        placeholder="📹 Insert video URL" />
                      {effective && <a href={effective} target="_blank" rel="noreferrer"
                        title={hasOverride?"Per-program URL":"From exercise library"}
                        style={{fontSize:11,fontFamily:FN,color:hasOverride?C.ac:C.tm,textDecoration:"none",padding:"6px 10px",border:`1px solid ${hasOverride?C.ac:C.bd}`,borderRadius:6,whiteSpace:"nowrap"}}>
                        {hasOverride?"OPEN ▸":"LIB ▸"}
                      </a>}
                    </div>
                  );
                })()}
                {plan.name && day && (() => {
                  // Match the plan's actual week count — the per-week sets/reps
                  // grids above use plan.weeks, but this used to be hardcoded
                  // to 4, hiding focus inputs for weeks 5+ on longer plans.
                  const weeks = plan.weeks || 4;
                  return (
                    <div style={{marginTop:6,background:C.acD,borderRadius:6,padding:"8px 10px",border:`1px solid ${C.ac}20`}}>
                      <div style={{fontSize:9,fontFamily:FN,color:C.ac,fontWeight:700,marginBottom:4}}>WEEKLY FOCUS</div>
                      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(weeks,6)},1fr)`,gap:4}}>
                        {Array.from({length:weeks}, (_, i) => i + 1).map(w => {
                          const fk = `${plan.name}|${day.name}|${ex.exerciseId}|W${w}`;
                          return <input key={w} value={weeklyFocus?.[fk]||""} onChange={e=>{const v=e.target.value;setWeeklyFocus(prev=>({...prev,[fk]:v}))}}
                            placeholder={`W${w}`} style={{background:C.sf2,border:`1px solid ${weeklyFocus?.[fk]?C.ac+"40":C.bd}`,borderRadius:4,padding:"4px 6px",color:C.tx,fontFamily:FB,fontSize:11,outline:"none",boxSizing:"border-box"}} />;
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div></div></div>);
        })}
        <Btn variant="ghost" onClick={()=>setAddExerciseOpen(true)} style={{width:"100%",justifyContent:"center",marginTop:8}}>+ Add Exercise</Btn>
      </div>)}
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
  const { plan: previewPlan, load: loadPreviewPlan, clear: clearPreviewPlan } = useFullPlan();
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterTrainee, setFilterTrainee] = useState("");
  const [hoverRect, setHoverRect] = useState(null);
  const hoverTimerRef = useRef(null);
  // Sort: field is 'name' | 'created' | 'updated'; dir is 'asc' | 'desc'.
  // Default 'created desc' matches the old creation-order-newest-first list.
  const [sortField, setSortField] = useState('created');
  const [sortDir, setSortDir] = useState('desc');

  // Auto-open plan if requested from TraineeDetail
  React.useEffect(() => {
    if (openPlanId && !editMode) {
      loadFullPlan(openPlanId).then(() => { setEditMode(true); if (onPlanOpened) onPlanOpened(); });
    }
  }, [openPlanId]);

  const traineeMap = useMemo(() => {
    const m = {};
    trainees.forEach(t => {
      m[t.id] = t.name;
      // Couples store plans against sub-IDs tr_xxx__0 / __1 — map those to the member's own name
      if (t.members && t.members.length === 2) {
        t.members.forEach((mem, i) => {
          m[t.id + '__' + i] = mem.name || ('Member ' + (i+1));
        });
      }
    });
    return m;
  }, [trainees]);

  const filtered = useMemo(() => {
    let result = planIndex;
    if (search) { const q = search.toLowerCase(); result = result.filter(p => p.name.toLowerCase().includes(q) || (traineeMap[p.traineeId]||'').toLowerCase().includes(q)); }
    if (filterTrainee) result = result.filter(p => p.traineeId === filterTrainee);
    // Apply the user-chosen sort. Hebrew-aware localeCompare for names so
    // חימום / Block #N / Comeback order predictably. Date fields fall back
    // to 0 when missing (pre-migration plans) so they sort to the bottom in
    // desc mode rather than throwing NaN.
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const sorted = result.slice().sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '', 'he') * dirMul;
      const ta = new Date(sortField === 'updated' ? (a.updatedAt || a.createdAt || 0) : (a.createdAt || 0)).getTime();
      const tb = new Date(sortField === 'updated' ? (b.updatedAt || b.createdAt || 0) : (b.createdAt || 0)).getTime();
      return (ta - tb) * dirMul;
    });
    return sorted;
  }, [planIndex, search, filterTrainee, traineeMap, sortField, sortDir]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const handleOpenPlan = async (planId) => { await loadFullPlan(planId); setEditMode(true); };
  const handleNewPlan = () => {
    setEditPlan({ id: 'pl_' + uid(), name: "", traineeId: "", phase: "", notes: "", active: true, createdAt: new Date().toISOString(), days: [defaultDay(1)], warmup: [], weeks: 4 });
    setEditMode(true);
  };
  const handleSave = async (plan) => { await savePlan(plan); setEditMode(false); clearPlan(); await reloadIndex(); };
  // Back from the editor: reload the index so autosaved edits (program name,
  // day count, exercise count, updatedAt sort, etc.) appear immediately.
  const handleCancel = () => { setEditMode(false); clearPlan(); reloadIndex(); };
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
      <div style={{display:"flex",gap:12,marginBottom:12,alignItems:"stretch",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,display:'flex'}}><input placeholder="Search programs..." value={search} onChange={e=>{setSearch(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,height:42,padding:'0 14px',fontSize:13,lineHeight:'42px',display:'flex',alignItems:'center',textAlignLast:'center'}} /></div>
        <div style={{position:'relative',width:200,display:'flex'}}>
          <select value={filterTrainee} onChange={e=>{setFilterTrainee(e.target.value);setVisibleCount(PAGE_SIZE)}} style={{...baseInput,height:42,padding:'0 36px 0 14px',fontSize:13,appearance:'none',WebkitAppearance:'none',textAlign:'center',textAlignLast:'center',flex:1}}>
            <option value="">All Athletes ({planIndex.length})</option>
            {traineeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.tm,fontSize:16,lineHeight:1}}>▾</span>
        </div>
        <Btn onClick={handleNewPlan} style={{height:42,padding:'0 18px',fontSize:13,lineHeight:'42px',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>+ New Program</Btn>
      </div>
      {/* Sort controls. Click an inactive field to activate it (keeps current dir);
          click the active field to flip direction. Arrow points 'up' for asc. */}
      <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center",flexWrap:"wrap",fontFamily:FN,fontSize:11}}>
        <span style={{color:C.td,letterSpacing:"0.05em"}}>SORT</span>
        {[
          ['name','Name'],
          ['created','Uploaded'],
          ['updated','Last edited'],
        ].map(([field,label]) => {
          const active = sortField === field;
          return (
            <button key={field} onClick={() => {
              if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              else setSortField(field);
            }} style={{
              padding:"4px 10px",borderRadius:4,
              border:`1px solid ${active?C.ac:C.bd}`,
              background:active?C.acD:"transparent",
              color:active?C.ac:C.tm,
              fontFamily:FN,fontSize:11,fontWeight:active?700:500,
              cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4
            }}>
              {label}{active && <span style={{fontSize:10}}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          );
        })}
      </div>
      <div style={{fontSize:12,color:C.td,marginBottom:12,fontFamily:FN}}>
        Showing {visible.length} of {filtered.length} programs{filtered.length !== planIndex.length ? ` (${planIndex.length} total)` : ''}
      </div>
      {filtered.length===0?<EmptyState icon="" message="No programs match your search." />:(
        <div style={{display:"grid",gap:6}}>{visible.map(p => {
          const tName = traineeMap[p.traineeId] || "Unassigned";
          return <Card key={p.id} onClick={()=>handleOpenPlan(p.id)} style={{padding:'10px 14px'}}
            onMouseEnter={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = setTimeout(() => {
                setHoverRect(rect);
                loadPreviewPlan(p.id);
              }, 220);
            }}
            onMouseLeave={() => {
              clearTimeout(hoverTimerRef.current);
              setHoverRect(null);
              clearPreviewPlan();
            }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{minWidth:0,flex:1,direction:'ltr',unicodeBidi:'isolate',display:'flex',alignItems:'baseline',gap:14,flexWrap:'wrap'}}>
                <div style={{fontWeight:700,fontSize:16,color:C.tx,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.01em',flexShrink:0}}><bdi>{tName}</bdi></div>
                <div style={{fontWeight:700,fontSize:14,color:C.ac,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN,minWidth:0,flex:1}}>{p.name||"Untitled"}</div>
                <div style={{fontSize:10,color:C.tm,fontFamily:FN,letterSpacing:'0.1em',textTransform:'uppercase',flexShrink:0,whiteSpace:'nowrap'}}>{p.dayCount} DAYS · {p.exerciseCount} EX{p.phase?` · ${p.phase}`:''}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={e=>{e.stopPropagation();handleDuplicate(p.id)}} title="Duplicate" style={{background:'transparent',border:`0.25px solid ${C.ac}4D`,borderRadius:0,color:C.ac,cursor:"pointer",padding:'3px 10px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em'}}>DUPLICATE</button>
                <button onClick={e=>{e.stopPropagation();setConfirmDelete(p.id)}} title="Delete" style={{background:'transparent',border:`0.25px solid ${C.rd}80`,borderRadius:0,color:C.rd,cursor:"pointer",padding:'3px 10px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em'}}>DELETE</button>
              </div></div></Card>})}
          {hasMore && <Btn variant="ghost" onClick={()=>setVisibleCount(c=>c+PAGE_SIZE)} style={{width:"100%",justifyContent:"center",marginTop:8}}>Load more ({filtered.length - visibleCount} remaining)</Btn>}
        </div>)}
      {/* Hover preview popover */}
      {previewPlan && hoverRect && (() => {
        const GAP = 12;
        const PW = 320;
        const spaceRight = window.innerWidth - hoverRect.right - GAP;
        const left = spaceRight >= PW ? hoverRect.right + GAP : hoverRect.left - PW - GAP;
        const top = Math.min(hoverRect.top + window.scrollY, window.innerHeight - 20);
        return (
          <div style={{position:'fixed',zIndex:900,top:hoverRect.top,left:Math.max(8,left),width:PW,background:C.bg,border:`1px solid ${C.ac}60`,borderRadius:0,padding:16,pointerEvents:'none',boxShadow:'0 8px 32px rgba(0,0,0,0.7)'}}>
            <div style={{fontFamily:FN,fontSize:13,fontWeight:700,color:C.ac,letterSpacing:'0.04em',marginBottom:2}}>{previewPlan.name||"Untitled"}</div>
            <div style={{fontFamily:FN,fontSize:10,color:C.tm,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>{previewPlan.days.length} DAYS · {previewPlan.days.reduce((n,d)=>n+d.exercises.length,0)} EX{previewPlan.phase?` · ${previewPlan.phase}`:''}</div>
            {previewPlan.days.map((d,di) => (
              <div key={d.id} style={{marginBottom:10}}>
                <div style={{fontFamily:FN,fontSize:10,fontWeight:700,color:C.tx,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{d.name}</div>
                {d.exercises.slice(0,8).map((pe,ei) => {
                  const ex = exercises.find(e=>e.id===pe.exerciseId);
                  const title = ex?.title || pe.title || '—';
                  return (
                    <div key={pe.id||ei} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'2px 0',borderBottom:`0.25px solid ${C.ac}1A`}}>
                      <span style={{fontSize:11,color:C.tm,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ei+1}. {title}</span>
                      <span style={{fontSize:10,fontFamily:FN,color:C.ac,flexShrink:0,marginLeft:8}}>{pe.sets}×{pe.reps}</span>
                    </div>
                  );
                })}
                {d.exercises.length > 8 && <div style={{fontSize:10,color:C.td,fontFamily:FN,marginTop:3}}>+{d.exercises.length-8} more</div>}
              </div>
            ))}
          </div>
        );
      })()}
      <ConfirmDialog open={!!confirmDelete} title="Delete Program?" message="Existing workouts will remain." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)} />
    </div>);
}
