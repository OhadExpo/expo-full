import React, { useState } from 'react';
import { C, FN, FB, uid, CATEGORIES, RESISTANCE_TYPES, BODY_POSITIONS, MOVEMENT_TYPES, MOVEMENT_PATTERNS, LATERALITY } from './theme';
import { Btn, Input, Select, TextArea, Badge, Modal, ConfirmDialog, EmptyState, baseInput } from './ui';
const defaultExercise = () => ({ id: uid(), title: "", category: "", resistanceType: "", bodyPosition: "", movementType: "", laterality: "", movementPattern: "", primaryMuscles: "", secondaryMuscles: "", primaryJoints: "", jointMovements: "", videoLink: "", cues: "", notes: "" });
export default function ExercisesView({ exercises, setExercises }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultExercise());
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ category: "", resistanceType: "", bodyPosition: "", movementType: "", movementPattern: "", laterality: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => setFilters({ category: "", resistanceType: "", bodyPosition: "", movementType: "", movementPattern: "", laterality: "" });

  const filtered = exercises.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      const haystack = [e.title, e.category, e.resistanceType, e.bodyPosition, e.movementType, e.movementPattern, e.laterality, e.primaryMuscles, e.secondaryMuscles, e.primaryJoints, e.jointMovements].filter(Boolean).join(' ').toLowerCase();
      if (!tokens.every(t => haystack.includes(t))) return false;
    }
    if (filters.category && e.category !== filters.category) return false;
    if (filters.resistanceType && e.resistanceType !== filters.resistanceType) return false;
    if (filters.bodyPosition && e.bodyPosition !== filters.bodyPosition) return false;
    if (filters.movementType && e.movementType !== filters.movementType) return false;
    if (filters.movementPattern && e.movementPattern !== filters.movementPattern) return false;
    if (filters.laterality && e.laterality !== filters.laterality) return false;
    return true;
  });
  const handleSave = () => {
    if (!form.title) return;
    if (editId) setExercises(prev => prev.map(e => e.id === editId ? form : e));
    else setExercises(prev => [...prev, form]);
    setForm(defaultExercise()); setEditId(null); setShowForm(false);
  };
  return (
    <div>
      <style>{`
        @media (max-width: 720px) { .ex-filters { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
      <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex' }}><input placeholder="Search exercises (title, muscle, pattern...)" value={search} onChange={e => setSearch(e.target.value)} style={{ ...baseInput, height: 42, padding: '0 14px', fontSize: 13, lineHeight: '42px' }} /></div>
        <Btn onClick={() => { setForm(defaultExercise()); setEditId(null); setShowForm(true); }} style={{ height: 42, padding: '0 18px', fontSize: 13, lineHeight: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+ Add Exercise</Btn>
      </div>
      <div style={{ background: 'var(--c-sf)', border:`0.25px solid ${C.cardBd}`, borderRadius: 0, padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontFamily: FN, fontWeight: 700, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em' }}>
            Filters {activeFilterCount > 0 && <span style={{ color: C.ac, marginLeft: 6 }}>({activeFilterCount} active)</span>}
          </div>
          {activeFilterCount > 0 && <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: C.tm, cursor: 'pointer', fontSize: 11, fontFamily: FN, textDecoration: 'underline' }}>Clear all</button>}
        </div>
        <div className="ex-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            ['category', 'Category', CATEGORIES],
            ['resistanceType', 'Resistance', RESISTANCE_TYPES],
            ['bodyPosition', 'Body Position', BODY_POSITIONS],
            ['movementType', 'Movement Type', MOVEMENT_TYPES],
            ['movementPattern', 'Pattern', MOVEMENT_PATTERNS],
            ['laterality', 'Laterality', LATERALITY],
          ].map(([key, label, options]) => (
            <div key={key} style={{ position: 'relative', display: 'flex' }}>
              <select value={filters[key]} onChange={e => setF(key, e.target.value)} style={{ ...baseInput, height: 36, padding: '0 32px 0 12px', fontSize: 12, appearance: 'none', WebkitAppearance: 'none', textAlign: 'center', textAlignLast: 'center', flex: 1 }}>
                <option value="">{label}</option>{options.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.tm, fontSize: 14, lineHeight: 1 }}>▾</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.tm, marginBottom: 12, fontFamily: FN }}>{filtered.length} exercise{filtered.length !== 1 ? "s" : ""}</div>
      {filtered.length === 0 ? <EmptyState icon="🏋️" message="No exercises. Build your library." /> : (
        <div style={{ overflowX: "auto", background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`, borderRadius: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FB, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `0.25px solid ${C.cardBd}` }}>
              {["Title","Category","Resistance","Pattern","Laterality",""].map(h =>
                <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 9, fontFamily: FN, color: C.tm, textTransform: "uppercase", letterSpacing: '0.18em' }}>{h}</th>)}
            </tr></thead>
            <tbody>{filtered.map(ex => (
              <tr key={ex.id} style={{ borderBottom: `0.25px solid ${C.cardBd}` }} onMouseEnter={e => e.currentTarget.style.background = C.sf2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px", color: C.tx, fontWeight: 600 }}>{ex.title}</td>
                <td style={{ padding: "10px" }}><Badge>{ex.category || "—"}</Badge></td>
                <td style={{ padding: "10px", color: C.tm }}>{ex.resistanceType || "—"}</td>
                <td style={{ padding: "10px" }}>{ex.movementPattern ? <Badge color={C.gn}>{ex.movementPattern}</Badge> : "—"}</td>
                <td style={{ padding: "10px", color: C.tm }}>{ex.laterality || "—"}</td>
                <td style={{ padding: "10px" }}>
                  <button onClick={() => { setForm({...ex}); setEditId(ex.id); setShowForm(true); }} style={{ background: "none", border: "none", color: C.tm, cursor: "pointer", padding: 4 }}>✏️</button>
                  <button onClick={() => setConfirmDelete(ex.id)} style={{ background: "none", border: "none", color: C.rd, cursor: "pointer", padding: 4, opacity: 0.6 }}>🗑</button>
                </td></tr>))}</tbody></table></div>)}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Edit Exercise" : "New Exercise"} wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}><Input label="Title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g., Barbell Back Squat" /></div>
          <Select label="Category" options={CATEGORIES} value={form.category} onChange={v => setForm({...form, category: v})} placeholder="Select..." />
          <Select label="Resistance Type" options={RESISTANCE_TYPES} value={form.resistanceType} onChange={v => setForm({...form, resistanceType: v})} placeholder="Select..." />
          <Select label="Body Position" options={BODY_POSITIONS} value={form.bodyPosition} onChange={v => setForm({...form, bodyPosition: v})} placeholder="Select..." />
          <Select label="Movement Type" options={MOVEMENT_TYPES} value={form.movementType} onChange={v => setForm({...form, movementType: v})} placeholder="Select..." />
          <Select label="Movement Pattern" options={MOVEMENT_PATTERNS} value={form.movementPattern} onChange={v => setForm({...form, movementPattern: v})} placeholder="Select..." />
          <Select label="Laterality" options={LATERALITY} value={form.laterality} onChange={v => setForm({...form, laterality: v})} placeholder="Select..." />
          <Input label="Primary Muscles" value={form.primaryMuscles} onChange={e => setForm({...form, primaryMuscles: e.target.value})} placeholder="Quads, Glutes" />
          <Input label="Secondary Muscles" value={form.secondaryMuscles} onChange={e => setForm({...form, secondaryMuscles: e.target.value})} />
          <div style={{ gridColumn: "1 / -1" }}><Input label="Video Link" value={form.videoLink} onChange={e => setForm({...form, videoLink: e.target.value})} placeholder="https://..." /></div>
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Coaching Cues" value={form.cues} onChange={e => setForm({...form, cues: e.target.value})} placeholder="Brace core, drive through heels..." /></div>
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
          <Btn onClick={handleSave}>{editId ? "Update" : "Create"}</Btn>
        </div>
      </Modal>
      <ConfirmDialog open={!!confirmDelete} title="Delete Exercise?" message="Plans referencing it will show 'Unknown Exercise'."
        onConfirm={() => { setExercises(p => p.filter(e => e.id !== confirmDelete)); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)} />
    </div>);
}
