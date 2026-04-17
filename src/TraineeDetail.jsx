import React, { useState } from 'react';
import { C, FN, FB, uid, PAYMENT_METHODS, PAYMENT_STATUSES, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';
import { Btn, Input, Select, TextArea, Badge, Card, Modal, baseInput } from './ui';
import { savePlan } from './usePlansStore';
import { supabase } from './supabase';
import OverloadChart from './OverloadChart';

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

export default function TraineeDetail({ trainee, trainees, setTrainees, planIndex, reloadPlanIndex, exercises, workouts, payments, setPayments, onBack, onOpenPlan, portalVis, setPortalVis }) {
  const td = trainees.find(t=>t.id===trainee);
  // For couples: plans assigned to parent ID are shared, plans to sub-IDs are per-member
  const tp=(planIndex||[]).filter(p=>p.traineeId===trainee || p.traineeId===trainee+'__0' || p.traineeId===trainee+'__1');
  const tpMember = (mi) => tp.filter(p => p.traineeId===trainee || p.traineeId===trainee+'__'+mi);
  const tw=workouts.filter(w=>w.traineeId===trainee&&w.status==="completed");
  const tPay=payments.filter(p=>p.traineeId===trainee);
  const [showPayForm,setShowPayForm]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [editForm,setEditForm]=useState(null);
  const [showAssign,setShowAssign]=useState(false);
  const [pendingAssignPlan,setPendingAssignPlan]=useState(null); // for couple member picker
  const [confirmUnassign,setConfirmUnassign]=useState(null);
  const [unassignTyped,setUnassignTyped]=useState("");
  const [showArchiveConfirm,setShowArchiveConfirm]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const [deleteTyped,setDeleteTyped]=useState("");
  const [programSort,setProgramSort]=useState('chrono'); // 'chrono' | 'alpha'
  const handleArchive = () => { if(setTrainees) setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Archived",archivedAt:new Date().toISOString()}:t)); setShowArchiveConfirm(false); onBack(); };
  const handlePermanentDelete = () => { if(setTrainees) setTrainees(prev=>prev.filter(t=>t.id!==trainee)); setShowDeleteConfirm(false); setDeleteTyped(""); onBack(); };
  const [payForm,setPayForm]=useState({amount:"",method:"Bank Transfer",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});
  const [editPayId,setEditPayId]=useState(null);
  if (!td) return null;
  const couple = td.members && td.members.length === 2;
  const totalPaid=tPay.reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
  const statusColor={Active:C.gn,"On Hold":C.or,Inactive:C.td,Trial:C.ac};
  const handleAddPayment=()=>{if(!payForm.amount)return;if(editPayId){setPayments(prev=>prev.map(p=>p.id===editPayId?{...p,...payForm}:p));setEditPayId(null)}else{setPayments(prev=>[...prev,{id:uid(),traineeId:trainee,...payForm,createdAt:new Date().toISOString()}])}setPayForm({amount:"",method:"Bank Transfer",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});setShowPayForm(false)};
  const handleEditPay=(p)=>{setPayForm({amount:p.amount,method:p.method,date:p.date,notes:p.notes||"",status:p.status});setEditPayId(p.id);setShowPayForm(true)};
  const handleDeletePay=(pid)=>{setPayments(prev=>prev.filter(p=>p.id!==pid))};
  const openEdit=()=>{
    const ef = {...td, _emails: emailsToArr(td.email)};
    if (couple) ef._members = td.members.map(m => ({...m}));
    setEditForm(ef);
    setShowEdit(true);
  };
  const saveEdit=()=>{
    if(!editForm.name) return;
    const toSave={...editForm, email: emailsToStore(editForm._emails || emailsToArr(editForm.email))};
    delete toSave._emails;
    if (toSave._members) { toSave.members = toSave._members; delete toSave._members; }
    setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,...toSave}:t));
    setShowEdit(false);
  };
  const assignPlan=async(planId, targetId)=>{
    const tid = targetId || trainee; // default to parent ID (shared)
    const{data:src}=await supabase.from('plans').select('*').eq('id',planId).single();
    if(!src)return;
    if(!src.trainee_id){
      await supabase.from('plans').update({trainee_id:tid,updated_at:new Date().toISOString()}).eq('id',planId);
    } else {
      const dup={id:'pl_'+uid(),name:src.name,traineeId:tid,phase:src.phase||'',notes:src.notes||'',active:true,createdAt:new Date().toISOString(),days:src.data?.days||[],warmup:src.data?.warmup||[]};
      await savePlan(dup);
    }
    setShowAssign(false);
    setPendingAssignPlan(null);
    if(reloadPlanIndex) await reloadPlanIndex();
  };
  // For couples: intercept assign to show member picker
  const handleAssignClick = (planId) => {
    if (couple) {
      setPendingAssignPlan(planId);
    } else {
      assignPlan(planId);
    }
  };
  const unassignPlan=async(planId)=>{
    await supabase.from('plans').update({trainee_id:'',updated_at:new Date().toISOString()}).eq('id',planId);
    if(reloadPlanIndex) await reloadPlanIndex();
  };
  // Helper: render a member column (body stats, injuries, goals, programs)
  const renderMemberColumn = (m, mi) => {
    const memberPlans = tpMember(mi);
    const sorted = [...memberPlans].sort((a,b)=>programSort==='alpha'?a.name.localeCompare(b.name):new Date(b.createdAt||0)-new Date(a.createdAt||0));
    return (
      <div style={{flex:1,minWidth:0}}>
        <Card style={{marginBottom:8}}>
          <div style={{textAlign:'center',marginBottom:10}}>
            <div style={{fontSize:18,fontWeight:700,color:C.tx,fontFamily:FN}}>{m.name}</div>
            <div style={{fontSize:12,color:C.tm,marginTop:2}}>{m.email||''}{m.phone?` · ${m.phone}`:''}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,textAlign:'center'}}>
            {[['Age',m.age||'—'],['Weight',m.weight?`${m.weight}kg`:'—'],['Height',m.height?`${m.height}cm`:'—']].map(([l,v])=>
              <div key={l}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
          </div>
          {m.injuries&&<div style={{marginTop:10,padding:8,background:C.orD,borderRadius:6}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Injuries</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(m.injuries)?'rtl':'ltr',textAlign:'center'}}>{m.injuries}</div></div>}
          {m.goals&&<div style={{marginTop:6,padding:8,background:C.acD,borderRadius:6}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Goals</div><div style={{fontSize:13,color:C.tx,textAlign:'center'}}>{m.goals}</div></div>}
          {m.notes&&<div style={{marginTop:6,padding:8,background:C.sf2,borderRadius:6}}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Notes</div><div style={{fontSize:13,color:C.tm,textAlign:'center'}}>{m.notes}</div></div>}
        </Card>
        <div style={{fontSize:12,fontFamily:FN,color:C.tm,fontWeight:600,margin:'12px 0 6px'}}>{m.name} — PROGRAMS ({sorted.length})</div>
        {sorted.length===0?<div style={{color:C.td,fontSize:12}}>No programs assigned.</div>:
          sorted.map(p=>{const visKey=`${td.name}:${p.name}`;const isVis=portalVis?.[visKey]!==false;return(
            <Card key={p.id} style={{marginBottom:6,padding:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}>
                  <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name}</div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>{p.dayCount||0} days · {p.exerciseCount||0} ex</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={e=>{e.stopPropagation();setConfirmUnassign(p.id);setUnassignTyped("")}} style={{background:'none',border:'none',color:C.rd,cursor:'pointer',fontSize:11,fontFamily:FN,opacity:0.6,padding:2}}>✕</button>
                  <button onClick={e=>{e.stopPropagation();const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                    <div style={{width:28,height:16,borderRadius:8,background:isVis?C.gn+'40':C.sf3,border:`1px solid ${isVis?C.gn+'60':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:12,height:12,borderRadius:6,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?14:1,transition:'all .15s'}}/></div>
                  </button>
                </div>
              </div>
            </Card>)})}
      </div>
    );
  };

  // Helper: render programs list for solo trainees (existing layout)
  const renderProgramsList = () => {
    const sorted = [...tp].sort((a,b)=>programSort==='alpha'?a.name.localeCompare(b.name):new Date(b.createdAt||0)-new Date(a.createdAt||0));
    return sorted.map(p=>{const visKey=`${td.name}:${p.name}`;const isVis=portalVis?.[visKey]!==false;return <Card key={p.id} style={{marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{flex:1,cursor:'pointer'}} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}><div style={{fontWeight:600,color:C.tx}}>{p.name}</div><div style={{fontSize:12,color:C.tm,marginTop:2}}>{p.dayCount||0} days · {p.exerciseCount||0} exercises</div></div><div style={{display:'flex',alignItems:'center',gap:10}}><button onClick={e=>{e.stopPropagation();setConfirmUnassign(p.id);setUnassignTyped("")}} title="Remove program" style={{background:'none',border:'none',color:C.rd,cursor:'pointer',fontSize:11,fontFamily:FN,opacity:0.6,padding:2}}>✕</button><button onClick={e=>{e.stopPropagation();const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} title={isVis?"Visible on portal — click to hide":"Hidden from portal — click to show"} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><div style={{width:36,height:20,borderRadius:10,background:isVis?C.gn+'40':C.sf3,border:`1px solid ${isVis?C.gn+'60':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:16,height:16,borderRadius:8,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?18:1,transition:'all .15s'}}/></div><span style={{fontSize:10,fontFamily:FN,color:isVis?C.gn:C.td,minWidth:32}}>{isVis?'ON':'OFF'}</span></button><span onClick={()=>onOpenPlan&&onOpenPlan(p.id)} style={{color:C.ac,fontSize:12,cursor:'pointer'}}>Open →</span></div></div></Card>});
  };

  return (
    <div>
      {/* Back + actions bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back to Trainees</button>
        <div style={{display:"flex",gap:6}}>
          <Btn variant="ghost" onClick={openEdit} style={{fontSize:11,padding:"4px 10px"}}>✏ Edit</Btn>
          {td.status==="Archived" ? <>
            <Btn variant="ghost" onClick={()=>{if(setTrainees)setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Inactive",archivedAt:undefined}:t));onBack()}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
            <Btn variant="danger" onClick={()=>setShowDeleteConfirm(true)} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
          </> : <Btn variant="danger" onClick={()=>setShowArchiveConfirm(true)} style={{fontSize:11,padding:"4px 10px"}}>📦 Archive</Btn>}
        </div></div>

      {/* === COUPLE LAYOUT === */}
      {couple ? <>
        {/* Shared billing bar */}
        <Card style={{marginBottom:12,textAlign:'center'}}>
          <div style={{fontSize:12,color:C.tm,fontFamily:FN,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:8}}>
            Shared · {td.format} · <Badge color={statusColor[td.status]}>{td.status}</Badge>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))',gap:10}}>
            {[['Package',td.package],['Sessions Left',td.sessionsRemaining],['Monthly',td.monthly?`₪${td.monthly}`:'—'],['Per Session',td.perSession?`₪${td.perSession}`:'—'],['Last Payment',td.lastPayment||'—'],['Since',td.startDate]].map(([l,v])=>
              <div key={l}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
          </div>
        </Card>

        {/* Two-column member split */}
        <div style={{display:'flex',gap:12}}>
          {renderMemberColumn(td.members[0], 0)}
          <div style={{width:1,background:C.bd,alignSelf:'stretch',flexShrink:0}} />
          {renderMemberColumn(td.members[1], 1)}
        </div>

        {/* Program sort + assign (shared) */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'20px 0 12px'}}>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={()=>setProgramSort(s=>s==='chrono'?'alpha':'chrono')} style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"4px 10px",color:C.tm,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:600}}>{programSort==='chrono'?'↕ DATE':'↕ A→Z'}</button>
          </div>
          <Btn onClick={()=>setShowAssign(true)} style={{fontSize:12,padding:"4px 12px"}}>+ Assign Program</Btn>
        </div>
      </> : <>

      {/* === SOLO LAYOUT (unchanged) === */}
      <Card style={{marginBottom:8,position:"relative"}}>
        <div style={{textAlign:"center"}}><h2 style={{margin:0,fontFamily:FN,fontSize:20,color:C.tx}}>{td.name}</h2>
          <div style={{color:C.tm,fontSize:13,marginTop:4}}>{Array.isArray(td.email)?td.email.join(', '):(td.email||'')}{td.phone?` · ${td.phone}`:""}</div></div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"absolute",right:16,top:16}}>
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
        {td.injuries&&<div style={{marginTop:12,padding:10,background:C.orD,borderRadius:6}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Injuries / Conditions</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(td.injuries)?'rtl':'ltr',textAlign:'center'}}>{td.injuries}</div></div>}
        {td.goals&&<div style={{marginTop:8,padding:10,background:C.acD,borderRadius:6}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Goals</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(td.goals)?'rtl':'ltr',textAlign:'center'}}>{td.goals}</div></div>}
        {td.notes&&<div style={{marginTop:8,padding:10,background:C.sf2,borderRadius:6}}><div style={{fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Notes</div><div style={{fontSize:13,color:C.tm,direction:/[\u0590-\u05FF]/.test(td.notes)?'rtl':'ltr',textAlign:'center'}}>{td.notes}</div></div>}
      </Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"20px 0 12px"}}>
        <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:0}}>Assigned Programs ({tp.length})</h3>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={()=>setProgramSort(s=>s==='chrono'?'alpha':'chrono')} style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"4px 10px",color:C.tm,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:600}}>{programSort==='chrono'?'↕ DATE':'↕ A→Z'}</button>
          <Btn onClick={()=>setShowAssign(true)} style={{fontSize:12,padding:"4px 12px"}}>+ Assign Program</Btn></div></div>
      {tp.length===0?<div style={{color:C.td,fontSize:13}}>No programs assigned.</div>:renderProgramsList()}
      </>}

      {/* === SHARED SECTIONS (billing, workouts, modals) === */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"20px 0 12px"}}>
        <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:0}}>Billing ({tPay.length}){totalPaid>0&&<span style={{color:C.gn,marginLeft:8}}>₪{totalPaid.toLocaleString()} total paid</span>}</h3>
        <Btn onClick={()=>setShowPayForm(true)} style={{fontSize:12,padding:"4px 12px"}}>+ Add Payment</Btn></div>
      {tPay.length===0?<div style={{color:C.td,fontSize:13}}>No payments recorded.</div>:(
        <div style={{overflowX:"auto",marginBottom:16}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:FB,fontSize:13}}>
          <thead><tr style={{borderBottom:`1px solid ${C.bd}`}}>{["Date","Amount","Method","Status","Notes",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:10,fontFamily:FN,color:C.td,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{tPay.slice().reverse().map(p=>(<tr key={p.id} style={{borderBottom:`1px solid ${C.bd}`}}>
            <td style={{padding:"8px 10px",color:C.tm}}>{new Date(p.date).toLocaleDateString()}</td>
            <td style={{padding:"8px 10px",color:C.gn,fontWeight:600}}>₪{parseFloat(p.amount).toLocaleString()}</td>
            <td style={{padding:"8px 10px",color:C.tm}}>{p.method}</td>
            <td style={{padding:"8px 10px"}}><Badge color={p.status==="Paid"?C.gn:p.status==="Overdue"?C.rd:C.or}>{p.status}</Badge></td>
            <td style={{padding:"8px 10px",color:C.td}}>{p.notes||"—"}</td>
            <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>
              <button onClick={()=>handleEditPay(p)} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",padding:2,fontSize:11,fontFamily:FN}}>✏</button>
              <button onClick={()=>handleDeletePay(p.id)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:2,fontSize:11,fontFamily:FN,marginLeft:6,opacity:0.6}}>✕</button>
            </td></tr>))}</tbody></table></div>)}
      <Modal open={showPayForm} onClose={()=>{setShowPayForm(false);setEditPayId(null);setPayForm({amount:"",method:"Bank Transfer",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"})}} title={editPayId?"Edit Payment":"Add Payment"}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Amount (₪)" type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} />
          <Select label="Method" options={PAYMENT_METHODS} value={payForm.method} onChange={v=>setPayForm({...payForm,method:v})} />
          <Input label="Date" type="date" value={payForm.date} onChange={e=>setPayForm({...payForm,date:e.target.value})} />
          <Select label="Status" options={PAYMENT_STATUSES} value={payForm.status} onChange={v=>setPayForm({...payForm,status:v})} />
          <div style={{gridColumn:"1 / -1"}}><Input label="Notes" value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})} /></div></div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          <Btn variant="ghost" onClick={()=>{setShowPayForm(false);setEditPayId(null);setPayForm({amount:"",method:"Bank Transfer",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"})}}>Cancel</Btn><Btn onClick={handleAddPayment}>{editPayId?"Update":"Save"}</Btn></div></Modal>
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Recent Workouts ({tw.length})</h3>
      {tw.length===0?<div style={{color:C.td,fontSize:13}}>No completed workouts.</div>:
        tw.slice().reverse().slice(0,10).map(w=><Card key={w.id} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontWeight:600,color:C.tx,fontSize:13}}>{w.dayName}</div><span style={{fontSize:12,color:C.tm}}>{new Date(w.date).toLocaleDateString()}</span></div></Card>)}

      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Progressive Overload</h3>
      <OverloadChart workouts={tw} exercises={exercises} />

      <Modal open={showAssign} onClose={()=>{setShowAssign(false);setPendingAssignPlan(null)}} title="Assign Program">
        {pendingAssignPlan && couple ? (
          <div style={{textAlign:'center',padding:12}}>
            <div style={{fontSize:13,color:C.tm,marginBottom:16}}>Assign to which member?</div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
              {td.members.map((m,mi)=>(
                <Btn key={mi} onClick={()=>assignPlan(pendingAssignPlan, trainee+'__'+mi)} style={{fontSize:13,padding:'8px 20px'}}>{m.name || `Member ${mi+1}`}</Btn>
              ))}
              <Btn variant="ghost" onClick={()=>assignPlan(pendingAssignPlan, trainee)} style={{fontSize:13,padding:'8px 20px'}}>Both (shared)</Btn>
            </div>
            <button onClick={()=>setPendingAssignPlan(null)} style={{background:'none',border:'none',color:C.td,cursor:'pointer',fontSize:11,marginTop:12}}>← Back to list</button>
          </div>
        ) : (
        (()=>{const unassigned=(planIndex||[]).filter(p=>!p.traineeId);const others=(planIndex||[]).filter(p=>p.traineeId&&p.traineeId!==trainee&&!p.traineeId.startsWith(trainee+'__'));const assignedNames=new Set(tp.map(p=>p.name));const available=[...unassigned,...others].filter(p=>!assignedNames.has(p.name)||p.traineeId!==trainee);
          return available.length===0?<div style={{color:C.td,fontSize:13,textAlign:'center',padding:20}}>No programs available. Create one in the Programs tab first.</div>:
          <div>{unassigned.length>0&&<><div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>UNASSIGNED</div>
            {unassigned.map(p=><div key={p.id} onClick={()=>handleAssignClick(p.id)} style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:8,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
              <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name}</div>
              <div style={{fontSize:11,color:C.tm}}>{p.dayCount||0} days · {p.exerciseCount||0} exercises</div></div>)}</>}
            {others.length>0&&<><div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8,marginTop:12}}>FROM OTHER CLIENTS (will duplicate)</div>
            {others.filter(p=>!assignedNames.has(p.name)).map(p=>{const owner=trainees.find(t=>t.id===p.traineeId);return <div key={p.id} onClick={()=>handleAssignClick(p.id)} style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:8,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
              <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name} <span style={{fontWeight:400,color:C.tm}}>— {owner?.name||'?'}</span></div>
              <div style={{fontSize:11,color:C.tm}}>{p.dayCount||0} days · {p.exerciseCount||0} exercises</div></div>})}</>}
          </div>})())}
      </Modal>
      {/* Unassign confirm */}
      {confirmUnassign && <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)"}} onClick={()=>{setConfirmUnassign(null);setUnassignTyped("")}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.rd}40`,borderRadius:12,width:380,padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.rd}}>Remove Program?</h3>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.tm}}>This will unassign <strong style={{color:C.tx}}>{plans.find(p=>p.id===confirmUnassign)?.name}</strong> from {td.name}.</p>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:"uppercase",fontFamily:FN,display:"block",marginBottom:4}}>Type "remove" to confirm</label>
            <input value={unassignTyped} onChange={e=>setUnassignTyped(e.target.value)} style={{background:C.sf2,border:`1px solid ${C.rd}40`,borderRadius:6,padding:"8px 12px",color:C.tx,fontFamily:FN,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"}} placeholder="remove" autoComplete="off" autoFocus/></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>{setConfirmUnassign(null);setUnassignTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>{if(unassignTyped.trim().toLowerCase()==="remove"){unassignPlan(confirmUnassign);setConfirmUnassign(null);setUnassignTyped("")}}} style={{opacity:unassignTyped.trim().toLowerCase()==="remove"?1:0.3,pointerEvents:unassignTyped.trim().toLowerCase()==="remove"?"auto":"none"}}>Remove</Btn></div></div></div>}

      {/* Edit trainee modal */}
      <Modal open={showEdit} onClose={()=>setShowEdit(false)} title={`Edit — ${td.name}`} wide>
        {editForm&&<>{couple && editForm._members ? <>
          {/* === COUPLE EDIT: shared fields === */}
          <div style={{fontSize:11,fontFamily:FN,color:C.td,textTransform:'uppercase',marginBottom:8}}>Shared</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <Input label="Couple Name" value={editForm.name||""} onChange={e=>setEditForm({...editForm,name:e.target.value})} />
            <Select label="Format" options={TRAINING_FORMATS} value={editForm.format||""} onChange={v=>setEditForm({...editForm,format:v})} />
            <Select label="Status" options={TRAINEE_STATUSES.filter(s=>s!=="Archived")} value={editForm.status||""} onChange={v=>setEditForm({...editForm,status:v})} />
            <Select label="Package" options={PACKAGE_TYPES} value={editForm.package||""} onChange={v=>setEditForm({...editForm,package:v})} />
            <Input label="Sessions Remaining" type="number" value={editForm.sessionsRemaining||0} onChange={e=>setEditForm({...editForm,sessionsRemaining:parseInt(e.target.value)||0})} />
            <Input label="Monthly (₪)" type="number" value={editForm.monthly||""} onChange={e=>setEditForm({...editForm,monthly:parseFloat(e.target.value)||0})} />
            <Input label="Per Session (₪)" type="number" value={editForm.perSession||""} onChange={e=>setEditForm({...editForm,perSession:parseFloat(e.target.value)||0})} />
            <Input label="Start Date" type="date" value={editForm.startDate||""} onChange={e=>setEditForm({...editForm,startDate:e.target.value})} />
            <Input label="Last Payment" type="date" value={editForm.lastPayment||""} onChange={e=>setEditForm({...editForm,lastPayment:e.target.value})} />
          </div>
          {/* === COUPLE EDIT: per-member fields === */}
          <div style={{display:'flex',gap:16}}>
            {editForm._members.map((m, mi) => {
              const upd = (field, val) => {
                const next = [...editForm._members];
                next[mi] = {...next[mi], [field]: val};
                setEditForm({...editForm, _members: next});
              };
              return (
                <div key={mi} style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontFamily:FN,color:C.ac,textTransform:'uppercase',marginBottom:8}}>Member {mi+1}</div>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    <Input label="Name" value={m.name||""} onChange={e=>upd('name',e.target.value)} />
                    <Input label="Email" value={m.email||""} onChange={e=>upd('email',e.target.value)} placeholder="email@example.com" />
                    <Input label="Phone" value={m.phone||""} onChange={e=>upd('phone',e.target.value)} placeholder="+972..." />
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                      <Input label="Age" type="number" value={m.age||""} onChange={e=>upd('age',e.target.value)} />
                      <Input label="Weight" type="number" value={m.weight||""} onChange={e=>upd('weight',e.target.value)} />
                      <Input label="Height" type="number" value={m.height||""} onChange={e=>upd('height',e.target.value)} />
                    </div>
                    <TextArea label="Injuries" value={m.injuries||""} onChange={e=>upd('injuries',e.target.value)} />
                    <TextArea label="Goals" value={m.goals||""} onChange={e=>upd('goals',e.target.value)} />
                    <TextArea label="Notes" value={m.notes||""} onChange={e=>upd('notes',e.target.value)} />
                  </div>
                </div>
              );
            })}
          </div>
        </> : <>
          {/* === SOLO EDIT (unchanged) === */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Name" value={editForm.name||""} onChange={e=>setEditForm({...editForm,name:e.target.value})} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FN }}>Email(s)</label>
            {(editForm._emails || emailsToArr(editForm.email)).map((em, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <input value={em} onChange={e => {
                  const next = [...(editForm._emails || emailsToArr(editForm.email))];
                  next[i] = e.target.value;
                  setEditForm({...editForm, _emails: next});
                }} placeholder="email@example.com" style={{ ...baseInput, flex: 1 }} />
                {arr.length > 1 && <button onClick={() => {
                  const next = [...arr]; next.splice(i, 1);
                  setEditForm({...editForm, _emails: next});
                }} style={{ background: C.rdD, border: 'none', borderRadius: 6, padding: '0 8px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
              </div>
            ))}
            {(editForm._emails || emailsToArr(editForm.email)).length < 3 && (
              <button onClick={() => {
                const next = [...(editForm._emails || emailsToArr(editForm.email)), ''];
                setEditForm({...editForm, _emails: next});
              }} style={{ background: 'none', border: `1px dashed ${C.bd}`, borderRadius: 6, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FB, fontSize: 11, fontWeight: 600 }}>+ Add Email</button>
            )}
          </div>
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
        </>}
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
