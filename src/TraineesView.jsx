import React, { useState } from 'react';
import { C, FN, FB, uid, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Badge, Card, Modal, ConfirmDialog, EmptyState, baseInput } from './ui';

const defaultTrainee = () => ({
  id: uid(), name: "", email: "", phone: "", age: "", weight: "", height: "",
  injuries: "", goals: "", format: "In-Person Private", status: "Active",
  package: "8 Sessions", sessionsRemaining: 8, startDate: new Date().toISOString().slice(0,10),
  notes: "", packagePrice: "",
});

export default function TraineesView({ trainees, setTrainees, plans, portalVis, onSelect }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultTrainee());
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(null); // step 1: archive
  const [deleteConfirm, setDeleteConfirm] = useState(null);  // step 2: permanent delete from archive
  const [deleteTyped, setDeleteTyped] = useState("");         // step 3: type name to confirm

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac, Archived: C.rd };
  const active = trainees.filter(t => t.status !== "Archived");
  const archived = trainees.filter(t => t.status === "Archived");
  const filtered = (showArchived ? archived : active).filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) || (t.email||"").toLowerCase().includes(search.toLowerCase()));

  const handleSave = () => {
    if (!form.name) return;
    if (editId) setTrainees(prev => prev.map(t => t.id === editId ? form : t));
    else setTrainees(prev => [...prev, form]);
    setForm(defaultTrainee()); setEditId(null); setShowForm(false);
  };
  const handleArchive = (id) => {
    setTrainees(prev => prev.map(t => t.id === id ? {...t, status: "Archived", archivedAt: new Date().toISOString()} : t));
    setArchiveConfirm(null); setShowForm(false); setEditId(null);
  };
  const handleRestore = (id) => {
    setTrainees(prev => prev.map(t => t.id === id ? {...t, status: "Inactive", archivedAt: undefined} : t));
  };
  const handlePermanentDelete = (id) => {
    setTrainees(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null); setDeleteTyped("");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div style={{ flex: 1 }}><input placeholder="Search trainees..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...baseInput, paddingLeft: 12 }} /></div>
        <button onClick={() => setShowArchived(!showArchived)} style={{ background: showArchived ? C.rdD : "transparent", border: `1px solid ${showArchived ? C.rd : C.bd}`, borderRadius: 6, padding: "8px 14px", color: showArchived ? C.rd : C.tm, fontFamily: FB, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {showArchived ? `Archive (${archived.length})` : `Archive (${archived.length})`}
        </button>
        <Btn onClick={() => { setForm(defaultTrainee()); setEditId(null); setShowForm(true); }}>+ Add Trainee</Btn>
      </div>

      {filtered.length === 0 ? <EmptyState icon={showArchived ? "📦" : "👥"} message={showArchived ? "No archived clients." : "No trainees yet. Add your first client."} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(t => (
            <Card key={t.id} onClick={() => showArchived ? null : onSelect(t.id)} style={showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {}}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div style={{ fontWeight: 700, fontSize: 15, color: C.tx }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: C.tm, marginTop: 2 }}>{t.email}{t.phone ? ` · ${t.phone}` : ""}</div></div>
                <Badge color={statusColor[t.status] || C.tm}>{t.status}</Badge></div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Badge color={C.tm}>{t.format}</Badge></div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {t.sessionsRemaining != null && t.sessionsRemaining > 0 && <Badge color={t.sessionsRemaining <= 2 ? C.rd : C.gn}>{t.sessionsRemaining} sessions left</Badge>}
                {(()=>{const tp=(plans||[]).filter(p=>p.traineeId===t.id);const pc=tp.length;if(!pc)return null;const active=tp.filter(p=>portalVis?.[`${t.name}:${p.name}`]!==false).length;return <Badge color={C.ac}>{active}/{pc} active</Badge>})()}
              </div>
              {showArchived && <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Btn variant="ghost" onClick={(e) => {e.stopPropagation(); handleRestore(t.id)}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
                <Btn variant="danger" onClick={(e) => {e.stopPropagation(); setDeleteConfirm(t)}} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
              </div>}
              {!showArchived && <button onClick={(e) => {e.stopPropagation(); setForm({...t}); setEditId(t.id); setShowForm(true)}} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",fontSize:11,marginTop:8,padding:0}}>✏️ Edit</button>}
            </Card>))}
        </div>)}

      {/* Edit/Create Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Edit Trainee" : "New Trainee"} wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <Input label="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          <Input label="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+972..." />
          <Input label="Age" type="number" value={form.age} onChange={e => setForm({...form, age: e.target.value})} />
          <Input label="Weight (kg)" type="number" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} />
          <Input label="Height (cm)" type="number" value={form.height} onChange={e => setForm({...form, height: e.target.value})} />
          <Select label="Format" options={TRAINING_FORMATS} value={form.format} onChange={v => setForm({...form, format: v})} />
          <Select label="Status" options={TRAINEE_STATUSES.filter(s => s !== "Archived")} value={form.status} onChange={v => setForm({...form, status: v})} />
          <Select label="Package" options={PACKAGE_TYPES} value={form.package} onChange={v => setForm({...form, package: v})} />
          <Input label="Sessions Remaining" type="number" value={form.sessionsRemaining} onChange={e => setForm({...form, sessionsRemaining: parseInt(e.target.value)||0})} />
          <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
          <Input label="Package Price (₪)" type="number" value={form.packagePrice||""} onChange={e => setForm({...form, packagePrice: e.target.value})} />
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Injuries / Conditions" value={form.injuries} onChange={e => setForm({...form, injuries: e.target.value})} placeholder="L4/L5 disc bulge, R shoulder impingement..." /></div>
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Goals" value={form.goals} onChange={e => setForm({...form, goals: e.target.value})} /></div>
          <div style={{ gridColumn: "1 / -1" }}><TextArea label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          {editId && <Btn variant="danger" onClick={() => setArchiveConfirm(editId)} style={{ marginRight: "auto" }}>📦 Archive Client</Btn>}
          <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
          <Btn onClick={handleSave}>{editId ? "Update" : "Create"}</Btn>
        </div>
      </Modal>

      {/* Archive confirmation */}
      <ConfirmDialog open={!!archiveConfirm} title="Archive This Client?"
        message="Client will be moved to the archive. You can restore them anytime. Their plans, workouts, and payments will be preserved."
        onConfirm={() => handleArchive(archiveConfirm)}
        onCancel={() => setArchiveConfirm(null)} />

      {/* Permanent delete — type DELETE to confirm */}
      {deleteConfirm && <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }} onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.rd}40`, borderRadius: 12, width: 420, padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontFamily: FN, fontSize: 15, color: C.rd }}>⚠ Permanent Deletion</h3>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: C.tm }}>This will permanently delete <strong style={{color:C.tx}}>{deleteConfirm.name}</strong> and ALL their data (plans, workouts, payments).</p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.rd, fontWeight: 600 }}>This cannot be undone.</p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: "uppercase", fontFamily: FN, display: "block", marginBottom: 4 }}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)} style={{ background: C.sf2, border: `1px solid ${C.rd}40`, borderRadius: 6, padding: "8px 12px", color: C.tx, fontFamily: FN, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", letterSpacing: "0.1em" }} placeholder="DELETE" autoComplete="off" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => {setDeleteConfirm(null);setDeleteTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={() => { if (deleteTyped.trim().toUpperCase() === "DELETE") handlePermanentDelete(deleteConfirm.id); }}
              style={{ opacity: deleteTyped.trim().toUpperCase() === "DELETE" ? 1 : 0.3, pointerEvents: deleteTyped.trim().toUpperCase() === "DELETE" ? "auto" : "none" }}>
              Delete Permanently</Btn>
          </div>
        </div>
      </div>}
    </div>
  );
}
