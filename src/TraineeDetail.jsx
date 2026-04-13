import React, { useState } from 'react';
import { C, FN, FB, uid, PAYMENT_METHODS, PAYMENT_STATUSES, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Badge, Card, Modal } from './ui';
export default function TraineeDetail({ trainee, trainees, setTrainees, plans, exercises, workouts, payments, setPayments, onBack, onOpenPlan, portalVis, setPortalVis }) {
  const td = trainees.find(t=>t.id===trainee); const tp=plans.filter(p=>p.traineeId===trainee);
  const tw=workouts.filter(w=>w.traineeId===trainee&&w.status==="completed");
  const tPay=payments.filter(p=>p.traineeId===trainee);
  const [showPayForm,setShowPayForm]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [editForm,setEditForm]=useState(null);
  const [showArchiveConfirm,setShowArchiveConfirm]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const [deleteTyped,setDeleteTyped]=useState("");
  const handleArchive = () => { if(setTrainees) setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Archived",archivedAt:new Date().toISOString()}:t)); setShowArchiveConfirm(false); onBack(); };
  const handlePermanentDelete = () => { if(setTrainees) setTrainees(prev=>prev.filter(t=>t.id!==trainee)); setShowDeleteConfirm(false); setDeleteTyped(""); onBack(); };
  const [payForm,setPayForm]=useState({amount:"",method:"Bank Transfer",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});
  if (!td) return null;
  const totalPaid=tPay.reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
  const statusColor={Active:C.gn,"On Hold":C.or,Inactive:C.td,Trial:C.ac};
  const handleAddPayment=()=>{if(!payForm.amount)return;setPayments(prev=>[...prev,{id:uid(),traineeId:trainee,...payForm,createdAt:new Date().toISOString()}]);setPayForm({amount:"",method:"Bank Transfer",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});setShowPayForm(false)};
  const openEdit=()=>{setEditForm({...td});setShowEdit(true)};
  const saveEdit=()=>{if(!editForm.name)return;setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,...editForm}:t));setShowEdit(false)};
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back to Trainees</button>
        <div style={{display:"flex",gap:6}}>
          {td.status==="Archived" ? <>
            <Btn variant="ghost" onClick={()=>{if(setTrainees)setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Inactive",archivedAt:undefined}:t));onBack()}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
            <Btn variant="danger" onClick={()=>setShowDeleteConfirm(true)} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
          </> : <Btn variant="danger" onClick={()=>setShowArchiveConfirm(true)} style={{fontSize:11,padding:"4px 10px"}}>📦 Archive</Btn>}
        </div></div>
      <Card style={{marginBottom:8,position:"relative"}}>
        <div style={{textAlign:"center"}}><h2 style={{margin:0,fontFamily:FN,fontSize:20,color:C.tx}}>{td.name}</h2>
          <div style={{color:C.tm,fontSize:13,marginTop:4}}>{td.email}{td.phone?` · ${td.phone}`:""}</div></div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"absolute",right:16,top:16}}>
          <Btn variant="ghost" onClick={openEdit} style={{fontSize:11,padding:"4px 10px"}}>✏ Edit</Btn>
          <Badge color={statusColor[td.status]}>{td.status}</Badge></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:12,marginTop:16,textAlign:"center"}}>
          {[["Format",td.format],["Package",td.package],["Sessions Left",td.sessionsRemaining],["Monthly",td.monthly?`₪${td.monthly}`:"—"],["Per Session",td.perSession?`₪${td.perSession}`:"—"],["Last Payment",td.lastPayment||"—"],["Since",td.startDate],["Workouts",tw.length]].map(([l,v])=>
            <div key={l}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
        </div>
      </Card>
      <Card style={{marginBottom:16,textAlign:"center"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12}}>
          {[["Age",td.age||"—"],["Weight",td.weight?`${td.weight}kg`:"—"],["Height",td.height?`${td.height}cm`:"—"]].map(([l,v])=>
            <div key={l}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
        </div>
        {td.injuries&&<div style={{marginTop:12,padding:10,background:C.orD,borderRadius:6,textAlign:"left"}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:"uppercase",marginBottom:4}}>Injuries / Conditions</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(td.injuries)?'rtl':'ltr',textAlign:/[\u0590-\u05FF]/.test(td.injuries)?'right':'left'}}>{td.injuries}</div></div>}
        {td.goals&&<div style={{marginTop:8,padding:10,background:C.acD,borderRadius:6,textAlign:"left"}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:"uppercase",marginBottom:4}}>Goals</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(td.goals)?'rtl':'ltr',textAlign:/[\u0590-\u05FF]/.test(td.goals)?'right':'left'}}>{td.goals}</div></div>}
        {td.notes&&<div style={{marginTop:8,padding:10,background:C.sf2,borderRadius:6,textAlign:"left"}}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase",marginBottom:4}}>Notes</div><div style={{fontSize:13,color:C.tm,direction:/[\u0590-\u05FF]/.test(td.notes)?'rtl':'ltr',textAlign:/[\u0590-\u05FF]/.test(td.notes)?'right':'left'}}>{td.notes}</div></div>}
      </Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"20px 0 12px"}}>
        <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:0}}>Billing ({tPay.length}){totalPaid>0&&<span style={{color:C.gn,marginLeft:8}}>₪{totalPaid.toLocaleString()} paid</span>}</h3>
        <Btn onClick={()=>setShowPayForm(true)} style={{fontSize:12,padding:"4px 12px"}}>+ Add Payment</Btn></div>
      {tPay.length===0?<div style={{color:C.td,fontSize:13}}>No payments recorded.</div>:(
        <div style={{overflowX:"auto",marginBottom:16}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:FB,fontSize:13}}>
          <thead><tr style={{borderBottom:`1px solid ${C.bd}`}}>{["Date","Amount","Method","Status","Notes"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{tPay.slice().reverse().map(p=>(<tr key={p.id} style={{borderBottom:`1px solid ${C.bd}`}}>
            <td style={{padding:"8px 10px",color:C.tm}}>{new Date(p.date).toLocaleDateString()}</td>
            <td style={{padding:"8px 10px",color:C.gn,fontWeight:600}}>₪{parseFloat(p.amount).toLocaleString()}</td>
            <td style={{padding:"8px 10px",color:C.tm}}>{p.method}</td>
            <td style={{padding:"8px 10px"}}><Badge color={p.status==="Paid"?C.gn:p.status==="Overdue"?C.rd:C.or}>{p.status}</Badge></td>
            <td style={{padding:"8px 10px",color:C.td}}>{p.notes||"—"}</td></tr>))}</tbody></table></div>)}
      <Modal open={showPayForm} onClose={()=>setShowPayForm(false)} title="Add Payment">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Amount (₪)" type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} />
          <Select label="Method" options={PAYMENT_METHODS} value={payForm.method} onChange={v=>setPayForm({...payForm,method:v})} />
          <Input label="Date" type="date" value={payForm.date} onChange={e=>setPayForm({...payForm,date:e.target.value})} />
          <Select label="Status" options={PAYMENT_STATUSES} value={payForm.status} onChange={v=>setPayForm({...payForm,status:v})} />
          <div style={{gridColumn:"1 / -1"}}><Input label="Notes" value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})} /></div></div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          <Btn variant="ghost" onClick={()=>setShowPayForm(false)}>Cancel</Btn><Btn onClick={handleAddPayment}>Save</Btn></div></Modal>
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Assigned Plans ({tp.length})</h3>
      {tp.length===0?<div style={{color:C.td,fontSize:13}}>No plans assigned.</div>:
        tp.map(p=>{const visKey=`${td.name}:${p.name}`;const isVis=portalVis?.[visKey]!==false;return <Card key={p.id} style={{marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{flex:1,cursor:'pointer'}} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}><div style={{fontWeight:600,color:C.tx}}>{p.name}</div><div style={{fontSize:12,color:C.tm,marginTop:2}}>{p.days.length} days · {p.days.reduce((a,d)=>a+d.exercises.length,0)} exercises</div></div><div style={{display:'flex',alignItems:'center',gap:10}}><button onClick={e=>{e.stopPropagation();const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} title={isVis?"Visible on portal — click to hide":"Hidden from portal — click to show"} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><div style={{width:36,height:20,borderRadius:10,background:isVis?C.gn+'40':C.sf3,border:`1px solid ${isVis?C.gn+'60':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:16,height:16,borderRadius:8,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?18:1,transition:'all .15s'}}/></div><span style={{fontSize:10,fontFamily:FN,color:isVis?C.gn:C.td,minWidth:32}}>{isVis?'ON':'OFF'}</span></button><span onClick={()=>onOpenPlan&&onOpenPlan(p.id)} style={{color:C.ac,fontSize:12,cursor:'pointer'}}>Open →</span></div></div></Card>})}
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Recent Workouts ({tw.length})</h3>
      {tw.length===0?<div style={{color:C.td,fontSize:13}}>No completed workouts.</div>:
        tw.slice().reverse().slice(0,10).map(w=><Card key={w.id} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontWeight:600,color:C.tx,fontSize:13}}>{w.dayName}</div><span style={{fontSize:12,color:C.tm}}>{new Date(w.date).toLocaleDateString()}</span></div></Card>)}
      {/* Edit trainee modal */}
      <Modal open={showEdit} onClose={()=>setShowEdit(false)} title={`Edit — ${td.name}`} wide>
        {editForm&&<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Name" value={editForm.name||""} onChange={e=>setEditForm({...editForm,name:e.target.value})} />
          <Input label="Email" value={editForm.email||""} onChange={e=>setEditForm({...editForm,email:e.target.value})} />
          <Input label="Phone" value={editForm.phone||""} onChange={e=>setEditForm({...editForm,phone:e.target.value})} placeholder="+972..." />
          <Input label="Age" type="number" value={editForm.age||""} onChange={e=>setEditForm({...editForm,age:e.target.value})} />
          <Input label="Weight (kg)" type="number" value={editForm.weight||""} onChange={e=>setEditForm({...editForm,weight:e.target.value})} />
          <Input label="Height (cm)" type="number" value={editForm.height||""} onChange={e=>setEditForm({...editForm,height:e.target.value})} />
          <Select label="Format" options={TRAINING_FORMATS} value={editForm.format||""} onChange={v=>setEditForm({...editForm,format:v})} />
          <Select label="Status" options={TRAINEE_STATUSES.filter(s=>s!=="Archived")} value={editForm.status||""} onChange={v=>setEditForm({...editForm,status:v})} />
          <Select label="Package" options={PACKAGE_TYPES} value={editForm.package||""} onChange={v=>setEditForm({...editForm,package:v})} />
          <Input label="Sessions Remaining" type="number" value={editForm.sessionsRemaining||0} onChange={e=>setEditForm({...editForm,sessionsRemaining:parseInt(e.target.value)||0})} />
          <Input label="Monthly (₪)" type="number" value={editForm.monthly||""} onChange={e=>setEditForm({...editForm,monthly:parseFloat(e.target.value)||0})} />
          <Input label="Per Session (₪)" type="number" value={editForm.perSession||""} onChange={e=>setEditForm({...editForm,perSession:parseFloat(e.target.value)||0})} />
          <Input label="Start Date" type="date" value={editForm.startDate||""} onChange={e=>setEditForm({...editForm,startDate:e.target.value})} />
          <Input label="Last Payment" type="date" value={editForm.lastPayment||""} onChange={e=>setEditForm({...editForm,lastPayment:e.target.value})} />
          <div style={{gridColumn:"1 / -1"}}><TextArea label="Injuries / Conditions" value={editForm.injuries||""} onChange={e=>setEditForm({...editForm,injuries:e.target.value})} placeholder="L4/L5 disc bulge, R shoulder impingement..." /></div>
          <div style={{gridColumn:"1 / -1"}}><TextArea label="Goals" value={editForm.goals||""} onChange={e=>setEditForm({...editForm,goals:e.target.value})} /></div>
          <div style={{gridColumn:"1 / -1"}}><TextArea label="Notes" value={editForm.notes||""} onChange={e=>setEditForm({...editForm,notes:e.target.value})} /></div>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          <Btn variant="ghost" onClick={()=>setShowEdit(false)}>Cancel</Btn>
          <Btn onClick={saveEdit}>Save</Btn></div></>}
      </Modal>
      {/* Archive confirm */}
      {showArchiveConfirm && <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)"}} onClick={()=>setShowArchiveConfirm(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,width:380,padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.tx}}>Archive {td.name}?</h3>
          <p style={{margin:"0 0 20px",fontSize:13,color:C.tm}}>Client will be moved to archive. Plans, workouts, and payments are preserved. You can restore anytime.</p>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>setShowArchiveConfirm(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={handleArchive}>Archive</Btn></div></div></div>}
      {/* Permanent delete confirm */}
      {showDeleteConfirm && <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)"}} onClick={()=>{setShowDeleteConfirm(false);setDeleteTyped("")}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.rd}40`,borderRadius:12,width:420,padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.rd}}>⚠ Permanent Deletion</h3>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.tm}}>This will permanently delete <strong style={{color:C.tx}}>{td.name}</strong> and ALL their data.</p>
          <p style={{margin:"0 0 16px",fontSize:13,color:C.rd,fontWeight:600}}>This cannot be undone.</p>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:"uppercase",fontFamily:FN,display:"block",marginBottom:4}}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e=>setDeleteTyped(e.target.value)} style={{background:C.sf2,border:`1px solid ${C.rd}40`,borderRadius:6,padding:"8px 12px",color:C.tx,fontFamily:FN,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",letterSpacing:"0.1em"}} placeholder="DELETE" autoComplete="off"/></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>{setShowDeleteConfirm(false);setDeleteTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>{if(deleteTyped.trim().toUpperCase()==="DELETE")handlePermanentDelete()}} style={{opacity:deleteTyped.trim().toUpperCase()==="DELETE"?1:0.3,pointerEvents:deleteTyped.trim().toUpperCase()==="DELETE"?"auto":"none"}}>Delete Permanently</Btn></div></div></div>}
    </div>);
}
