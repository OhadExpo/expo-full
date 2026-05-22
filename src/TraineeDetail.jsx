import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fmtPrettyDate } from './dates';
import { C, FN, FB, FH, uid, PAYMENT_STATUSES, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES } from './theme';

// Hebrew renders ~3px smaller than Nord at the same fontSize. Same
// helper applied to NotesWidget, PlansView, WorkoutReview,
// WorkoutsView. Used here for the couple/solo header strip + the
// per-member name column.
const isHebrew = (s) => /[֐-׿]/.test(s || '');
// Helper to pluralize day/ex counts consistently — "1 day" not "1 days".
const plur = (n, one, many) => `${n} ${n === 1 ? one : many}`;
import { Btn, Input, Select, TextArea, Badge, Card, Modal, EmailsInput, baseInput, isRefined5b, toast, confirmToast } from './ui';
import { savePlan } from './usePlansStore';
import { supabase } from './supabase';
import { normalizePhoneIL } from './whatsappButton';

// Bit deep link — duplicated from BillingView so the athlete page can
// generate share links without coupling to that file. Web link is the
// universal fallback; native scheme opens the Bit app on iOS/Android.
const bitDeepLink = (phone, amount, reference) => {
  const p = normalizePhoneIL(phone) || '';
  const a = Math.max(0, Math.round(Number(amount) || 0));
  const ref = encodeURIComponent(reference || '');
  return {
    web: `https://www.bitpay.co.il/app/me/${p}?amount=${a}&reference=${ref}`,
    native: `bit://payment-request?to=${p}&amount=${a}&reference=${ref}`,
  };
};
import OverloadChart from './OverloadChart';
import TraineePRsView from './TraineePRsView';
import TraineeCRM from './TraineeCRM';
import CoachMessages from './CoachMessages';
import CoachContractComposer from './CoachContractComposer';
import TraineeEvaluation from './TraineeEvaluation';
import { emailsToArr, emailsToStore, emailsDisplay, traineeIdsFor, subMemberId, sortProgramsChrono } from './traineeUtils';
import useAutosave, { autosaveStatusLabel } from './hooks/useAutosave';

export default function TraineeDetail({ trainee, trainees, setTrainees, planIndex, reloadPlanIndex, exercises, workouts, clientWorkouts, payments, addPayment, updatePayment, removePayment, bwLog, onBack, onOpenPlan, onPreviewPortal, onOpenTasksTab, onCreatePlanForTask, onOpenIntakeTab, portalVis, setPortalVis }) {
  const td = trainees.find(t=>t.id===trainee);
  // For couples: plans assigned to parent ID are shared, plans to sub-IDs are per-member
  const traineeIds = traineeIdsFor(trainee);
  const tp = (planIndex || []).filter(p => traineeIds.includes(p.traineeId));
  const tpMember = (mi) => tp.filter(p => p.traineeId === trainee || p.traineeId === subMemberId(trainee, mi));
  // Couples: workouts/payments may be recorded against either parent or sub-member IDs.
  const _allIds = new Set(traineeIds);
  const tw=workouts.filter(w=>_allIds.has(w.traineeId)&&w.status==="completed");
  const tPay=payments.filter(p=>_allIds.has(p.traineeId));
  // Portal-logged workouts (the trainee's own session logs from their portal).
  // We merge these with in-person `tw` for the Recent Workouts feed below —
  // without that merge, clients who train solo from the portal (Amit, Roey)
  // looked totally inactive in their detail view.
  const tcw = (clientWorkouts || []).filter(w => _allIds.has(w.clientId));
  const tAllWorkouts = [
    ...tw.map(w => ({ id: w.id, date: w.date, dayName: w.dayName, source: 'coach' })),
    ...tcw.map(w => ({ id: w.id, date: w.date, dayName: w.dayName || w.planName || 'Session', source: 'portal' })),
  ].sort((a,b) => new Date(b.date) - new Date(a.date));
  // Bodyweight log entries that belong to this trainee, oldest → newest so
  // the sparkline reads left-to-right as time-forward.
  const tBw = (bwLog || [])
    .filter(b => _allIds.has(b.clientId) && Number.isFinite(parseFloat(b.bw)))
    .map(b => ({ ...b, bw: parseFloat(b.bw) }))
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  const [showPayForm,setShowPayForm]=useState(false);
  const [showContract,setShowContract]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [showAssign,setShowAssign]=useState(false);
  const [pendingAssignPlan,setPendingAssignPlan]=useState(null); // for couple member picker
  const [pendingBlankCouple,setPendingBlankCouple]=useState(false); // START BLANK on a couple triggers a member picker before opening the editor
  const [confirmUnassign,setConfirmUnassign]=useState(null);
  const [unassignTyped,setUnassignTyped]=useState("");
  const [showArchiveConfirm,setShowArchiveConfirm]=useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm]=useState(false);
  const [deleteTyped,setDeleteTyped]=useState("");
  const [programSort,setProgramSort]=useState('chrono'); // 'chrono' | 'alpha'
  // sortProgramsChrono is the canonical newest-first program sort; lives
  // in traineeUtils.js so PlansView, ClientPortal, etc. share one definition.
  const handleArchive = () => { if(setTrainees) setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Archived",archivedAt:new Date().toISOString()}:t)); setShowArchiveConfirm(false); onBack(); };
  const handlePermanentDelete = () => { if(setTrainees) setTrainees(prev=>prev.filter(t=>t.id!==trainee)); setShowDeleteConfirm(false); setDeleteTyped(""); onBack(); };
  const [payForm,setPayForm]=useState({amount:"",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});
  const [editPayId,setEditPayId]=useState(null);
  // `td` may be briefly undefined while the parent re-fetches trainees.
  // Couple values that the hooks below need are nullable in that window;
  // guard expressions, then early-return after all hooks have registered.
  const couple = !!td && Array.isArray(td.members) && td.members.length === 2;
  const totalPaid=tPay.reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
  // "Last Payment" tile derives from the actual ledger (most-recent Paid row
  // in tPay, which is backed by bit_payment_requests). Falls back to the
  // legacy td.lastPayment field for trainees imported before the table
  // existed — so historical data still surfaces.
  const lastPaidDate = tPay.filter(p=>p.status==='Paid').map(p=>p.date).sort().pop() || td?.lastPayment || null;
  // Bit settings (coach phone) — needed to build deep links for "+ Request
  // via Bit" from this page. Fetched once; if blank, the button stays
  // disabled and points the coach to /coach/billing to configure.
  const [bitPhone, setBitPhone] = useState(null);
  const [showBitReq, setShowBitReq] = useState(false);
  const [bitReqAmount, setBitReqAmount] = useState('');
  const [bitReqRef, setBitReqRef] = useState('');
  useEffect(() => {
    let alive = true;
    supabase.from('coach_payment_settings').select('bit_phone').eq('coach_email','ohadyproductions@gmail.com').maybeSingle()
      .then(({ data }) => { if (alive) setBitPhone(data?.bit_phone || ''); });
    return () => { alive = false; };
  }, []);
  const openBitReq = () => {
    setBitReqAmount(td?.monthly ? String(td.monthly) : '');
    const m = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    setBitReqRef(`${m} — ${td?.name || ''}`.trim());
    setShowBitReq(true);
  };
  const handleCreateBitRequest = async () => {
    const amt = parseFloat(bitReqAmount);
    if (!amt || amt <= 0) { toast('Amount must be positive.', 'warn'); return; }
    if (!bitPhone) { toast('Configure your Bit phone in /coach/billing first.', 'warn'); return; }
    try {
      const { error } = await supabase.from('bit_payment_requests').insert({
        trainee_id: trainee,
        amount: amt,
        currency: 'ils',
        reference: bitReqRef.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast('Bit request created.', 'success');
      setShowBitReq(false);
      // Open the share link in a new tab so the coach can paste it to the
      // athlete immediately. The pending row will surface in the ledger
      // below via the useBitPayments realtime channel.
      const link = bitDeepLink(bitPhone, amt, bitReqRef.trim());
      try { window.open(link.web, '_blank', 'noopener'); } catch {}
    } catch (e) {
      toast(`Create failed: ${e?.message || e}`, 'error', { ttl: 6000 });
    }
  };
  const handleMarkBitPaid = async (id) => {
    if (!(await confirmToast('Mark this request as PAID? Only after the money has arrived on Bit.', { okLabel: 'Mark paid', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) toast(`Update failed: ${error.message}`, 'error');
  };
  const handleCancelBitReq = async (id) => {
    if (!(await confirmToast('Cancel this Bit request?', { okLabel: 'Cancel request', cancelLabel: 'Keep' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'canceled' }).eq('id', id);
    if (error) toast(`Update failed: ${error.message}`, 'error');
  };
  const statusColor={Active:C.gn,"On Hold":C.or,Inactive:C.td,Trial:C.ac};
  // Payments now write to bit_payment_requests via the hook callbacks
  // passed in from App.jsx. The `method` field on the form is informational —
  // all Bit-table rows are tagged method='Bit' on read. The `status` field is
  // mapped: 'Paid' / 'Pending' / 'Canceled' → the DB enum.
  const handleAddPayment=async()=>{
    if(!payForm.amount)return;
    try{
      if(editPayId){
        await updatePayment(editPayId, { amount: payForm.amount, date: payForm.date, notes: payForm.notes, status: payForm.status });
        setEditPayId(null);
      } else {
        await addPayment({ traineeId: trainee, amount: payForm.amount, date: payForm.date, notes: payForm.notes });
      }
    }catch(err){ console.warn('payment write failed:', err.message); }
    setPayForm({amount:"",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});
    setShowPayForm(false);
  };
  const handleEditPay=(p)=>{setPayForm({amount:p.amount,date:p.date,notes:p.notes||"",status:p.status});setEditPayId(p.id);setShowPayForm(true)};
  const handleDeletePay=async(pid)=>{ try { await removePayment(pid); } catch(err) { console.warn('payment delete failed:', err.message); } };
  // Edit-modal draft key — shared between the modal child and the parent
  // (the child autosaves the draft, the parent commits the trainee on save).
  // The modal itself owns editForm + useAutosave so per-keystroke
  // re-renders stay inside the modal subtree instead of redrawing the
  // entire TraineeDetail tree (cards, tables, programs, charts, eval, CRM,
  // messages). Profiling-friendly perf win for a heavy page.
  const draftKey = useMemo(() => `expo-edit-trainee-${trainee}`, [trainee]);
  const openEdit = useCallback(() => setShowEdit(true), []);
  const handleSaveEdit = useCallback((toSave) => {
    if (!toSave?.name) return;
    setTrainees(prev => prev.map(t => t.id === trainee ? { ...t, ...toSave } : t));
    setShowEdit(false);
  }, [setTrainees, trainee]);
  const handleCloseEdit = useCallback(() => setShowEdit(false), []);
  // All hooks have now registered — safe to bail out if the parent's prop
  // is briefly null (trainees re-fetch race). Without this guard placement,
  // a transient `!td` would shrink the hook list and crash on the next render.
  if (!td) return null;
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
  // Toggle all visibility keys in one setState. visible=false hides everything; true shows.
  const bulkSetVis = (plans, keyFn, visible) => {
    const next = { ...portalVis };
    plans.forEach(p => { next[keyFn(p)] = visible; });
    setPortalVis(next);
  };
  const anyVisible = (plans, keyFn) => plans.some(p => portalVis?.[keyFn(p)] !== false);
  // Pin only the most recent block (chronological tip). For an athlete with
  // 17+ historical blocks this is the one-click "tidy the portal" we'd
  // otherwise have to do by toggling each block off by hand.
  const bulkOnlyCurrent = (plans, keyFn) => {
    if (plans.length === 0) return;
    const sorted = [...plans].sort(sortProgramsChrono);
    const current = sorted[0];
    const next = { ...portalVis };
    plans.forEach(p => { next[keyFn(p)] = p === current; });
    setPortalVis(next);
  };
  const bulkToggleBtn = (plans, keyFn) => {
    if (plans.length === 0) return null;
    const showing = anyVisible(plans, keyFn);
    return (
      <div style={{display:'flex',gap:6,alignItems:'stretch'}}>
        {plans.length > 1 && <button onClick={()=>bulkOnlyCurrent(plans, keyFn)}
          title="Hide all blocks except the most recent one"
          style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:32,padding:"0 12px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center'}}>
          🎯 ONLY CURRENT
        </button>}
        <button onClick={()=>bulkSetVis(plans, keyFn, !showing)}
          title={showing ? "Hide all from portal" : "Show all on portal"}
          style={{background:'var(--c-sf)',border:`1px solid ${showing?C.rd:C.gn}`,borderRadius:0,height:32,padding:"0 12px",color:showing?C.rd:C.gn,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center'}}>
          {showing ? 'HIDE ALL' : 'SHOW ALL'}
        </button>
      </div>
    );
  };

  // Helper: render a member column (body stats, injuries, goals, optionally programs)
  const renderMemberColumn = (m, mi, showPrograms = true) => {
    const memberPlans = tpMember(mi);
    const sorted = [...memberPlans].sort((a,b)=>programSort==='alpha'?a.name.localeCompare(b.name):sortProgramsChrono(a,b));
    const memberVisKey = (p) => `${td.name}:${p.name}:m${mi}`;
    return (
      <div style={{flex:1,minWidth:0}}>
        <Card style={{marginBottom:8}}
          header={<span style={{display:'inline-flex',alignItems:'baseline',gap:10,fontWeight:700,fontSize:14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{m.name}<span style={{fontSize:10,opacity:0.78,letterSpacing:'0.02em',textTransform:'none',fontWeight:500}}>{emailsDisplay(m.email)}{m.phone?` · ${m.phone}`:''}</span></span>}>
          {!isRefined5b() && (
            <div style={{textAlign:'center',marginBottom:10}}>
              <div style={{fontSize:18,fontWeight:700,color:C.tx,fontFamily:FN}}>{m.name}</div>
              <div style={{fontSize:12,color:C.tm,marginTop:2}}>{emailsDisplay(m.email)}{m.phone?` · ${m.phone}`:''}</div>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,textAlign:'center'}}>
            {[['Age',m.age||'—'],['Weight',m.weight?`${m.weight}kg`:'—'],['Height',m.height?`${m.height}cm`:'—']].map(([l,v])=>
              <div key={l}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
          </div>
          {m.injuries&&<div style={{marginTop:10,padding:8,background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Injuries</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(m.injuries)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(m.injuries)?FH:undefined}}>{m.injuries}</div></div>}
          {m.goals&&<div style={{marginTop:6,padding:8,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Goals</div><div style={{fontSize:13,color:C.tx,textAlign:'center'}}>{m.goals}</div></div>}
          {m.notes&&<div style={{marginTop:6,padding:8,background:'var(--c-sf)',border:`1px solid ${C.bd}`,borderRadius:0}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700,marginBottom:4,textAlign:'center'}}>Notes</div><div style={{fontSize:13,color:C.tm,textAlign:'center'}}>{m.notes}</div></div>}
        </Card>
        {showPrograms && <>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'12px 0 6px',gap:8}}>
          <div style={{fontSize:12,fontFamily:FN,color:C.tm,fontWeight:600}}>{m.name} — PROGRAMS ({sorted.length})</div>
          {bulkToggleBtn(sorted, memberVisKey)}
        </div>
        {sorted.length===0?<div style={{color:C.td,fontSize:12}}>No programs assigned.</div>:
          sorted.map(p=>{const visKey=memberVisKey(p);const isVis=portalVis?.[visKey]!==false;return(
            <Card key={p.id} style={{marginBottom:6,padding:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}>
                  <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name}</div>
                  <div style={{fontSize:11,color:C.tm,marginTop:2}}>{plur(p.dayCount||0, 'day', 'days')} · {plur(p.exerciseCount||0, 'ex', 'ex')}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={e=>{e.stopPropagation();setConfirmUnassign(p.id);setUnassignTyped("")}} style={{background:'none',border:'none',color:C.rd,cursor:'pointer',fontSize:11,fontFamily:FN,opacity:0.6,padding:2}}>✕</button>
                  <button onClick={e=>{e.stopPropagation();const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                    <div style={{width:28,height:16,borderRadius:8,background:isVis?'rgba(46,213,115,0.251)':C.sf3,border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:12,height:12,borderRadius:6,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?14:1,transition:'all .15s'}}/></div>
                  </button>
                </div>
              </div>
            </Card>)})}
        </>}
      </div>
    );
  };

  // Helper: render programs list for solo trainees (existing layout)
  const renderProgramsList = () => {
    const sorted = [...tp].sort((a,b)=>programSort==='alpha'?a.name.localeCompare(b.name):sortProgramsChrono(a,b));
    return sorted.map(p=>{const visKey=`${td.name}:${p.name}`;const isVis=portalVis?.[visKey]!==false;return <Card key={p.id} style={{marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{flex:1,cursor:'pointer'}} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}><div style={{fontWeight:600,color:C.tx}}>{p.name}</div><div style={{fontSize:12,color:C.tm,marginTop:2}}>{plur(p.dayCount||0, 'day', 'days')} · {plur(p.exerciseCount||0, 'exercise', 'exercises')}</div></div><div style={{display:'flex',alignItems:'center',gap:10}}><button onClick={e=>{e.stopPropagation();setConfirmUnassign(p.id);setUnassignTyped("")}} title="Remove program" style={{background:'none',border:'none',color:C.rd,cursor:'pointer',fontSize:11,fontFamily:FN,opacity:0.6,padding:2}}>✕</button><button onClick={e=>{e.stopPropagation();const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} title={isVis?"Visible on portal — click to hide":"Hidden from portal — click to show"} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><div style={{width:36,height:20,borderRadius:10,background:isVis?'rgba(46,213,115,0.251)':C.sf3,border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:16,height:16,borderRadius:8,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?18:1,transition:'all .15s'}}/></div><span style={{fontSize:10,fontFamily:FN,color:isVis?C.gn:C.td,minWidth:32}}>{isVis?'ON':'OFF'}</span></button><span onClick={()=>onOpenPlan&&onOpenPlan(p.id)} style={{color:C.ac,fontSize:12,cursor:'pointer'}}>Open →</span></div></div></Card>});
  };

  return (
    <div>
      {/* Couples-layout responsive stacking. The two member cards sit
          side-by-side on tablet+ (gap:12, vertical hairline divider). On a
          phone the row is too narrow for that — body stats labels truncate,
          program names wrap awkwardly. Below 720px we flip to flex-direction
          column and turn the 1px-wide vertical divider into a 1px-tall
          horizontal line so the two members stack cleanly with the same
          visual separation. Nothing is hidden — all stats, injuries, goals,
          notes, and program lists stay visible, just one above the other. */}
      <style>{`
        @media (max-width: 720px) {
          .td-couple-row { flex-direction: column; }
          .td-couple-divider { width: 100% !important; height: 1px !important; align-self: stretch; }
        }
      `}</style>
      {/* Back + actions bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:13,padding:0}}>← Back to Athletes</button>
        <div style={{display:"flex",gap:6}}>
          {/* Notifications on/off — per-athlete mute for the COACH side.
              When OFF, athlete→coach messages and workout-complete events
              from this athlete skip push delivery, and the dashboard
              MessagesCard unread count excludes this athlete. The athlete's
              own notifications (coach messages, missed-day cron) are
              unaffected. State persisted on the trainee object so it syncs
              across coach devices via the trainees store. */}
          <button
            onClick={() => { if (setTrainees) setTrainees(prev => prev.map(t => t.id === trainee ? { ...t, notifOff: !t.notifOff } : t)); }}
            title={td.notifOff ? 'Notifications muted for this athlete — click to unmute' : 'Notifications on — click to mute push + dashboard alerts about this athlete'}
            style={{
              background: 'transparent',
              border: `1px solid ${td.notifOff ? C.cardBd : C.ac}`,
              color: td.notifOff ? C.td : C.ac,
              fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              padding: '4px 10px', cursor: 'pointer', borderRadius: 0,
            }}>
            {td.notifOff ? '🔕 MUTED' : '🔔 ON'}
          </button>
          {onPreviewPortal && <Btn variant="ghost" onClick={onPreviewPortal} style={{fontSize:11,padding:"4px 10px"}} title="Open this athlete's portal in preview mode">PORTAL</Btn>}
          <Btn variant="ghost" onClick={openEdit} style={{fontSize:11,padding:"4px 10px"}}>✏ Edit</Btn>
          {td.status==="Archived" ? <>
            <Btn variant="ghost" onClick={()=>{if(setTrainees)setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Inactive",archivedAt:undefined}:t));onBack()}} style={{fontSize:11,padding:"4px 10px"}}>↩ Restore</Btn>
            <Btn variant="danger" onClick={()=>setShowDeleteConfirm(true)} style={{fontSize:11,padding:"4px 10px"}}>Permanently Delete</Btn>
          </> : <Btn variant="danger" onClick={()=>setShowArchiveConfirm(true)} style={{fontSize:11,padding:"4px 10px"}}>📦 Archive</Btn>}
        </div></div>

      {/* === COUPLE LAYOUT === */}
      {couple ? <>
        {/* Shared billing bar */}
        <Card style={{marginBottom:12,textAlign:'center'}}
          header={(() => {
            const heb = isHebrew(td.name);
            return <span style={{display:'inline-flex',alignItems:'center',gap:8,fontWeight:700,fontSize:heb?16:13,fontFamily:heb?FH:undefined,letterSpacing:heb?0:'0.04em',textTransform:heb?'none':'uppercase'}}>{td.name} · Shared · {td.format}</span>;
          })()}
          headerRight={<Badge color={statusColor[td.status]} style={isRefined5b()?{background:'#FFFFFF'}:undefined}>{td.status}</Badge>}>
          {!isRefined5b() && (
            <div style={{fontSize:12,color:C.tm,fontFamily:FN,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:8}}>
              Shared · {td.format} · <Badge color={statusColor[td.status]}>{td.status}</Badge>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))',gap:10}}>
            {[['Package',td.package],['Sessions Left',td.sessionsRemaining],['Monthly',td.monthly?`₪${td.monthly}`:'—'],['Per Session',td.perSession?`₪${td.perSession}`:'—'],['Last Payment',fmtPrettyDate(lastPaidDate)],['Since',fmtPrettyDate(td.startDate)],['Workouts',tAllWorkouts.length]].map(([l,v])=>
              <div key={l}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
          </div>
        </Card>

        {/* Two-column member split — body stats / injuries / goals only.
            Programs render at the bottom of the page (after Overload chart),
            grouped per member, instead of inline inside each column. */}
        <div className="td-couple-row" style={{display:'flex',gap:12}}>
          {renderMemberColumn(td.members[0], 0, false)}
          <div className="td-couple-divider" style={{width:1,background:`${C.cardBd}`,alignSelf:'stretch',flexShrink:0}} />
          {renderMemberColumn(td.members[1], 1, false)}
        </div>
      </> : <>

      {/* === SOLO LAYOUT === */}
      <Card style={{marginBottom:8,position:"relative"}}
        header={<span style={{display:'inline-flex',alignItems:'baseline',gap:10,fontWeight:700,fontSize:14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{td.name}<span style={{fontSize:11,opacity:0.78,letterSpacing:'0.02em',textTransform:'none',fontWeight:500}}>{Array.isArray(td.email)?td.email.join(', '):(td.email||'')}{td.phone?` · ${td.phone}`:""}</span></span>}
        headerRight={<Badge color={statusColor[td.status]} style={isRefined5b()?{background:'#FFFFFF'}:undefined}>{td.status}</Badge>}>
        {!isRefined5b() && (
          <>
            <div style={{textAlign:"center"}}><h2 style={{margin:0,fontFamily:FN,fontSize:20,color:C.tx}}>{td.name}</h2>
              <div style={{color:C.tm,fontSize:13,marginTop:4}}>{Array.isArray(td.email)?td.email.join(', '):(td.email||'')}{td.phone?` · ${td.phone}`:""}</div></div>
            <div style={{display:"flex",alignItems:"center",gap:8,position:"absolute",right:16,top:16}}>
              <Badge color={statusColor[td.status]}>{td.status}</Badge></div>
          </>
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:12,marginTop:isRefined5b()?0:16,textAlign:"center"}}>
          {[["Format",td.format],["Package",td.package],["Sessions Left",td.sessionsRemaining],["Monthly",td.monthly?`₪${td.monthly}`:"—"],["Per Session",td.perSession?`₪${td.perSession}`:"—"],["Last Payment",fmtPrettyDate(lastPaidDate)],["Since",fmtPrettyDate(td.startDate)],["Workouts",tAllWorkouts.length]].map(([l,v])=>
            <div key={l}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
        </div>
      </Card>
      </>}

      {/* Page section order (Ohad spec 2026-05-16, v3):
            Header → VITALS → BILLING → MESSAGES → CRM → BODYWEIGHT →
            WORKOUTS → PROGRAMS → ATHLETIC EVAL → OVERLOAD → RECORDS.
          Vitals leads (most-asked "what is going on with this client?"
          after the header); Billing + Messages cluster the day-to-day
          interactions; CRM + Bodyweight surface signals; Workouts /
          Programs / Eval / Overload / Records anchor the historical
          tail. Couples render vitals inside the member columns above;
          the !couple gate skips the duplicate card. */}

      {/* === VITALS · INJURIES · GOALS — slot #2, solo only (couples
          render this inside the member columns above). */}
      {!couple && (
        <Card style={{marginBottom:16}}
          header={<span style={{fontWeight:700,fontSize:13,letterSpacing:'0.04em',textTransform:'uppercase'}}>Vitals · Injuries · Goals</span>}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12,textAlign:"center"}}>
            {[["Age",td.age||"—"],["Weight",td.weight?`${td.weight}kg`:"—"],["Height",td.height?`${td.height}cm`:"—"]].map(([l,v])=>
              <div key={l}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700,textAlign:"center"}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2,textAlign:"center"}}>{v}</div></div>)}
          </div>
          {td.injuries&&<div style={{marginTop:12,padding:10,background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Injuries / Conditions</div><div style={{fontSize:13,color:C.tx,direction:/[֐-׿]/.test(td.injuries)?'rtl':'ltr',textAlign:'center',fontFamily:/[֐-׿]/.test(td.injuries)?FH:undefined}}>{td.injuries}</div></div>}
          {td.goals&&<div style={{marginTop:8,padding:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Goals</div><div style={{fontSize:13,color:C.tx,direction:/[֐-׿]/.test(td.goals)?'rtl':'ltr',textAlign:'center',fontFamily:/[֐-׿]/.test(td.goals)?FH:undefined}}>{td.goals}</div></div>}
          {td.notes&&<div style={{marginTop:8,padding:10,background:'var(--c-sf)',border:`1px solid ${C.bd}`,borderRadius:0}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700,marginBottom:4,textAlign:"center"}}>Notes</div><div style={{fontSize:13,color:C.tm,direction:/[֐-׿]/.test(td.notes)?'rtl':'ltr',textAlign:'center',fontFamily:/[֐-׿]/.test(td.notes)?FH:undefined}}>{td.notes}</div></div>}
        </Card>
      )}

      {/* === BILLING — slot #3, right after Header. */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"20px 0 12px",gap:8,flexWrap:'wrap'}}>
        <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:0}}>Billing ({tPay.length}){totalPaid>0&&<span style={{color:C.gn,marginLeft:8}}>₪{totalPaid.toLocaleString()} total paid</span>}</h3>
        <div style={{display:'flex',gap:6}}>
          {/* F-27 — open the brand-rich contract composer; on send,
              copy the /sign/<token> link to clipboard. */}
          <button onClick={()=>setShowContract(true)} style={{background:'transparent',border:`1px solid ${C.ac}`,color:C.ac,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',padding:'4px 12px',cursor:'pointer',borderRadius:0}}>📄 CONTRACT</button>
          {/* "+ Request via Bit" — creates a pending row in bit_payment_requests
              and opens the Bit share link in a new tab so the coach can ping
              the athlete without leaving this page. Disabled until the coach
              has configured their Bit phone in /coach/billing (tooltip nudges
              there). The pending row surfaces in the ledger below via the
              useBitPayments realtime channel. */}
          <button onClick={openBitReq}
            disabled={!bitPhone}
            title={bitPhone ? 'Create a Bit payment request for this athlete' : 'Configure your Bit phone in /coach/billing first'}
            style={{background:'transparent',border:`1px solid ${bitPhone?C.ac:C.cardBd}`,color:bitPhone?C.ac:C.td,fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.12em',padding:'4px 12px',cursor:bitPhone?'pointer':'not-allowed',borderRadius:0}}>📲 REQUEST VIA BIT</button>
          <Btn onClick={()=>setShowPayForm(true)} style={{fontSize:12,padding:"4px 12px"}}>+ Add Payment</Btn>
        </div>
      </div>
      {tPay.length===0?<div style={{color:C.td,fontSize:13}}>No payments recorded.</div>:(
        <div style={{overflowX:"auto",marginBottom:16}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:FB,fontSize:13}}>
          <thead><tr style={{borderBottom:`1px solid ${C.cardBd}`}}>{["Date","Amount","Method","Status","Notes",""].map(h=><th key={h} style={{textAlign:"center",padding:"6px 10px",fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700}}>{h}</th>)}</tr></thead>
          <tbody>{tPay.slice().reverse().map(p=>(<tr key={p.id} style={{borderBottom:`1px solid ${C.cardBd}`}}>
            <td style={{padding:"8px 10px",color:C.tm,textAlign:"center"}}>{fmtPrettyDate(p.date)}</td>
            <td style={{padding:"8px 10px",color:C.gn,fontWeight:600,textAlign:"center"}}>₪{parseFloat(p.amount).toLocaleString()}</td>
            <td style={{padding:"8px 10px",color:C.tm,textAlign:"center"}}>{p.method}</td>
            <td style={{padding:"8px 10px",textAlign:"center"}}><Badge color={p.status==="Paid"?C.gn:p.status==="Overdue"?C.rd:C.or}>{p.status}</Badge></td>
            <td style={{padding:"8px 10px",color:C.td,textAlign:"center"}}>{p.notes||"—"}</td>
            <td style={{padding:"8px 10px",whiteSpace:"nowrap",textAlign:"center"}}>
              {/* Pending Bit rows need actionable buttons inline so the
                  coach doesn't have to bounce to /coach/billing. Share
                  opens the Bit web link; Paid / Cancel mutate
                  bit_payment_requests and propagate back via realtime. */}
              {p.status==='Pending' && bitPhone && (() => {
                const link = bitDeepLink(bitPhone, p.amount, p.notes);
                return (<>
                  <a href={link.web} target="_blank" rel="noopener noreferrer" title="Open Bit share link"
                    style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',color:C.ac,border:`1px solid ${C.ac}`,textDecoration:'none',marginRight:6}}>SHARE</a>
                  <button onClick={()=>handleMarkBitPaid(p.id)} title="Mark this Bit request as paid"
                    style={{background:'transparent',border:`1px solid ${C.gn}`,color:C.gn,padding:'2px 8px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer',marginRight:6}}>✓ PAID</button>
                  <button onClick={()=>handleCancelBitReq(p.id)} title="Cancel this Bit request"
                    style={{background:'transparent',border:`1px solid ${C.rd}`,color:C.rd,padding:'2px 8px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer',marginRight:6}}>× CANCEL</button>
                </>);
              })()}
              <button onClick={()=>handleEditPay(p)} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",padding:2,fontSize:11,fontFamily:FN}}>✏</button>
              <button onClick={()=>handleDeletePay(p.id)} style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:2,fontSize:11,fontFamily:FN,marginLeft:6,opacity:0.6}}>✕</button>
            </td></tr>))}</tbody></table></div>)}
      {showContract && (
        <CoachContractComposer
          trainee={trainee}
          coachEmail="ohadyproductions@gmail.com"
          onClose={() => setShowContract(false)}
        />
      )}
      <Modal open={showPayForm} onClose={()=>{setShowPayForm(false);setEditPayId(null);setPayForm({amount:"",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"})}} title={editPayId?"Edit Payment":"Add Payment"}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Input label="Amount (₪)" type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} />
          <Input label="Date" type="date" value={payForm.date} onChange={e=>setPayForm({...payForm,date:e.target.value})} />
          <Select label="Status" options={PAYMENT_STATUSES} value={payForm.status} onChange={v=>setPayForm({...payForm,status:v})} />
          <div style={{gridColumn:"1 / -1"}}><Input label="Notes" value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})} /></div></div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          <Btn variant="ghost" onClick={()=>{setShowPayForm(false);setEditPayId(null);setPayForm({amount:"",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"})}}>Cancel</Btn><Btn onClick={handleAddPayment}>{editPayId?"Update":"Save"}</Btn></div></Modal>

      {/* + REQUEST VIA BIT modal — inserts a pending row into
          bit_payment_requests and opens the share link. */}
      <Modal open={showBitReq} onClose={()=>setShowBitReq(false)} title="New Bit Request">
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12}}>
          <Input label="Amount (₪)" type="number" value={bitReqAmount} onChange={e=>setBitReqAmount(e.target.value)} />
          <Input label="Reference" value={bitReqRef} onChange={e=>setBitReqRef(e.target.value)} placeholder="May 2026 — 8 sessions" />
        </div>
        <div style={{fontSize:11,color:C.td,marginTop:10,lineHeight:1.5}}>
          Submits a pending row to <code>bit_payment_requests</code> and opens the Bit share link in a new tab. Mark paid from this page once the money arrives.
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          <Btn variant="ghost" onClick={()=>setShowBitReq(false)}>Cancel</Btn>
          <Btn onClick={handleCreateBitRequest}>Create request</Btn>
        </div>
      </Modal>

      {/* === MESSAGES — slot #4: athlete↔coach thread, lifted from
          inside TraineeCRM to its own top-level slot. */}
      {td && <CoachMessages
        traineeId={trainee}
        role="coach"
        recipientEmail={Array.isArray(td.email) ? td.email.find(e => typeof e === 'string' && e.trim()) : td.email}
        senderLabel="Ohad" />}

      {/* === CRM — slot #5: cadence pill, next actions, activity feed */}
      {td && (
        <TraineeCRM
          trainee={td}
          clientWorkouts={clientWorkouts}
          payments={tPay}
          planIndex={tp}
          onOpenTasksTab={onOpenTasksTab}
          onCreatePlanForTask={onCreatePlanForTask}
          onOpenIntakeTab={onOpenIntakeTab}
        />
      )}

      {/* === BODYWEIGHT — slot #6 */}
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Bodyweight ({tBw.length})</h3>
      <BWChart entries={tBw} />

      {/* === WORKOUTS — slot #7 */}
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Recent Workouts ({tAllWorkouts.length})</h3>
      {tAllWorkouts.length===0?<div style={{color:C.td,fontSize:13}}>No completed workouts.</div>:
        tAllWorkouts.slice(0,10).map(w=><Card key={`${w.source}-${w.id}`} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><span style={{fontWeight:600,color:C.tx,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.dayName}</span></div><span style={{fontSize:12,color:C.tm,flexShrink:0}}>{fmtPrettyDate(w.date)}</span></div></Card>)}

      {/* === ASSIGNED PROGRAMS — slot #8 */}
      {couple ? <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"28px 0 12px"}}>
          <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:0}}>Assigned Programs ({tp.length})</h3>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={()=>setProgramSort(s=>s==='chrono'?'alpha':'chrono')} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:32,padding:"0 12px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center'}}>{programSort==='chrono'?'↕ DATE':'↕ A→Z'}</button>
            <button onClick={()=>setShowAssign(true)} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:32,padding:"0 14px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',whiteSpace:'nowrap',textTransform:'uppercase'}}>+ New Program</button>
          </div>
        </div>
        <div className="td-couple-row" style={{display:'flex',gap:12}}>
          {[0,1].map(mi => {
            const m = td.members[mi];
            const memberPlans = tpMember(mi);
            const sorted = [...memberPlans].sort((a,b)=>programSort==='alpha'?a.name.localeCompare(b.name):sortProgramsChrono(a,b));
            const memberVisKey = (p) => `${td.name}:${p.name}:m${mi}`;
            return (
              <React.Fragment key={mi}>
                {mi === 1 && <div className="td-couple-divider" style={{width:1,background:`${C.cardBd}`,alignSelf:'stretch',flexShrink:0}} />}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'6px 0',gap:8}}>
                    <div style={{fontSize:12,fontFamily:FN,color:C.tm,fontWeight:600}}>{m.name} — {sorted.length}</div>
                    {bulkToggleBtn(sorted, memberVisKey)}
                  </div>
                  {sorted.length===0?<div style={{color:C.td,fontSize:12}}>No programs assigned.</div>:
                    sorted.map(p=>{const visKey=memberVisKey(p);const isVis=portalVis?.[visKey]!==false;return(
                      <Card key={p.id} style={{marginBottom:6,padding:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{flex:1,cursor:'pointer'}} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}>
                            <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name}</div>
                            <div style={{fontSize:11,color:C.tm,marginTop:2}}>{plur(p.dayCount||0, 'day', 'days')} · {plur(p.exerciseCount||0, 'ex', 'ex')}</div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <button onClick={e=>{e.stopPropagation();setConfirmUnassign(p.id);setUnassignTyped("")}} style={{background:'none',border:'none',color:C.rd,cursor:'pointer',fontSize:11,fontFamily:FN,opacity:0.6,padding:2}}>✕</button>
                            <button onClick={e=>{e.stopPropagation();const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                              <div style={{width:28,height:16,borderRadius:8,background:isVis?'rgba(46,213,115,0.251)':C.sf3,border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`,position:'relative',transition:'all .15s'}}><div style={{width:12,height:12,borderRadius:6,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?14:1,transition:'all .15s'}}/></div>
                            </button>
                          </div>
                        </div>
                      </Card>)})}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </> : <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"28px 0 12px"}}>
          <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:0}}>Assigned Programs ({tp.length})</h3>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {bulkToggleBtn(tp, (p)=>`${td.name}:${p.name}`)}
            <button onClick={()=>setProgramSort(s=>s==='chrono'?'alpha':'chrono')} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:32,padding:"0 12px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center'}}>{programSort==='chrono'?'↕ DATE':'↕ A→Z'}</button>
            <button onClick={()=>setShowAssign(true)} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:32,padding:"0 14px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',whiteSpace:'nowrap',textTransform:'uppercase'}}>+ New Program</button>
          </div>
        </div>
        {tp.length===0?<div style={{color:C.td,fontSize:13}}>No programs assigned.</div>:renderProgramsList()}
      </>}

      {/* === ATHLETIC EVALUATION — slot #9 */}
      {td && <TraineeEvaluation trainee={td} />}

      {/* === OVERLOAD — slot #10 */}
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Progressive Overload</h3>
      <OverloadChart workouts={tw} exercises={exercises} />

      {/* === RECORDS — slot #11. tcw is already filtered to this
          athlete (incl. couple sub-members) so no extra traineeId filter
          is needed; couples → parent + __0 + __1 surface combined. */}
      <h3 style={{fontFamily:FN,fontSize:14,color:C.tm,margin:"20px 0 12px"}}>Records</h3>
      <TraineePRsView clientWorkouts={tcw} embedded />


      <Modal open={showAssign} onClose={()=>{setShowAssign(false);setPendingAssignPlan(null);setPendingBlankCouple(false)}} title={`+ New Program for ${td.name}`}>
        {pendingAssignPlan && couple ? (
          <div style={{textAlign:'center',padding:12}}>
            <div style={{fontSize:13,color:C.tm,marginBottom:16}}>Assign to which member?</div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
              {td.members.map((m,mi)=>(
                <Btn key={mi} onClick={()=>assignPlan(pendingAssignPlan, subMemberId(trainee, mi))} style={{fontSize:13,padding:'8px 20px'}}>{m.name || `Member ${mi+1}`}</Btn>
              ))}
            </div>
            <button onClick={()=>setPendingAssignPlan(null)} style={{background:'none',border:'none',color:C.td,cursor:'pointer',fontSize:11,marginTop:12}}>← Back to list</button>
          </div>
        ) : pendingBlankCouple && couple ? (
          <div style={{textAlign:'center',padding:12}}>
            <div style={{fontSize:13,color:C.tm,marginBottom:16}}>Start blank for which member?</div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
              {td.members.map((m,mi)=>(
                <Btn key={mi} onClick={async ()=>{
                  // Per [[couples-one-plan-per-member]]: blank plans land
                  // on the sub-member id, never the parent. Picker stashes
                  // the sub-id and routes to /coach/programs editor.
                  const subId = subMemberId(trainee, mi);
                  try {
                    const { setPendingTaskPlanLink } = await import('./coachNotes');
                    setPendingTaskPlanLink({ taskId: null, traineeId: subId, traineeLabel: m.name || `${td.name} (${mi+1})`, taskBody: '' });
                  } catch {}
                  setShowAssign(false);
                  setPendingBlankCouple(false);
                  if (onCreatePlanForTask) onCreatePlanForTask(subId);
                }} style={{fontSize:13,padding:'8px 20px'}}>{m.name || `Member ${mi+1}`}</Btn>
              ))}
            </div>
            <button onClick={()=>setPendingBlankCouple(false)} style={{background:'none',border:'none',color:C.td,cursor:'pointer',fontSize:11,marginTop:12}}>← Back to list</button>
          </div>
        ) : (
        (()=>{const unassigned=(planIndex||[]).filter(p=>!p.traineeId);const others=(planIndex||[]).filter(p=>p.traineeId&&!traineeIds.includes(p.traineeId));const assignedNames=new Set(tp.map(p=>p.name));
          // "Start blank" path — stashes a pending handoff via the same
          // mechanism the dashboard task → new-program flow uses, then
          // routes the coach to the Programs tab editor. For couples the
          // handoff goes through a member picker first so the new plan
          // lands on the right sub-member id, not the parent.
          const startBlankForTrainee = async () => {
            if (couple) { setPendingBlankCouple(true); return; }
            try {
              const { setPendingTaskPlanLink } = await import('./coachNotes');
              setPendingTaskPlanLink({ taskId: null, traineeId: trainee, traineeLabel: td.name, taskBody: '' });
            } catch {}
            setShowAssign(false);
            if (onCreatePlanForTask) onCreatePlanForTask(trainee);
          };
          return (
          <div>
            <div onClick={startBlankForTrainee}
              style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,padding:'12px 14px',marginBottom:12,cursor:'pointer',transition:'background .15s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(57,189,255,0.094)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--c-sf)'}>
              <div style={{fontWeight:700,color:C.ac,fontSize:13,fontFamily:FN,letterSpacing:'0.04em'}}>+ START BLANK PROGRAM</div>
              <div style={{fontSize:11,color:C.tm,marginTop:2}}>Empty editor for {td.name} — pick name, days, exercises.</div>
            </div>
            {(unassigned.length>0 || others.length>0) && (
              <div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700,marginBottom:8}}>OR ASSIGN EXISTING</div>
            )}
            {unassigned.length>0 && <>
              <div style={{fontSize:9,fontFamily:FN,color:C.td,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700,marginBottom:6}}>FROM LIBRARY (UNASSIGNED)</div>
              {unassigned.map(p=><div key={p.id} onClick={()=>handleAssignClick(p.id)} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=C.cardBd}>
                <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name}</div>
                <div style={{fontSize:11,color:C.tm}}>{plur(p.dayCount||0, 'day', 'days')} · {plur(p.exerciseCount||0, 'exercise', 'exercises')}</div></div>)}
            </>}
            {others.length>0 && <>
              <div style={{fontSize:9,fontFamily:FN,color:C.td,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700,marginBottom:6,marginTop:12}}>DUPLICATE FROM ANOTHER ATHLETE</div>
              {others.filter(p=>!assignedNames.has(p.name)).map(p=>{const owner=trainees.find(t=>t.id===p.traineeId);return <div key={p.id} onClick={()=>handleAssignClick(p.id)} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,padding:'10px 14px',marginBottom:6,cursor:'pointer',transition:'border-color .15s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=C.cardBd}>
                <div style={{fontWeight:600,color:C.tx,fontSize:13}}>{p.name} <span style={{fontWeight:400,color:C.tm}}>— {owner?.name||'?'}</span></div>
                <div style={{fontSize:11,color:C.tm}}>{plur(p.dayCount||0, 'day', 'days')} · {plur(p.exerciseCount||0, 'exercise', 'exercises')}</div></div>})}
            </>}
          </div>);
          })())}
      </Modal>
      {/* Unassign confirm */}
      {confirmUnassign && <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:C.scrim}} onClick={()=>{setConfirmUnassign(null);setUnassignTyped("")}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.rd}`,borderRadius:0,width:380,maxWidth:'calc(100vw - 24px)',padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.rd,textAlign:"center"}}>Remove Program?</h3>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.tm,textAlign:"center"}}>This will unassign <strong style={{color:C.tx}}>{(planIndex||[]).find(p=>p.id===confirmUnassign)?.name}</strong> from {td.name}.</p>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:"uppercase",fontFamily:FN,display:"block",marginBottom:4,textAlign:"center"}}>Type "remove" to confirm</label>
            <input value={unassignTyped} onChange={e=>setUnassignTyped(e.target.value)} style={{background: 'var(--c-sf2)',border:`1px solid ${C.rd}`,borderRadius:0,padding:"8px 12px",color:C.tx,fontFamily:FN,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center"}} placeholder="remove" autoComplete="off" autoFocus/></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>{setConfirmUnassign(null);setUnassignTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>{if(unassignTyped.trim().toLowerCase()==="remove"){unassignPlan(confirmUnassign);setConfirmUnassign(null);setUnassignTyped("")}}} style={{opacity:unassignTyped.trim().toLowerCase()==="remove"?1:0.3,pointerEvents:unassignTyped.trim().toLowerCase()==="remove"?"auto":"none"}}>Remove</Btn></div></div></div>}

      {/* Edit trainee modal — extracted to a memoized child so per-keystroke
          setEditForm only re-renders the modal subtree, not the whole
          TraineeDetail page (cards, tables, programs, charts, eval, CRM,
          messages). Mounted conditionally so its state resets on each
          open/close cycle. */}
      {showEdit && (
        <EditTraineeModal
          td={td}
          couple={couple}
          draftKey={draftKey}
          onSave={handleSaveEdit}
          onClose={handleCloseEdit}
        />
      )}
      {/* Archive confirm */}
      {showArchiveConfirm && <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:C.scrim}} onClick={()=>setShowArchiveConfirm(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,width:380,maxWidth:'calc(100vw - 24px)',padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.tx}}>Archive {td.name}?</h3>
          <p style={{margin:"0 0 20px",fontSize:13,color:C.tm}}>Client will be moved to archive. Plans, workouts, and payments are preserved. You can restore anytime.</p>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>setShowArchiveConfirm(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={handleArchive}>Archive</Btn></div></div></div>}
      {/* Permanent delete confirm */}
      {showDeleteConfirm && <div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:C.scrim}} onClick={()=>{setShowDeleteConfirm(false);setDeleteTyped("")}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.rd}`,borderRadius:0,width:420,maxWidth:'calc(100vw - 24px)',padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.rd,textAlign:"center"}}>⚠ Permanent Deletion</h3>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.tm,textAlign:"center"}}>This will permanently delete <strong style={{color:C.tx}}>{td.name}</strong> and ALL their data.</p>
          <p style={{margin:"0 0 16px",fontSize:13,color:C.rd,fontWeight:600,textAlign:"center"}}>This cannot be undone.</p>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:"uppercase",fontFamily:FN,display:"block",marginBottom:4,textAlign:"center"}}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e=>setDeleteTyped(e.target.value)} style={{background: 'var(--c-sf2)',border:`1px solid ${C.rd}`,borderRadius:0,padding:"8px 12px",color:C.tx,fontFamily:FN,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",letterSpacing:"0.1em",textAlign:"center"}} placeholder="DELETE" autoComplete="off"/></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>{setShowDeleteConfirm(false);setDeleteTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>{if(deleteTyped.trim().toUpperCase()==="DELETE")handlePermanentDelete()}} style={{opacity:deleteTyped.trim().toUpperCase()==="DELETE"?1:0.3,pointerEvents:deleteTyped.trim().toUpperCase()==="DELETE"?"auto":"none"}}>Delete Permanently</Btn></div></div></div>}
    </div>);
}

// Bodyweight sparkline + delta. Plots one point per bw_log entry, oldest →
// newest. Shows the absolute first/current/min/max values plus a Δ from the
// first logged weight so the coach gets net change at a glance.
function BWChart({ entries }) {
  if (!entries || entries.length === 0) {
    return <Card style={{textAlign:'center',padding:'18px 16px',color:C.td,fontSize:13}}>No bodyweight logged yet — appears once the trainee logs weight from their portal.</Card>;
  }
  const W = 800, H = 140, PAD_X = 14, PAD_TOP = 18, PAD_BOTTOM = 24;
  const values = entries.map(e => e.bw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const xStep = entries.length === 1 ? 0 : (W - PAD_X * 2) / (entries.length - 1);
  const points = entries.map((e, i) => {
    const x = entries.length === 1 ? W / 2 : PAD_X + i * xStep;
    const y = PAD_TOP + (1 - (e.bw - min) / span) * (H - PAD_TOP - PAD_BOTTOM);
    return { x, y, bw: e.bw, date: e.date };
  });
  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `M${points[0].x},${H - PAD_BOTTOM} L${polyline.replace(/ /g, ' L')} L${points[points.length - 1].x},${H - PAD_BOTTOM} Z`;
  const deltaColor = delta < 0 ? C.gn : delta > 0 ? C.or : C.tm;
  const fmt = v => `${v.toFixed(1)}kg`;
  return (
    <Card style={{padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:10,marginBottom:10}}>
        <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
          <div><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>Current</div><div style={{fontSize:18,fontWeight:700,color:C.tx,fontFamily:FN}}>{fmt(last)}</div></div>
          <div><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>Δ from first</div><div style={{fontSize:18,fontWeight:700,color:deltaColor,fontFamily:FN}}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}kg</div></div>
          <div><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>Range</div><div style={{fontSize:13,color:C.tm,fontFamily:FN,marginTop:3}}>{fmt(min)} – {fmt(max)}</div></div>
        </div>
        <div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>{entries.length} ENTR{entries.length === 1 ? 'Y' : 'IES'}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:140,display:'block'}} aria-label="Bodyweight chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bwAreaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.ac} stopOpacity="0.35"/>
            <stop offset="100%" stopColor={C.ac} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#bwAreaGrad)" />
        <polyline points={polyline} fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          // Peak/trough/slope-aware label placement — same algorithm as the
          // athlete-portal BW chart. Pushes labels above peaks, below troughs,
          // along the slope direction in between, so adjacent labels don't
          // collide on tight data.
          const prevY = i > 0 ? points[i - 1].y : null;
          const nextY = i < points.length - 1 ? points[i + 1].y : null;
          const prevDown = prevY != null ? prevY > p.y : null;
          const nextDown = nextY != null ? nextY > p.y : null;
          const dirs = [prevDown, nextDown].filter(v => v != null);
          const isPeak = dirs.length > 0 && dirs.every(v => v === true);
          const isTrough = dirs.length > 0 && dirs.every(v => v === false);
          let labelX = p.x, labelY, anchor = 'middle';
          const innerH = H - PAD_TOP - PAD_BOTTOM;
          if (!isPeak && !isTrough && prevY != null && nextY != null) {
            const ascending = nextY < prevY;
            labelX = ascending ? p.x - 6 : p.x + 6;
            labelY = p.y - 4;
            anchor = ascending ? 'end' : 'start';
          } else {
            let above = isPeak;
            if (above && p.y < PAD_TOP + 8) above = false;
            else if (!above && p.y > PAD_TOP + innerH - 4) above = true;
            labelY = above ? p.y - 8 : p.y + 14;
          }
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill={C.ac} stroke={C.bg} strokeWidth="1.5">
                <title>{`${fmtPrettyDate(p.date)} · ${fmt(p.bw)}`}</title>
              </circle>
              <text x={labelX} y={labelY} fontSize="10" fontFamily={FN} fill={C.tx} textAnchor={anchor} fontWeight="600">{p.bw}</text>
            </g>
          );
        })}
        <text x={PAD_X} y={H - 6} fontSize="9" fontFamily={FN} fill={C.td}>{fmtPrettyDate(entries[0].date)}</text>
        <text x={W - PAD_X} y={H - 6} fontSize="9" fontFamily={FN} fill={C.td} textAnchor="end">{fmtPrettyDate(entries[entries.length-1].date)}</text>
      </svg>
    </Card>
  );
}

// === EditTraineeModal — isolated subtree for the Edit Athlete form. ========
//
// Why this is its own component (and memo'd): TraineeDetail is a heavy page
// (cards, payment table, programs list, overload chart, eval, CRM, messages).
// When the form lived inline, every keystroke called setEditForm at the
// TraineeDetail level → React re-rendered the whole tree → typing felt laggy
// in the name/notes inputs. Moving the form state inside this child means
// setEditForm only re-renders this subtree. Parent re-renders (trainees
// reload, presence ticks) don't propagate here because React.memo bails on
// shallow-equal props (parent stabilizes onSave / onClose via useCallback).
//
// Lifecycle: mounted only while showEdit. On open, useEffect hydrates editForm
// from the localStorage draft if one exists, else from a fresh td snapshot.
// On unmount, all state is GC'd; the next open re-runs init. This is by design
// so a stale form can never linger between opens.
const EditTraineeModal = React.memo(function EditTraineeModal({ td, couple, draftKey, onSave, onClose }) {
  const [editForm, setEditForm] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    let restored = null;
    try { const raw = localStorage.getItem(draftKey); restored = raw ? JSON.parse(raw) : null; } catch {}
    if (restored) {
      setEditForm(restored);
      setHasDraft(true);
    } else {
      const ef = { ...td, _emails: emailsToArr(td.email) };
      if (couple) ef._members = td.members.map(m => ({ ...m, _emails: emailsToArr(m.email) }));
      setEditForm(ef);
      setHasDraft(false);
    }
    // Intentionally NOT depending on td/couple — those references can change
    // from realtime trainees reloads, but resetting the form mid-edit would
    // nuke whatever the coach has typed. The modal unmounts on close so a
    // fresh open re-runs this from scratch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const editAutosave = useAutosave(
    editForm,
    async (form) => {
      if (!form) return true;
      try { localStorage.setItem(draftKey, JSON.stringify(form)); return true; }
      catch { return false; }
    },
    { debounceMs: 400 }
  );
  const editStatus = autosaveStatusLabel(editAutosave.status, C);

  const handleSave = () => {
    if (!editForm?.name) return;
    const toSave = { ...editForm, email: emailsToStore(editForm._emails || emailsToArr(editForm.email)) };
    delete toSave._emails;
    if (toSave._members) {
      toSave.members = toSave._members.map(m => {
        const email = emailsToStore(m._emails || emailsToArr(m.email));
        const { _emails, ...rest } = m;
        return { ...rest, email };
      });
      delete toSave._members;
    }
    try { localStorage.removeItem(draftKey); } catch {}
    editAutosave.markClean();
    onSave(toSave);
  };

  const handleCancel = () => {
    try { localStorage.removeItem(draftKey); } catch {}
    editAutosave.markClean();
    onClose();
  };

  return (
    <Modal open={true} onClose={handleCancel} title={`Edit — ${td.name}`} wide>
      {editForm && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, minHeight: 18 }}>
          {hasDraft ? (
            <span style={{ fontSize: 11, fontFamily: FN, color: C.or, fontWeight: 600 }}>
              ↻ Restored auto-saved draft — click Save to commit, Cancel to discard
            </span>
          ) : <span />}
          {editStatus && <span aria-live="polite" style={{ fontSize: 11, fontFamily: FN, color: editStatus.color, fontWeight: 600, letterSpacing: '0.04em' }}>{editStatus.text}</span>}
        </div>
        {couple && editForm._members ? <>
          <div style={{ fontSize: 9, fontFamily: FN, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>Shared</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Input label="Couple Name" value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            <Select label="Format" options={TRAINING_FORMATS} value={editForm.format || ""} onChange={v => setEditForm({ ...editForm, format: v })} />
            <Select label="Status" options={TRAINEE_STATUSES.filter(s => s !== "Archived")} value={editForm.status || ""} onChange={v => setEditForm({ ...editForm, status: v })} />
            <Select label="Package" options={PACKAGE_TYPES} value={editForm.package || ""} onChange={v => setEditForm({ ...editForm, package: v })} />
            <Input label="Sessions Remaining" type="number" value={editForm.sessionsRemaining || 0} onChange={e => setEditForm({ ...editForm, sessionsRemaining: parseInt(e.target.value) || 0 })} />
            <Input label="Monthly (₪)" type="number" value={editForm.monthly || ""} onChange={e => setEditForm({ ...editForm, monthly: parseFloat(e.target.value) || 0 })} />
            <Input label="Per Session (₪)" type="number" value={editForm.perSession || ""} onChange={e => setEditForm({ ...editForm, perSession: parseFloat(e.target.value) || 0 })} />
            <Input label="Start Date" type="date" value={editForm.startDate || ""} onChange={e => setEditForm({ ...editForm, startDate: e.target.value })} />
            <Input label="Last Payment" type="date" value={editForm.lastPayment || ""} onChange={e => setEditForm({ ...editForm, lastPayment: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {editForm._members.map((m, mi) => {
              const upd = (field, val) => {
                const next = [...editForm._members];
                next[mi] = { ...next[mi], [field]: val };
                setEditForm({ ...editForm, _members: next });
              };
              return (
                <div key={mi} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontFamily: FN, color: C.ac, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>Member {mi + 1}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Input label="Name" value={m.name || ""} onChange={e => upd('name', e.target.value)} />
                    <EmailsInput label="Email" value={m._emails || emailsToArr(m.email)} onChange={next => upd('_emails', next)} />
                    <Input label="Phone" value={m.phone || ""} onChange={e => upd('phone', e.target.value)} placeholder="+972..." />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <Input label="Age" type="number" value={m.age || ""} onChange={e => upd('age', e.target.value)} />
                      <Input label="Weight" type="number" value={m.weight || ""} onChange={e => upd('weight', e.target.value)} />
                      <Input label="Height" type="number" value={m.height || ""} onChange={e => upd('height', e.target.value)} />
                    </div>
                    <TextArea label="Injuries" value={m.injuries || ""} onChange={e => upd('injuries', e.target.value)} />
                    <TextArea label="Goals" value={m.goals || ""} onChange={e => upd('goals', e.target.value)} />
                    <TextArea label="Notes" value={m.notes || ""} onChange={e => upd('notes', e.target.value)} />
                  </div>
                </div>
              );
            })}
          </div>
        </> : <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Name" value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.tm, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FN }}>Email(s)</label>
              {(editForm._emails || emailsToArr(editForm.email)).map((em, i, arr) => (
                <div key={i} style={{ display: 'flex', gap: 4 }}>
                  <input value={em} onChange={e => {
                    const next = [...(editForm._emails || emailsToArr(editForm.email))];
                    next[i] = e.target.value;
                    setEditForm({ ...editForm, _emails: next });
                  }} placeholder="email@example.com" style={{ ...baseInput, flex: 1 }} />
                  {arr.length > 1 && <button onClick={() => {
                    const next = [...arr]; next.splice(i, 1);
                    setEditForm({ ...editForm, _emails: next });
                  }} style={{ background: 'var(--c-sf)', border: `1px solid ${C.rd}`, borderRadius: 0, padding: '0 10px', color: C.rd, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
                </div>
              ))}
              {(editForm._emails || emailsToArr(editForm.email)).length < 3 && (
                <button onClick={() => {
                  const next = [...(editForm._emails || emailsToArr(editForm.email)), ''];
                  setEditForm({ ...editForm, _emails: next });
                }} style={{ background: 'var(--c-sf)', border: `0.25px dashed ${C.cardBd}`, borderRadius: 0, padding: '6px 10px', color: C.ac, cursor: 'pointer', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>+ Add Email</button>
              )}
            </div>
            <Input label="Phone" value={editForm.phone || ""} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+972..." />
            <Input label="Age" type="number" value={editForm.age || ""} onChange={e => setEditForm({ ...editForm, age: e.target.value })} />
            <Input label="Weight (kg)" type="number" value={editForm.weight || ""} onChange={e => setEditForm({ ...editForm, weight: e.target.value })} />
            <Input label="Height (cm)" type="number" value={editForm.height || ""} onChange={e => setEditForm({ ...editForm, height: e.target.value })} />
            <Select label="Format" options={TRAINING_FORMATS} value={editForm.format || ""} onChange={v => setEditForm({ ...editForm, format: v })} />
            <Select label="Status" options={TRAINEE_STATUSES.filter(s => s !== "Archived")} value={editForm.status || ""} onChange={v => setEditForm({ ...editForm, status: v })} />
            <Select label="Package" options={PACKAGE_TYPES} value={editForm.package || ""} onChange={v => setEditForm({ ...editForm, package: v })} />
            <Input label="Sessions Remaining" type="number" value={editForm.sessionsRemaining || 0} onChange={e => setEditForm({ ...editForm, sessionsRemaining: parseInt(e.target.value) || 0 })} />
            <Input label="Monthly (₪)" type="number" value={editForm.monthly || ""} onChange={e => setEditForm({ ...editForm, monthly: parseFloat(e.target.value) || 0 })} />
            <Input label="Per Session (₪)" type="number" value={editForm.perSession || ""} onChange={e => setEditForm({ ...editForm, perSession: parseFloat(e.target.value) || 0 })} />
            <Input label="Start Date" type="date" value={editForm.startDate || ""} onChange={e => setEditForm({ ...editForm, startDate: e.target.value })} />
            <Input label="Last Payment" type="date" value={editForm.lastPayment || ""} onChange={e => setEditForm({ ...editForm, lastPayment: e.target.value })} />
            <div style={{ gridColumn: "1 / -1" }}><TextArea label="Injuries / Conditions" value={editForm.injuries || ""} onChange={e => setEditForm({ ...editForm, injuries: e.target.value })} placeholder="L4/L5 disc bulge, R shoulder impingement..." /></div>
            <div style={{ gridColumn: "1 / -1" }}><TextArea label="Goals" value={editForm.goals || ""} onChange={e => setEditForm({ ...editForm, goals: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1" }}><TextArea label="Notes" value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
          </div>
        </>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Btn variant="ghost" onClick={handleCancel}>Cancel</Btn>
          <Btn onClick={handleSave}>Save</Btn>
        </div>
      </>}
    </Modal>
  );
});
