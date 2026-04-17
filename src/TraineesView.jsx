import React, { useState, useEffect, useRef } from 'react';
import { C, FN, FB, uid, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Badge, Card, Modal, ConfirmDialog, EmptyState, baseInput } from './ui';

// Normalize email field: always work with arrays internally
const emailsToArr = (email) => {
  if (!email) return [''];
  if (Array.isArray(email)) return email.length ? email : [''];
  return [email];
};
const emailsToStore = (arr) => {
  const clean = arr.map(e => e.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return clean;
};
const emailsDisplay = (email) => {
  if (!email) return '';
  if (Array.isArray(email)) return email.join(', ');
  return email;
};

const isCouple = (t) => t.members && t.members.length === 2;

// Get plan counts per member for couples: parent ID plans count for both, sub-ID plans count for that member only
const getMemberPlanCounts = (t, planCounts) => {
  if (!isCouple(t)) return [planCounts?.[t.id] || 0];
  const shared = planCounts?.[t.id] || 0;
  return [
    shared + (planCounts?.[t.id + '__0'] || 0),
    shared + (planCounts?.[t.id + '__1'] || 0),
  ];
};

const defaultTrainee = () => ({
  id: uid(), name: "", email: "", phone: "", age: "", weight: "", height: "",
  injuries: "", goals: "", format: "In-Person Private", status: "Active",
  package: "8 Sessions", sessionsRemaining: 8, startDate: new Date().toISOString().slice(0,10),
  notes: "", packagePrice: "",
});

export default function TraineesView({ trainees, setTrainees, planCounts, portalVis, onSelect }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultTrainee());
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);
  useEffect(()=>{
    if(!addMenuOpen) return;
    const close = (e)=>{ if(addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false); };
    document.addEventListener('mousedown',close);
    return ()=>document.removeEventListener('mousedown',close);
  },[addMenuOpen]);         // step 3: type name to confirm

  const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac, Archived: C.rd };
  const active = trainees.filter(t => t.status !== "Archived");
  const archived = trainees.filter(t => t.status === "Archived");
  const filtered = (showArchived ? archived : active).filter(t => {
    const s = search.toLowerCase();
    const emailStr = Array.isArray(t.email) ? t.email.join(' ') : (t.email || '');
    if (t.name.toLowerCase().includes(s) || emailStr.toLowerCase().includes(s)) return true;
    if (t.members) return t.members.some(m => (m.name||'').toLowerCase().includes(s) || (m.email||'').toLowerCase().includes(s));
    return false;
  });

  const handleSave = () => {
    if (!form.name) return;
    const toSave = { ...form, email: emailsToStore(form._emails || emailsToArr(form.email)) };
    delete toSave._emails;
    if (editId) setTrainees(prev => prev.map(t => t.id === editId ? toSave : t));
    else setTrainees(prev => [...prev, toSave]);
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
        <div ref={addMenuRef} style={{position:'relative'}}>
          <Btn onClick={() => setAddMenuOpen(!addMenuOpen)}>+ Add Trainee ▾</Btn>
          {addMenuOpen && <div style={{position:'absolute',right:0,top:'100%',marginTop:4,background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,overflow:'hidden',zIndex:50,minWidth:180,boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
            {[['Online','Online'],['In-Person Single','In-Person Private'],['In-Person Couple','In-Person Couple']].map(([label,format])=>(
              <button key={format} onClick={()=>{
                const f = {...defaultTrainee(), format};
                if(format==='In-Person Couple') f.members=[{name:'',email:'',phone:'',age:'',weight:'',height:'',injuries:'',goals:'',notes:''},{name:'',email:'',phone:'',age:'',weight:'',height:'',injuries:'',goals:'',notes:''}];
                setForm(f); setEditId(null); setShowForm(true); setAddMenuOpen(false);
              }} style={{display:'block',width:'100%',padding:'10px 16px',background:'transparent',border:'none',borderBottom:`1px solid ${C.bd}`,color:C.tx,fontFamily:FB,fontSize:13,fontWeight:500,cursor:'pointer',textAlign:'left'}}
                onMouseEnter={e=>e.currentTarget.style.background=C.sf2} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                {label}
              </button>
            ))}
          </div>}
        </div>
      </div>

      {filtered.length === 0 ? <EmptyState icon={showArchived ? "📦" : "👥"} message={showArchived ? "No archived clients." : "No trainees yet. Add your first client."} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(t => {
            const couple = isCouple(t);
            const mpc = getMemberPlanCounts(t, planCounts);
            // Extract family name for couple cards (shared surname after ו)
            const familyName = couple ? (t.name.match(/\s+(\S+)$/)?.[1] || '') : '';

            if (couple) {
              const [m0, m1] = t.members;
              return (
                <Card key={t.id} onClick={() => showArchived ? null : onSelect(t.id)} style={{...(showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {})}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:600,fontFamily:FN,background:C.acD,color:C.ac}}>COUPLE</span>
                      {familyName && <span style={{fontSize:12,color:C.td,fontFamily:FN}}>{familyName}</span>}
                    </div>
                    <Badge color={statusColor[t.status] || C.tm}>{t.status}</Badge>
                  </div>
                  <div style={{display:'flex'}}>
                    {[m0, m1].map((m, mi) => (
                      <React.Fragment key={mi}>
                        {mi === 1 && <div style={{width:1,background:C.bd,margin:'0 12px',alignSelf:'stretch'}} />}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:15,color:C.tx,textAlign:'left'}}>{m.name || `Member ${mi+1}`}</div>
                          <div style={{fontSize:12,color:C.tm,marginTop:2,minHeight:16,textAlign:'left'}}>{m.email||''}</div>
                          <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
                            {mpc[mi] > 0 && <span style={{fontSize:11,fontFamily:FN,fontWeight:700,color:C.ac}}>{mpc[mi]} PROGRAMS</span>}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{height:1,background:C.bd,margin:'10px 0'}} />
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {t.sessionsRemaining != null && t.sessionsRemaining > 0 && <span style={{fontSize:11,fontFamily:FN,fontWeight:700,color:t.sessionsRemaining<=2?C.rd:C.gn}}>{t.sessionsRemaining} SESSIONS LEFT</span>}
                      {t.monthly > 0 && <span style={{fontSize:11,color:C.td,fontFamily:FN}}>₪{t.monthly}/mo</span>}
                    </div>
                    {!showArchived && <button onClick={e => {e.stopPropagation(); setForm({...t, _emails: emailsToArr(t.email)}); setEditId(t.id); setShowForm(true)}} style={{background:'none',border:'none',color:C.tm,cursor:'pointer',fontSize:11,padding:0}}>✏️ Edit</button>}
                  </div>
                  {showArchived && <div style={{display:'flex',gap:6,marginTop:10}}>
                    <Btn variant="ghost" onClick={e => {e.stopPropagation(); handleRestore(t.id)}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
                    <Btn variant="danger" onClick={e => {e.stopPropagation(); setDeleteConfirm(t)}} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
                  </div>}
                </Card>
              );
            }

            // Solo trainee card (unchanged)
            return (
            <Card key={t.id} onClick={() => showArchived ? null : onSelect(t.id)} style={showArchived ? {opacity: 0.7, borderStyle: "dashed"} : {}}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{flex:1}}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.tx, textAlign:'left' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: C.tm, marginTop: 2, minHeight: 16, textAlign:'left' }}>{emailsDisplay(t.email)}{t.phone ? ` · ${t.phone}` : ""}</div>
                  <div style={{ fontSize: 11, color: C.tm, marginTop: 18, fontFamily: FN, fontWeight: 600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{t.format}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", minHeight: 22 }}>
                    {t.sessionsRemaining != null && t.sessionsRemaining > 0 && <span style={{fontSize:11,fontFamily:FN,fontWeight:700,color:t.sessionsRemaining<=2?C.rd:C.gn}}>{t.sessionsRemaining} SESSIONS LEFT</span>}
                    {(()=>{const pc=planCounts?.[t.id]||0;if(!pc)return null;return <span style={{fontSize:11,fontFamily:FN,fontWeight:700,color:C.ac}}>{pc} PROGRAMS</span>})()}
                  </div>
                </div>
                <Badge color={statusColor[t.status] || C.tm}>{t.status}</Badge></div>
              {showArchived && <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Btn variant="ghost" onClick={(e) => {e.stopPropagation(); handleRestore(t.id)}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
                <Btn variant="danger" onClick={(e) => {e.stopPropagation(); setDeleteConfirm(t)}} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
              </div>}
              {!showArchived && <button onClick={(e) => {e.stopPropagation(); setForm({...t, _emails: emailsToArr(t.email)}); setEditId(t.id); setShowForm(true)}} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",fontSize:11,marginTop:8,padding:0}}>✏️ Edit</button>}
            </Card>);
          })}
        </div>)}

      {/* Edit/Create Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Edit Trainee" : "New Trainee"} wide>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FN }}>Email(s)</label>
            {(form._emails || emailsToArr(form.email)).map((em, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <input value={em} onChange={e => {
                  const next = [...(form._emails || emailsToArr(form.email))];
                  next[i] = e.target.value;
                  setForm({...form, _emails: next});
                }} placeholder="email@example.com" style={{ ...baseInput, flex: 1 }} />
                {arr.length > 1 && <button onClick={() => {
                  const next = [...arr]; next.splice(i, 1);
                  setForm({...form, _emails: next});
                }} style={{ background: C.rdD, border: 'none', borderRadius: 6, padding: '0 8px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
              </div>
            ))}
            {(form._emails || emailsToArr(form.email)).length < 3 && (
              <button onClick={() => {
                const next = [...(form._emails || emailsToArr(form.email)), ''];
                setForm({...form, _emails: next});
              }} style={{ background: 'none', border: `1px dashed ${C.bd}`, borderRadius: 6, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FB, fontSize: 11, fontWeight: 600 }}>+ Add Email</button>
            )}
          </div>
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
