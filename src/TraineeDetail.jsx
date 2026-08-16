import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fmtPrettyDate } from './dates';
import BWChart from './BwChart';
import { C, FN, FB, FH, uid, PAYMENT_STATUSES, TRAINING_FORMATS, TRAINEE_STATUSES, PACKAGE_TYPES, GENDER_OPTIONS } from './theme';

// Hebrew renders ~3px smaller than Nord at the same fontSize. Same
// helper applied to NotesWidget, PlansView, WorkoutReview,
// WorkoutsView. Used here for the couple/solo header strip + the
// per-member name column.
const isHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');
// Canonical section-filter id list - ONE source of truth for both the URL-hash
// parser (apply()) and the tab toggler (toggleSec). They used to diverge (a
// 6-item parser vs a 10-item toggler), so deep-links / back-forward to vitals,
// messages, crm or eval were dropped by the parser and silently reverted to
// View All. Keep this the single list.
const TD_SECTIONS = ['vitals', 'billing', 'messages', 'crm', 'bw', 'readiness', 'workouts', 'programs', 'eval', 'overload'];
// Helper to pluralize day/ex counts consistently — "1 day" not "1 days".
const plur = (n, one, many) => `${n} ${n === 1 ? one : many}`;
import { Btn, Input, Select, TextArea, Badge, Card, Modal, EmailsInput, baseInput, toast, confirmToast, useEscClose, SectionLabel, CollapsibleSection, stripBtnBase } from './ui';
import { savePlan } from './usePlansStore';
import { useLineageLauncher } from './LineageLauncher';
import { supabase } from './supabase';
import OverloadChart from './OverloadChart';
import { hasReadiness, CHECKIN_METRICS, readinessColor } from './ReadinessRow';
import CheckinTrends from './CheckinTrends';
import TraineeCRM from './TraineeCRM';
import CoachMessages from './CoachMessages';
import CoachContractComposer from './CoachContractComposer';
import TraineeEvaluation from './TraineeEvaluation';
import TraineeIntake from './TraineeIntake';
import { emailsToArr, emailsToStore, emailsDisplay, traineeIdsFor, subMemberId, sortProgramsRecent } from './traineeUtils';
import useAutosave, { autosaveStatusLabel } from './hooks/useAutosave';

// Status is changed HERE (top-right of the trainee page) via this dropdown —
// no longer inside the EDIT modal (Ohad). Click the status pill → pick a new
// one. Flat (no shadow) per the reference.
const STATUS_COLOR = { Active: C.ac, 'On Hold': C.or, Inactive: C.td, Trial: C.ac, Archived: C.rd };
const STATUS_CHOICES = ['Active', 'On Hold', 'Inactive', 'Trial'];
function StatusMenu({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const color = STATUS_COLOR[status] || C.tm;
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} title="Change status"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 100, height: 24, boxSizing: 'border-box', gap: 6, background: 'transparent', border: `1px solid ${color}`, color, borderRadius: 0, padding: '0 10px', fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
        <span style={{ marginRight: '-0.12em' }}>{status}</span><span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 60, background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`, minWidth: 130 }}>
          {STATUS_CHOICES.map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: s === status ? 'var(--c-sf)' : 'transparent', border: 'none', borderLeft: `3px solid ${s === status ? (STATUS_COLOR[s] || C.ac) : 'transparent'}`, color: STATUS_COLOR[s] || C.tx, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// One canonical "assigned program" card for EVERY programs list — the solo
// list, the couple member columns, and the couple bottom grid. Those three
// renderers had drifted: only the solo list showed an "Open →" affordance, the
// "Only" button was 8px in the couple/member cards but 9px in the solo list,
// and the visibility toggle came in two sizes (28×16 no-label vs 36×20 ON/OFF).
// This unifies all of it: a clickable name that opens the editor PLUS an
// explicit "Open →" button, and consistent ✕ / Only / visibility controls.
function ProgramCard({ plan: p, isVis, onOpen, onUnassign, onOnly, onToggleVis }) {
  const btn = { height:24, boxSizing:'border-box', borderRadius:0, cursor:'pointer', fontFamily:FN, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center' };
  return (
    <Card style={{ marginBottom:8, padding:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 140px', minWidth:0, cursor:'pointer' }} onClick={onOpen}>
          <div style={{ fontWeight:600, color:C.tx, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
          <div style={{ fontSize:12, color:C.tm, marginTop:2 }}>{plur(p.dayCount||0,'day','days')} · {p.exerciseCount||0} ex</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, flexWrap:'wrap' }}>
          <button onClick={e=>{ e.stopPropagation(); onUnassign(); }} aria-label="Remove program from athlete" title="Remove program from athlete" style={{ ...btn, background:'none', border:'none', color:C.rd, fontSize:11, fontWeight:400, opacity:0.6, padding:'0 4px' }}>✕</button>
          <button onClick={e=>{ e.stopPropagation(); onOnly(); }} title="Show only this program on the athlete portal — hide all others" style={{ ...btn, background:'transparent', border:`1px solid ${C.ac}`, color:C.ac, fontSize:9, letterSpacing:'0.1em', padding:'0 8px', textTransform:'uppercase' }}>Only</button>
          <button onClick={e=>{ e.stopPropagation(); onToggleVis(); }} title={isVis?'Visible on the portal — click to hide':'Hidden from the portal — click to show'} style={{ ...btn, background:'none', border:'none', padding:0, gap:4, justifyContent:'flex-start' }}>
            <span style={{ width:36, height:20, borderRadius:10, background:isVis?'rgba(46,213,115,0.251)':C.sf3, border:`1px solid ${isVis?'rgba(46,213,115,0.376)':C.bd2}`, position:'relative', transition:'all .15s', display:'inline-block', flexShrink:0 }}><span style={{ width:16, height:16, borderRadius:8, background:isVis?C.gn:C.td, position:'absolute', top:1, left:isVis?18:1, transition:'all .15s' }}/></span>
            <span style={{ fontSize:10, fontFamily:FN, fontWeight:700, color:isVis?C.gn:C.td, minWidth:26, textAlign:'left' }}>{isVis?'ON':'OFF'}</span>
          </button>
          <button onClick={e=>{ e.stopPropagation(); onOpen(); }} title="Open this program in the editor" style={{ ...btn, background:'transparent', border:`1px solid ${C.ac}`, color:C.ac, fontSize:9, letterSpacing:'0.1em', padding:'0 10px', textTransform:'uppercase', gap:4 }}>Open →</button>
        </div>
      </div>
    </Card>
  );
}

// Coach-side weigh-in entry. Writes to the shared bwLog with the athlete's
// clientId, so the point appears on BOTH this chart and the athlete-portal
// bodyweight graph (bwLog is realtime-synced across coach + portal).
// Own state → typing here never re-renders the heavy TraineeDetail tree.
function BwAddRow({ onAdd }) {
  const [kg, setKg] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const val = parseFloat(kg);
  const ok = Number.isFinite(val) && val > 0 && val < 400;
  const submit = () => {
    if (!ok) return;
    // Store at noon local to avoid TZ date-shift when sliced back to YYYY-MM-DD.
    onAdd(Math.round(val * 10) / 10, new Date(date + 'T12:00:00').toISOString());
    setKg('');
    toast('Weigh-in added — synced to athlete portal');
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 10, padding: '12px 14px', border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>Weight (kg)</label>
        <input type="number" inputMode="decimal" step="0.1" value={kg} onChange={e => setKg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="e.g. 83.5"
          style={{ ...baseInput, width: 110, fontFamily: FN, fontVariantNumeric: 'tabular-nums' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.tm }}>Date</label>
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)}
          style={{ ...baseInput, width: 150, fontFamily: FN }} />
      </div>
      <Btn onClick={submit} disabled={!ok} style={{ opacity: ok ? 1 : 0.5 }}>Add weigh-in</Btn>
    </div>
  );
}

export default function TraineeDetail({ trainee, trainees, setTrainees, planIndex, reloadPlanIndex, exercises, workouts, clientWorkouts, payments, addPayment, updatePayment, removePayment, bwLog, setBwLog, onBack, onOpenPlan, onPreviewPortal, onOpenTasksTab, onCreatePlanForTask, onOpenIntakeTab, onOpenInPersonForTrainee, portalVis, setPortalVis }) {
  // Section tabs are a MULTI-SELECT filter (Ohad): click tags to show only
  // those sections; an empty set = View All. The URL hash carries the active
  // ids (comma-joined) so a filtered view is deep-linkable and back/forward
  // walks it. Hook must precede any early return.
  const [activeSecs, setActiveSecs] = useState(() => new Set());
  useEffect(() => {
    const FILTERABLE = TD_SECTIONS; // full 10-section list — must match toggleSec's list
    const apply = () => {
      const raw = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '');
      const ids = raw.split(',').map(s => s.trim()).filter(id => FILTERABLE.includes(id));
      // All selected == none selected == View All (empty set).
      setActiveSecs(new Set(ids.length === FILTERABLE.length ? [] : ids));
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee]);
  const td = trainees.find(t=>t.id===trainee);
  // For couples: plans assigned to parent ID are shared, plans to sub-IDs are per-member
  const traineeIds = traineeIdsFor(trainee);
  const tp = (planIndex || []).filter(p => traineeIds.includes(p.traineeId));
  const tpMember = (mi) => tp.filter(p => p.traineeId === trainee || p.traineeId === subMemberId(trainee, mi));
  // Couples: workouts/payments may be recorded against either parent or sub-member IDs.
  const _allIds = new Set(traineeIds);
  // (x||[]): these props can be momentarily undefined during a realtime/offline
  // reload; bare .filter here would throw and white-screen the whole coach app
  // (other uses of the same props three lines away already guard with ||[]).
  const tw=(workouts||[]).filter(w=>_allIds.has(w.traineeId)&&w.status==="completed");
  const tPay=(payments||[]).filter(p=>_allIds.has(p.traineeId));
  // Portal-logged workouts (the trainee's own session logs from their portal).
  // We merge these with in-person `tw` for the Recent Workouts feed below —
  // without that merge, clients who train solo from the portal (Amit, Roey)
  // looked totally inactive in their detail view.
  const tcw = (clientWorkouts || []).filter(w => _allIds.has(w.clientId));
  const lineageMap = useMemo(() => Object.fromEntries((trainees || []).map(t => [t.id, t.name])), [trainees]);
  const lineage = useLineageLauncher({ exercises, clientWorkouts, traineeMap: lineageMap, onOpenPlan });
  const tAllWorkouts = [
    ...tw.map(w => ({ id: w.id, date: w.date, dayName: w.dayName, week: w.week, source: 'coach' })),
    ...tcw.map(w => ({ id: w.id, date: w.date, dayName: w.dayName || w.planName || 'Session', week: w.week, source: 'portal', autoregulation: w.autoregulation })),
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
  const [purgeHistory,setPurgeHistory]=useState(false);
  const [purging,setPurging]=useState(false);
  // Escape-to-close for the three hand-rolled destructive confirm overlays.
  useEscClose(!!confirmUnassign, ()=>{setConfirmUnassign(null);setUnassignTyped("")});
  useEscClose(showArchiveConfirm, ()=>setShowArchiveConfirm(false));
  useEscClose(showDeleteConfirm, ()=>{setShowDeleteConfirm(false);setDeleteTyped("")});
  const [programSort,setProgramSort]=useState('chrono'); // 'chrono' | 'alpha'
  // Solo programs card: current (front) block always shown; earlier blocks
  // collapse behind the "N previous" pill — mirrors PlansView's table card.
  const [programsExpanded,setProgramsExpanded]=useState(false);
  // sortProgramsRecent is the canonical newest-first program sort; lives
  // in traineeUtils.js so PlansView, ClientPortal, etc. share one definition.
  const handleArchive = () => { if(setTrainees) setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Archived",archivedAt:new Date().toISOString()}:t)); setShowArchiveConfirm(false); onBack(); };
  const handlePermanentDelete = async () => {
    // Optional owner-gated hard purge of every history table (couple-aware),
    // BEFORE the roster removal so a failure leaves the athlete intact.
    if (purgeHistory) {
      setPurging(true);
      const { error } = await supabase.rpc('purge_trainee_data', { p_trainee_id: trainee });
      setPurging(false);
      if (error) { toast('History purge failed — nothing was deleted: ' + error.message, 'error'); return; }
    }
    if(setTrainees) setTrainees(prev=>prev.filter(t=>t.id!==trainee));
    setShowDeleteConfirm(false); setDeleteTyped(""); setPurgeHistory(false); onBack();
  };
  const [payForm,setPayForm]=useState({amount:"",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});
  const [editPayId,setEditPayId]=useState(null);
  // `td` may be briefly undefined while the parent re-fetches trainees.
  // Couple values that the hooks below need are nullable in that window;
  // guard expressions, then early-return after all hooks have registered.
  const couple = !!td && Array.isArray(td.members) && td.members.length === 2;
  // Paid-only — matches the dashboard's tPaidOnly semantics so a Pending /
  // Canceled payment request never inflates the "total paid" badge.
  const totalPaid=tPay.filter(p=>p.status==='Paid').reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
  // "Last Payment" tile derives from the actual ledger (most-recent Paid row
  // in tPay, which is backed by bit_payment_requests). Falls back to the
  // legacy td.lastPayment field for trainees imported before the table
  // existed — so historical data still surfaces.
  const lastPaidDate = tPay.filter(p=>p.status==='Paid').map(p=>p.date).sort().pop() || td?.lastPayment || null;
  // Inline actions for Pending ledger rows (the table is still
  // bit_payment_requests — the Bit-app integration is gone, the table
  // name stays; it's just the payments ledger now).
  const handleMarkReqPaid = async (id) => {
    if (!(await confirmToast('Mark this request as PAID? Only after the money has actually arrived.', { okLabel: 'Mark paid', cancelLabel: 'Cancel' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) toast(`Update failed: ${error.message}`, 'error');
  };
  const handleCancelReq = async (id) => {
    if (!(await confirmToast('Cancel this payment request?', { okLabel: 'Cancel request', cancelLabel: 'Keep' }))) return;
    const { error } = await supabase.from('bit_payment_requests').update({ status: 'canceled' }).eq('id', id);
    if (error) toast(`Update failed: ${error.message}`, 'error');
  };
  const statusColor={Active:C.ac,"On Hold":C.or,Inactive:C.td,Trial:C.ac};
  // Payments write to bit_payment_requests via the hook callbacks passed in
  // from App.jsx (table name is legacy — it's the plain payments ledger).
  // The `status` field maps 'Paid' / 'Pending' / 'Canceled' → the DB enum.
  const handleAddPayment=async()=>{
    if(!payForm.amount)return;
    try{
      if(editPayId){
        await updatePayment(editPayId, { amount: payForm.amount, date: payForm.date, notes: payForm.notes, status: payForm.status });
        setEditPayId(null);
      } else {
        await addPayment({ traineeId: trainee, amount: payForm.amount, date: payForm.date, notes: payForm.notes, status: payForm.status });
      }
      // Only clear + close on a CONFIRMED write. Previously these ran after the
      // catch unconditionally, so an RLS/network failure closed the modal and
      // read as success — the coach believed money was logged when it wasn't,
      // and the overdue/CRM signals then went wrong.
      setPayForm({amount:"",date:new Date().toISOString().slice(0,10),notes:"",status:"Paid"});
      setShowPayForm(false);
    }catch(err){
      console.warn('payment write failed:', err.message);
      try { toast('Could not save the payment — try again.', 'error'); } catch { /* noop */ }
    }
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
    const{data:src,error:readErr}=await supabase.from('plans').select('*').eq('id',planId).single();
    if(readErr||!src){ toast('Could not assign — the program could not be read'+(readErr?`: ${readErr.message}`:'.'), 'error'); return; }
    if(!src.trainee_id){
      const{error}=await supabase.from('plans').update({trainee_id:tid,updated_at:new Date().toISOString()}).eq('id',planId);
      if(error){ toast('Assign failed: '+error.message, 'error'); return; }
    } else {
      // Carry weeks/kind/isTemplatePurchase through — savePlan defaults weeks→4
      // and drops kind otherwise, which silently rewrote an 8-week block to 4
      // (or turned a daily routine standard) on assign. Mirrors PlansView's
      // duplicatePlan. (functional/logic audit)
      const dup={id:'pl_'+uid(),name:src.name,traineeId:tid,phase:src.phase||'',notes:src.notes||'',active:true,createdAt:new Date().toISOString(),days:src.data?.days||[],warmup:src.data?.warmup||[],weeks:src.data?.weeks,kind:src.data?.kind,isTemplatePurchase:src.data?.isTemplatePurchase};
      if(!(await savePlan(dup))){ toast('Assign failed — the duplicated program could not be saved.', 'error'); return; }
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
    const{error}=await supabase.from('plans').update({trainee_id:'',updated_at:new Date().toISOString()}).eq('id',planId);
    if(error){ toast('Unassign failed: '+error.message, 'error'); return; }
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
    const sorted = [...plans].sort(sortProgramsRecent);
    const current = sorted[0];
    const next = { ...portalVis };
    plans.forEach(p => { next[keyFn(p)] = p === current; });
    setPortalVis(next);
  };
  const bulkToggleBtn = (plans, keyFn) => {
    if (plans.length === 0) return null;
    const showing = anyVisible(plans, keyFn);
    return (
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        {plans.length > 1 && <button onClick={()=>bulkOnlyCurrent(plans, keyFn)}
          title="Hide all blocks except the most recent one"
          style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:28,boxSizing:'border-box',padding:"0 12px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',lineHeight:1}}>
          ONLY CURRENT
        </button>}
        <button onClick={()=>bulkSetVis(plans, keyFn, !showing)}
          title={showing ? "Hide all from portal" : "Show all on portal"}
          style={{background:'var(--c-sf)',border:`1px solid ${showing?C.rd:C.gn}`,borderRadius:0,height:28,boxSizing:'border-box',padding:"0 12px",color:showing?C.rd:C.gn,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',lineHeight:1}}>
          {showing ? 'HIDE ALL' : 'SHOW ALL'}
        </button>
      </div>
    );
  };

  // Helper: render a member column (body stats, injuries, goals, optionally programs)
  const renderMemberColumn = (m, mi, showPrograms = true) => {
    const memberPlans = tpMember(mi);
    const sorted = [...memberPlans].sort((a,b)=>programSort==='alpha'?(a.name||'').localeCompare(b.name||''):sortProgramsRecent(a,b));
    const memberVisKey = (p) => `${td.name}:${p.name}:m${mi}`;
    // Single-click "make this the only visible plan" for couple members.
    // Sets every sibling explicitly to false so default-undefined rows
    // don't bleed through as visible. Confined to this member's plans.
    const onlyThisMember = (chosenKey) => {
      const nv = { ...(portalVis || {}) };
      sorted.forEach(plan => { nv[memberVisKey(plan)] = false; });
      nv[chosenKey] = true;
      setPortalVis(nv);
    };
    return (
      // Flex-column so the member Card can FILL the column, which the couple row
      // stretches to the taller member's height (align-items:stretch). Result:
      // both member boxes are the SAME height even when one has an injuries box
      // and the other doesn't (Ohad — equal boxes). flex:1 on the Card only in
      // couple mode (showPrograms=false) so a future solo caller isn't squished.
      <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
        <Card style={{marginBottom:8, flex: showPrograms ? undefined : 1}}
          header={<span style={{display:'inline-flex',alignItems:'baseline',gap:10,fontWeight:700,fontSize:14,letterSpacing:'0.04em',textTransform:'uppercase'}}>{m.name}</span>}>
          {/* Name + email body block — rendered in BOTH themes (was `!isRefined5b()`,
              i.e. dark only, which made dark 56px taller than light). Ohad wants
              light to match dark's fuller build, so it's now unconditional. */}
          <div style={{textAlign:'center',marginBottom:10}}>
            <div style={{fontSize:18,fontWeight:700,color:C.tx,fontFamily:FN}}>{m.name}</div>
            <div style={{fontSize:12,color:C.tm,marginTop:2}}>{emailsDisplay(m.email)}{m.phone?` · ${m.phone}`:''}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,textAlign:'center'}}>
            {[['Age',m.age||'—'],['Weight',m.weight?`${m.weight}kg`:'—'],['Height',m.height?`${m.height}cm`:'—']].map(([l,v])=>
              <div key={l}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700}}>{l}</div><div style={{fontSize:14,color:C.tx,marginTop:2}}>{v}</div></div>)}
          </div>
          {m.injuries&&<div style={{marginTop:10,padding:8,background:'var(--c-sf)',border:`1px solid ${C.or}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Injuries</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(m.injuries)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(m.injuries)?FH:undefined}}>{m.injuries}</div></div>}
          {m.goals&&<div style={{marginTop:6,padding:8,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:'uppercase',marginBottom:4,textAlign:'center'}}>Goals</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(m.goals)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(m.goals)?FH:undefined}}>{m.goals}</div></div>}
          {m.notes&&<div style={{marginTop:6,padding:8,background:'var(--c-sf)',border:`1px solid ${C.bd}`,borderRadius:0}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:'uppercase',letterSpacing:'0.18em',fontWeight:700,marginBottom:4,textAlign:'center'}}>Notes</div><div style={{fontSize:13,color:C.tm,direction:/[\u0590-\u05FF]/.test(m.notes)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(m.notes)?FH:undefined}}>{m.notes}</div></div>}
        </Card>
        {showPrograms && <>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'12px 0 6px',gap:8}}>
          <div style={{fontSize:12,fontFamily:FN,color:C.tm,fontWeight:600}}>{m.name} — PROGRAMS ({sorted.length})</div>
          {bulkToggleBtn(sorted, memberVisKey)}
        </div>
        {sorted.length===0?<div style={{color:C.td,fontSize:12}}>No programs assigned.</div>:
          sorted.map(p=>{const visKey=memberVisKey(p);const isVis=portalVis?.[visKey]!==false;return(
            <ProgramCard key={p.id} plan={p} isVis={isVis} onOpen={()=>onOpenPlan&&onOpenPlan(p.id)} onUnassign={()=>{setConfirmUnassign(p.id);setUnassignTyped("")}} onOnly={()=>onlyThisMember(visKey)} onToggleVis={()=>{const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} />)})}
        </>}
      </div>
    );
  };

  // Solo-trainee plan toggles. The trick here: each row carries an
  // ONLY THIS pill that sets THIS plan to visible AND every sibling
  // to explicitly-false in one shot — matches Ohad's mental model of
  // "I picked this one, hide the rest" (since the default for never-
  // toggled rows is visible, single toggles weren't enough).
  const onlyThis = (visKey, sortedList) => {
    const nv = { ...(portalVis || {}) };
    sortedList.forEach(plan => { nv[`${td.name}:${plan.name}`] = false; });
    nv[visKey] = true;
    setPortalVis(nv);
  };
  // Solo assigned-programs list — restyled to match the coach Programs page
  // TABLE card (PlansView progView==='table'): ONE card for the athlete, the
  // current block surfaced (cyan name + spelled-out meta) with earlier blocks
  // collapsed behind a "N previous" pill and expanded as compact stacked rows.
  // Every action the old ProgramCard wired is preserved, just re-grammared:
  //   open plan  → click the card body / the earlier row
  //   visibility → PORTAL toggle (kept GREEN per Ohad)
  //   only-this  → "Only" text action
  //   unassign   → "Remove" text action (red)
  const renderProgramsList = () => {
    const sorted = [...tp].sort((a,b)=>programSort==='alpha'?(a.name||'').localeCompare(b.name||''):sortProgramsRecent(a,b));
    if (sorted.length === 0) return null; // caller renders the empty state
    const cur = sorted[0];
    const earlier = sorted.slice(1);
    const visKeyOf = (p) => `${td.name}:${p.name}`;
    // Recency pill mirrors PlansView. No per-block session attribution exists
    // on this page, so it reads the athlete's most recent completed session —
    // on a single-athlete page the current block is what they're training, so
    // athlete-last-session is the honest signal (real data, never fabricated).
    const lastDateRaw = tAllWorkouts[0]?.date;
    const lastDate = lastDateRaw ? new Date(lastDateRaw) : null;
    const daysSince = (lastDate && !isNaN(lastDate)) ? Math.floor((Date.now() - lastDate.getTime())/86400000) : null;
    const tagColor = daysSince == null ? C.td : daysSince <= 3 ? C.gn : daysSince <= 7 ? C.tm : daysSince <= 14 ? C.or : C.rd;
    const tagText = daysSince == null ? 'NEVER LOGGED' : daysSince <= 0 ? 'TRAINED TODAY' : `${daysSince}D AGO`;

    // Shared text-action builders so the current block and the earlier rows
    // stay pixel-consistent (only the font size differs, exactly as PlansView).
    const onlyBtn = (p, fs) => (
      <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();onlyThis(visKeyOf(p),sorted);}} title="Show only this program on the athlete portal — hide all others" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:fs,fontWeight:700,letterSpacing:'0.04em',color:C.ac}}>Only</button>
    );
    const removeBtn = (p, fs) => (
      <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setConfirmUnassign(p.id);setUnassignTyped("");}} title="Remove this program from the athlete" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:fs,fontWeight:700,letterSpacing:'0.04em',color:C.rd}}>Remove</button>
    );

    return (
      <div className="prog-card" style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}>
        {/* Cyan STRIP HEADER — matches PlansView: 3px cyan tick + label (white)
            on the left, recency pill on the right. The athlete name is the page
            title already, so the strip carries a block label instead (Ohad). */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,background:'color-mix(in srgb, var(--c-stripBg, var(--c-sf)) 90%, var(--c-ac))',borderBottom:`1px solid ${C.cardBd}`,padding:'8px 14px'}}>
          <span style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
            <span aria-hidden style={{width:3,height:14,background:C.ac,flexShrink:0}} />
            <span style={{fontWeight:700,fontSize:13,letterSpacing:'0.04em',color:'#FFFFFF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{earlier.length>0?'CURRENT BLOCK':'ASSIGNED PROGRAM'}</span>
          </span>
          <span title={`Last session: ${tagText.toLowerCase()}`} style={{display:'inline-flex',alignItems:'center',justifyContent:'flex-end',gap:6,minWidth:104,fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'var(--c-tm)',whiteSpace:'nowrap',flexShrink:0}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:tagColor,flexShrink:0}} />{tagText}
          </span>
        </div>

        {/* Clickable body — current block name in cyan, "N previous" collapse
            pill, spelled-out meta line. Click anywhere opens the editor. */}
        <div onClick={()=>onOpenPlan&&onOpenPlan(cur.id)} role="button" tabIndex={0}
          onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onOpenPlan&&onOpenPlan(cur.id); } }}
          style={{cursor:'pointer',padding:'12px 14px 4px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:15,color:C.ac,fontFamily:FN,letterSpacing:'0.04em',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cur.name||'Untitled'}</span>
            {earlier.length > 0 && (
              <button onClick={e=>{e.stopPropagation();setProgramsExpanded(v=>!v);}}
                title={programsExpanded?`Hide ${earlier.length} previous block${earlier.length===1?'':'s'}`:`Show ${earlier.length} previous block${earlier.length===1?'':'s'}`}
                className="prog-plusn"
                style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 9px',background: programsExpanded ? 'rgba(127,127,138,0.14)' : 'transparent',border:`1px solid ${C.cardBd}`,borderRadius:0,color: C.tm,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.05em',whiteSpace:'nowrap',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>
                {earlier.length} previous
                <span aria-hidden style={{display:'inline-block',transform: programsExpanded?'rotate(180deg)':'none',transition:'transform .15s',fontSize:8,lineHeight:1}}>▾</span>
              </button>
            )}
          </div>
          <div style={{fontSize:12,color:C.tm,fontFamily:FN,letterSpacing:'0.04em',marginTop:5}}>{cur.dayCount||0} days · {cur.exerciseCount||0} exercises</div>
        </div>

        {/* Light text actions — PORTAL toggle (green, kept) + spacer + Only / Remove. */}
        <div className="prog-actions" style={{padding:'8px 14px 12px',display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          {(() => {
            const vk = visKeyOf(cur);
            const isVis = portalVis?.[vk] !== false;
            return <button onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis});}} title={isVis?'On the athlete portal — click to hide':'Hidden from the athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>
              <span style={{fontFamily:FN,fontSize:11,fontWeight:700,letterSpacing:'0.06em',color:isVis?C.gn:C.td}}>PORTAL</span>
              <span style={{width:32,height:18,borderRadius:9,background:isVis?'rgba(46,213,115,0.25)':'rgba(255,255,255,0.06)',border:`1px solid ${isVis?'rgba(46,213,115,0.5)':C.cardBd}`,position:'relative',transition:'background .15s, border-color .15s',flexShrink:0}}>
                <span style={{width:14,height:14,borderRadius:7,background:isVis?C.gn:C.td,position:'absolute',top:1,left:isVis?15:1,transition:'left .15s'}} />
              </span>
            </button>;
          })()}
          <div className="prog-spacer" style={{flex:1,minWidth:8}} />
          {onlyBtn(cur, 11)}
          {removeBtn(cur, 11)}
        </div>

        {/* Expanded earlier blocks — compact stacked rows: faded cyan name +
            `Nd · Mex` + the same text actions. */}
        {programsExpanded && earlier.length > 0 && (
          <div className="prog-reveal" style={{borderTop:`1px solid ${C.cardBd}`,padding:'4px 0'}}>
            {earlier.map(p => {
              const vk = visKeyOf(p);
              const isVis = portalVis?.[vk] !== false;
              return (
                <div key={p.id} onClick={()=>onOpenPlan&&onOpenPlan(p.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onOpenPlan&&onOpenPlan(p.id); } }}
                  style={{cursor:'pointer',padding:'7px 14px 7px 32px',display:'flex',alignItems:'center',gap:8,opacity:0.78,transition:'opacity 0.12s',borderTop:`1px solid rgba(57,189,255,0.102)`}}>
                  <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8}}>
                    <div style={{flex:1,minWidth:0,fontSize:13,color:C.ac,opacity:0.72,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:'0.04em',fontFamily:FN,fontWeight:700}}>{p.name||'Untitled'}</div>
                    <div style={{fontSize:11,color:C.td,fontFamily:FN,letterSpacing:'0.04em',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>{p.dayCount||0}d · {p.exerciseCount||0}ex</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
                    <button className="prog-txtbtn" onClick={e=>{e.stopPropagation();setPortalVis({...portalVis,[vk]:!isVis});}} title={isVis?'On the athlete portal — click to hide':'Hidden from the athlete portal — click to show'} style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.04em',color:isVis?C.gn:C.td,display:'inline-flex',alignItems:'center',gap:5}}><span style={{width:5,height:5,borderRadius:'50%',background:isVis?C.gn:C.td}} />{isVis?'On portal':'Hidden'}</button>
                    {onlyBtn(p, 10)}
                    {removeBtn(p, 10)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Section-jump tab menu (Tasks-style segmented control). VIEW ALL is the
  // default (leftmost) and scrolls to the top; each section tab scrolls that
  // section into view. Scroll-jump, not filter — every section stays on the page.
  const FILTERABLE_SECS = TD_SECTIONS; // single source of truth (see top of file)
  // Empty set = View All (show everything). Otherwise show only the active ids.
  const showSec = (id) => activeSecs.size === 0 || activeSecs.has(id);
  // SINGLE-SELECT (Ohad 2026-08: "if i click on billing, i only want it to show
  // billing — for each button"). Each section tab isolates to ONLY that section;
  // clicking the already-active tab (or View All) returns to showing everything.
  const toggleSec = (id) => {
    let next;
    if (id === 'all' || (activeSecs.size === 1 && activeSecs.has(id))) {
      next = new Set(); // View All, or clicking the sole-active tab again
    } else {
      next = new Set([id]); // exclusive: show ONLY this section
    }
    setActiveSecs(next);
    // pushState (not replaceState) so back/forward walks the filter; pushState
    // doesn't fire hashchange, so this won't re-enter the sync effect.
    if (typeof window !== 'undefined') {
      const wantHash = next.size === 0 ? '' : '#' + [...next].join(',');
      if (window.location.hash !== wantHash) {
        window.history.pushState(null, '', window.location.pathname + window.location.search + wantHash);
      }
    }
  };
  const SEC_TABS = [
    { id: 'all', label: 'View All' },
    { id: 'vitals', label: 'Vitals' },
    { id: 'billing', label: 'Billing' },
    { id: 'messages', label: 'Messages' },
    { id: 'crm', label: 'Coach History' },
    { id: 'bw', label: 'Bodyweight' },
    { id: 'readiness', label: 'Readiness' },
    { id: 'workouts', label: 'Workouts' },
    { id: 'programs', label: 'Programs' },
    { id: 'eval', label: 'Evaluation' },
    { id: 'overload', label: 'Overload' },
  ];

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
        /* Mobile header fixes (Ohad 2026-08 "horrible" pass):
           (a) the identity strip's email/phone overlapped the ACTIVE status
               dropdown — wrap the contact line onto its own line so they never
               touch; (b) the Vitals grid's fixed repeat(3,132px) (396px + gaps)
               overflowed a 390px viewport by ~17px — collapse it to 3 fluid
               columns that fit. Desktop (>760px) keeps the original geometry. */
        @media (max-width: 760px) {
          .td-hdr-identity { flex-wrap: wrap !important; min-width: 0; max-width: 100%; row-gap: 2px; }
          .td-hdr-contact { flex-basis: 100%; white-space: normal !important; word-break: break-word; }
          .td-vitals-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; max-width: 100% !important; gap: 10px 6px !important; }
        }
      `}</style>
      {/* Back + actions bar */}
      {/* Header actions consolidated to the LEFT (Ohad: BACK-left + actions-right
          split across the two rows read "scattered"). BACK sits first, a divider
          gap, then the action cluster — all left-aligned so they stack cleanly
          above the left-aligned section tabs instead of splitting to both edges. */}
      <div style={{display:"flex",alignItems:"center",marginBottom:16,gap:12}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:12,fontWeight:700,letterSpacing:'0.06em',padding:0,height:30,lineHeight:1,display:"inline-flex",alignItems:"center",flexShrink:0}}>← BACK</button>
        {/* Action buttons STRETCH to fill the row equally (flex:1 1 0) so this
            row is a full-width segmented control that matches the section-tab row
            directly below it exactly (Ohad: "the two rows must be the same"). All
            30px, all equal width. NOTIFICATION gets a touch more room for its toggle.
            EDIT first (after BACK), then LOG SESSION / PORTAL / ANALYSIS, the
            NOTIFICATION toggle, ARCHIVE (destructive) last. */}
        <div style={{display:"flex",gap:4,flex:1,minWidth:0}}>
          {/* Order (Ohad): EDIT · PORTAL · ANALYSIS · LOG SESSION · ARCHIVE · NOTIFICATION.
              Border unified to the same cyan hairline (C.cardBd) as the section-tab
              row below, so the two rows read as ONE consistent segmented system
              (Ohad: "don't like grey borders on top, cyan on the 2nd row"). */}
          <Btn variant="ghost" onClick={openEdit} style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",flex:'1 1 0',minWidth:0,border:`1px solid ${C.cardBd}`}}>EDIT</Btn>
          {onPreviewPortal && <Btn variant="ghost" onClick={onPreviewPortal} style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",flex:'1 1 0',minWidth:0,border:`1px solid ${C.cardBd}`}} title="Open this athlete's portal in preview mode">PORTAL</Btn>}
          <Btn variant="ghost" onClick={()=>lineage.open(trainee)} style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",flex:'1 1 0',minWidth:0,border:`1px solid ${C.cardBd}`}} title="Training Analysis — cross-block progression + what to program next">ANALYSIS</Btn>
          {onOpenInPersonForTrainee && <Btn variant="ghost" onClick={()=>onOpenInPersonForTrainee(trainee)} style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",flex:'1 1 0',minWidth:0,border:`1px solid ${C.cardBd}`}} title="Open the in-person workout logger pre-filtered to this athlete">LOG SESSION</Btn>}
          {td.status==="Archived" ? <>
            <Btn variant="ghost" onClick={()=>{if(setTrainees)setTrainees(prev=>prev.map(t=>t.id===trainee?{...t,status:"Inactive",archivedAt:undefined}:t));onBack()}} style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",flex:'1 1 0',minWidth:0,border:`1px solid ${C.cardBd}`}}>RESTORE</Btn>
            <Btn variant="danger" onClick={()=>setShowDeleteConfirm(true)} style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",flex:'1 1 0',minWidth:0}}>DELETE</Btn>
          </> : <Btn variant="ghost" onClick={()=>setShowArchiveConfirm(true)} title="Archive this athlete" style={{fontSize:11,padding:"0 6px",height:30,boxSizing:"border-box",color:'var(--c-tm)',flex:'1 1 0',minWidth:0,border:`1px solid ${C.cardBd}`}}>ARCHIVE</Btn>}
          <button
            onClick={() => { if (setTrainees) setTrainees(prev => prev.map(t => t.id === trainee ? { ...t, notifOff: !t.notifOff } : t)); }}
            title={td.notifOff ? 'Notifications muted for this athlete — click to unmute' : 'Notifications on — click to mute push + dashboard alerts about this athlete'}
            style={{ background: 'transparent', border: `1px solid ${C.cardBd}`, borderRadius: 0, cursor: 'pointer', padding: '0 6px', height: 30, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flex: '1.6 1 0', minWidth: 0 }}>
            <span style={{ fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: td.notifOff ? C.td : C.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>NOTIFICATION</span>
            <span style={{ width: 34, height: 18, borderRadius: 9, background: td.notifOff ? C.sf3 : 'rgba(57,189,255,0.22)', border: `1px solid ${td.notifOff ? C.bd2 : 'rgba(57,189,255,0.38)'}`, position: 'relative', transition: 'all .15s', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: td.notifOff ? C.td : C.ac, position: 'absolute', top: 1, left: td.notifOff ? 1 : 17, transition: 'all .15s' }} />
            </span>
          </button>
        </div></div>

      {lineage.node}
      {/* Section filter — SINGLE-SELECT (Ohad). VIEW ALL (leftmost) shows
          everything; each section tab isolates to ONLY that section; clicking
          the active tab again returns to View All. WRAPS to fit — every tag stays
          visible, no horizontal scroll (Ohad: "all the tags need to fit"). */}
      <div style={{ marginBottom: 16 }}>
        {/* Section tabs SIZE TO THEIR LABEL and WRAP to a second row when the row
            is too narrow (Ohad: equal-width forced-fit clipped the long labels —
            "Coach History" → "ach Histo" — unreadable). Natural width + wrap keeps
            every label fully legible, still with NO horizontal scroll: on a wide
            screen they sit on one row, on a narrow one they wrap. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: '100%' }} role="group" aria-label="Filter sections">
          {SEC_TABS.map(t => {
            const active = t.id === 'all' ? activeSecs.size === 0 : activeSecs.has(t.id);
            return (
              <button key={t.id} onClick={() => toggleSec(t.id)}
                aria-pressed={active}
                title={t.id === 'all' ? 'Show all sections' : `Show only ${t.label} — click again for all sections`}
                style={{
                  height: 30, boxSizing: 'border-box', padding: '0 11px', borderRadius: 0,
                  // Fit the label — never shrink below its text (no clipping).
                  flex: '0 0 auto',
                  // Tinted active state (not a solid C.ac fill) — in light-refined
                  // themes C.ac resolves near-black, so solid-fill + dark label was
                  // invisible (Ohad: "i cant see the button"). Tint + accent text
                  // reads in every theme.
                  background: active ? 'color-mix(in srgb, var(--c-ac) 16%, transparent)' : 'transparent',
                  border: `1px solid ${active ? C.ac : C.cardBd}`,
                  color: active ? 'var(--c-ac)' : C.tm,
                  fontFamily: FN, fontSize: 10, fontWeight: active ? 800 : 700, letterSpacing: '0.03em',
                  textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s, color .12s, border-color .12s',
                }}>{t.label}</button>
            );
          })}
        </div>
      </div>

      {/* === COUPLE LAYOUT === */}
      {couple ? <>
        {/* Couple identity + status header. Billing stats were shown here AND in
            the Billing section below (line ~730, identical Package/Sessions/
            Monthly/Per-Session/Last-Payment/Since) — the section owns billing
            (it also has the actions + payment ledger), so the duplicate grid is
            removed here. This bar keeps only the couple identity, status, and the
            one datum NOT in the Billing section: the household Workouts count. */}
        <Card style={{marginBottom:12,textAlign:'center'}}
          header={(() => {
            const heb = isHebrew(td.name);
            return <span style={{display:'inline-flex',alignItems:'center',gap:8,fontWeight:700,fontSize:heb?16:13,fontFamily:heb?FH:undefined,letterSpacing:heb?0:'0.04em',textTransform:heb?'none':'uppercase'}}>{td.name} · {td.format}</span>;
          })()}
          headerRight={<span style={{display:'inline-flex',alignItems:'center',gap:8}}>{td.branch === 'Bnei Herzliya' && <span title="Bnei Herzliya team" style={{display:'inline-flex',alignItems:'center',height:24,boxSizing:'border-box',fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',color:C.ac,border:`1px solid ${C.ac}`,padding:'0 10px',whiteSpace:'nowrap'}}>BNEI HERZLIYA</span>}<StatusMenu status={td.status} onChange={s => { if (setTrainees) setTrainees(prev => prev.map(t => t.id === trainee ? { ...t, status: s } : t)); }} /></span>}>
          {/* Duplicate status Badge removed — the strip header's StatusMenu is the
              single status control (Ohad: no mirrored status in the back). */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, 118px)',justifyContent:'center',gap:'12px 10px'}}>
            {[['Workouts',tAllWorkouts.length]].map(([l,v])=>
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
      {/* Header is ONE full-width flex-wrap row (identity left, branch+status
          right) instead of Card's header/headerRight split. On desktop it reads
          identically — the two groups sit on one line, space-between. On a phone
          (<=760px) the controls wrap BELOW the identity so the email/phone gets
          the full width and never collides with the ACTIVE dropdown (Ohad 2026-08). */}
      {/* Identity band REMOVED (Ohad: "remove the cyan line beneath [name]"). The
          cyan name + status strip read as redundant clutter — the coach already
          knows whose page this is (they clicked in from the roster), and status is
          editable from the roster's per-card menu. Branch badge dropped with it. */}
      </>}

      {/* Page section order (Ohad spec 2026-05-16, v3):
            Header → VITALS → BILLING → MESSAGES → CRM → BODYWEIGHT →
            WORKOUTS → PROGRAMS → EVALUATION → OVERLOAD → RECORDS.
          Vitals leads (most-asked "what is going on with this client?"
          after the header); Billing + Messages cluster the day-to-day
          interactions; CRM + Bodyweight surface signals; Workouts /
          Programs / Eval / Overload / Records anchor the historical
          tail. Couples render vitals inside the member columns above;
          the !couple gate skips the duplicate card. */}

      {/* === VITALS · INJURIES · GOALS — slot #2, solo only (couples
          render this inside the member columns above). */}
      {!couple && (
        <Card style={{marginBottom:16, display: showSec('vitals') ? undefined : 'none'}}
          header={<span style={{fontWeight:700,fontSize:13,letterSpacing:'0.04em',textTransform:'uppercase'}}>Vitals · Injuries · Goals</span>}>
          {/* Centred fixed tiles (not 3×1fr stretch) so vitals read as a compact
              cluster, matching the header stats; empty values dimmed. */}
          <div className="td-vitals-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, 132px)",justifyContent:"center",gap:12,maxWidth:558,margin:"0 auto",textAlign:"center"}}>
            {[["Age",td.age||"—"],["Weight",td.weight?`${td.weight}kg`:"—"],["Height",td.height?`${td.height}cm`:"—"],["Format",td.format||"—"]].map(([l,v])=>{
              const empty = v==="—";
              return <div key={l}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700,textAlign:"center"}}>{l}</div><div style={{fontSize:14,color:empty?C.td:C.tx,marginTop:2,textAlign:"center"}}>{v}</div></div>;
            })}
          </div>
          {/* All three sub-cards share ONE border color (the canonical cyan
              hairline) so the borders read as a uniform set — the semantic
              cue lives in the LABEL color (injuries=orange, goals=cyan,
              notes=muted), not the border. Was: orange / cyan / grey borders. */}
          {td.injuries&&<div style={{marginTop:12,padding:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.or,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Injuries / Conditions</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(td.injuries)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(td.injuries)?FH:undefined}}>{td.injuries}</div></div>}
          {td.goals&&<div style={{marginTop:8,padding:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}><div style={{fontSize:10,fontFamily:FN,color:C.ac,textTransform:"uppercase",marginBottom:4,textAlign:"center"}}>Goals</div><div style={{fontSize:13,color:C.tx,direction:/[\u0590-\u05FF]/.test(td.goals)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(td.goals)?FH:undefined}}>{td.goals}</div></div>}
          {td.notes&&<div style={{marginTop:8,padding:10,background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700,marginBottom:4,textAlign:"center"}}>Notes</div><div style={{fontSize:13,color:C.tm,direction:/[\u0590-\u05FF]/.test(td.notes)?'rtl':'ltr',textAlign:'center',fontFamily:/[\u0590-\u05FF]/.test(td.notes)?FH:undefined}}>{td.notes}</div></div>}
        </Card>
      )}

      {/* === BILLING — slot #3, wrapped in a Card like Vitals / Messages
          for visual parity. Header = "Billing (N)" + total-paid badge;
          headerRight = the 3 action buttons. Body = payments table or
          empty state. */}
      <CollapsibleSection domId="td-sec-billing" title="Billing" count={tPay.length} storageKey={`td-billing-${trainee}`} style={{marginBottom:16, display: showSec('billing') ? undefined : 'none'}}
        right={<div style={{display:'flex',flexWrap:'wrap',gap:6,justifyContent:'flex-end',alignItems:'center'}}>
          {totalPaid>0&&<span style={{color:'#FFFFFF',opacity:0.85,fontWeight:400,fontFamily:FB,fontSize:12,marginRight:6,whiteSpace:'nowrap'}}>₪{totalPaid.toLocaleString()} paid</span>}
          <div style={{display:'flex',gap:0}}>
          {/* F-27 — open the brand-rich contract composer. */}
          <button onClick={()=>setShowContract(true)}
            style={{...stripBtnBase,border:'1px solid rgba(255,255,255,0.55)',color:'#FFFFFF'}}>CONTRACT</button>
          <button onClick={()=>setShowPayForm(true)}
            style={{...stripBtnBase,border:'1px solid rgba(255,255,255,0.55)',borderLeft:'none',color:'#FFFFFF'}}>+ ADD PAYMENT</button>
        </div></div>}>
      {/* Contract terms strip — the billing facts (rate/package/sessions) that
          used to live in the header stat row (Ohad: "payment in billing").
          Empty values dim so real terms stand out. */}
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:"12px 32px",margin:"0 auto 16px",textAlign:"center"}}>
        {[["Package",td.package],["Sessions Left",td.sessionsRemaining],["Monthly",td.monthly?`₪${td.monthly}`:"—"],["Per Session",td.perSession?`₪${td.perSession}`:"—"],["Last Payment",fmtPrettyDate(lastPaidDate)],["Since",fmtPrettyDate(td.startDate)]].map(([l,v])=>{
          const empty = v===undefined||v===null||v===""||v==="—";
          // Auto-width cells + nowrap values so a long date ("1st of January 2025")
          // stays on ONE row instead of wrapping in a fixed 118px column (Ohad).
          return <div key={l} style={{whiteSpace:'nowrap'}}><div style={{fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700}}>{l}</div><div style={{fontSize:14,color:empty?C.td:C.tx,marginTop:2}}>{empty?"—":v}</div></div>;
        })}
      </div>
      {tPay.length===0?<div style={{color:C.td,fontSize:13,textAlign:'center',padding:'10px 0'}}>No payments recorded.</div>:(
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:FB,fontSize:13}}>
          <thead><tr style={{borderBottom:`1px solid ${C.cardBd}`}}>{["Date","Amount","Status","Notes",""].map(h=><th key={h} style={{textAlign:"center",padding:"6px 10px",fontSize:9,fontFamily:FN,color:C.tm,textTransform:"uppercase",letterSpacing:'0.18em',fontWeight:700}}>{h}</th>)}</tr></thead>
          <tbody>{tPay.slice().reverse().map(p=>(<tr key={p.id} style={{borderBottom:`1px solid ${C.cardBd}`}}>
            <td style={{padding:"8px 10px",color:C.tm,textAlign:"center"}}>{fmtPrettyDate(p.date)}</td>
            <td style={{padding:"8px 10px",color:C.gn,fontWeight:600,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>₪{(parseFloat(p.amount)||0).toLocaleString()}</td>
            <td style={{padding:"8px 10px",textAlign:"center"}}><Badge color={p.status==="Paid"?C.gn:p.status==="Overdue"?C.rd:C.or}>{p.status}</Badge></td>
            <td style={{padding:"8px 10px",color:C.td,textAlign:"center"}}>{p.notes||"—"}</td>
            <td style={{padding:"8px 10px",whiteSpace:"nowrap",textAlign:"center"}}>
              {/* Pending rows get inline Paid / Cancel so the coach doesn't
                  have to bounce to /coach/billing; mutations propagate back
                  via the useBitPayments realtime channel. */}
              {p.status==='Pending' && (<>
                  <button onClick={()=>handleMarkReqPaid(p.id)} title="Mark this request as paid"
                    style={{display:'inline-flex',alignItems:'center',justifyContent:'center',lineHeight:1,background:'transparent',border:`1px solid ${C.gn}`,color:C.gn,padding:'2px 8px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer',marginRight:6}}>✓ PAID</button>
                  <button onClick={()=>handleCancelReq(p.id)} title="Cancel this payment request"
                    style={{display:'inline-flex',alignItems:'center',justifyContent:'center',lineHeight:1,background:'transparent',border:`1px solid ${C.rd}`,color:C.rd,padding:'2px 8px',fontFamily:FN,fontSize:9,fontWeight:700,letterSpacing:'0.12em',cursor:'pointer',marginRight:6}}>× CANCEL</button>
                </>)}
              <button onClick={()=>handleEditPay(p)} aria-label="Edit payment" style={{background:"none",border:"none",color:C.ac,cursor:"pointer",padding:2,fontSize:11,fontFamily:FN}}>✏</button>
              <button onClick={()=>handleDeletePay(p.id)} aria-label="Delete payment" style={{background:"none",border:"none",color:C.rd,cursor:"pointer",padding:2,fontSize:11,fontFamily:FN,marginLeft:6,opacity:0.6}}>✕</button>
            </td></tr>))}</tbody></table></div>)}
      </CollapsibleSection>
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

      {/* === MESSAGES — slot #4: athlete↔coach thread, lifted from
          inside TraineeCRM to its own top-level slot. */}
      {td && showSec('messages') && <CoachMessages
        traineeId={trainee}
        role="coach"
        recipientEmail={[
          ...(Array.isArray(td.email) ? td.email : [td.email]),
          // couples keep emails on members, not top-level. A member's email may
          // itself be an array (the edit form can store arrays), so flatten it —
          // otherwise the array element isn't a string and .find() skips it,
          // leaving a couple message with no recipient.
          ...((td.members || []).flatMap(m => { const e = m && m.email; return Array.isArray(e) ? e : [e]; })),
        ].find(e => typeof e === 'string' && e.trim()) || ''}
        senderLabel="Ohad" />}

      {/* === CRM — slot #5: cadence pill, next actions, activity feed */}
      {td && showSec('crm') && (
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

      {/* === BODYWEIGHT — slot #6 (collapsible; chart is self-carded → bare) */}
      <CollapsibleSection bare domId="td-sec-bw" title="Bodyweight" count={tBw.length} storageKey={`td-bw-${trainee}`} style={{margin:'20px 0 0', display: showSec('bw') ? undefined : 'none'}}>
        <BWChart entries={tBw} />
        <BwAddRow onAdd={(kg, dateISO) => setBwLog && setBwLog(prev => [...prev, { clientId: trainee, date: dateISO, bw: kg, blockName: null, week: null, source: 'coach' }])} />
      </CollapsibleSection>

      {/* === READINESS TRENDS — check-in graph (PAIN/SLEEP/ENERGY over time),
          the SAME graph the athlete sees in their portal (Ohad). Only shown
          once the athlete has logged at least one readiness check-in. */}
      {tAllWorkouts.some(w=>hasReadiness(w.autoregulation)) && (
        <CollapsibleSection bare domId="td-sec-readiness" title="Readiness" count={tAllWorkouts.filter(w=>hasReadiness(w.autoregulation)).length} storageKey={`td-readiness-${trainee}`} style={{margin:'20px 0 0', display: showSec('readiness') ? undefined : 'none'}}>
          <CheckinTrends workouts={tAllWorkouts} />
        </CollapsibleSection>
      )}

      {/* === WORKOUTS — slot #7 (collapsible) */}
      <CollapsibleSection bare domId="td-sec-workouts" title="Recent Workouts" count={tAllWorkouts.length} storageKey={`td-workouts-${trainee}`} style={{margin:'20px 0 0', display: showSec('workouts') ? undefined : 'none'}}>
        {tAllWorkouts.length===0?<div style={{color:C.td,fontSize:13}}>No completed workouts.</div>:
          tAllWorkouts.slice(0,10).map(w=><Card key={`${w.source}-${w.id}`} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"baseline",gap:8,minWidth:0}}><span style={{fontWeight:600,color:C.tx,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.dayName}</span>{w.week!=null&&<span style={{fontFamily:FN,fontSize:11,color:C.tm,flexShrink:0}}>Week {w.week}</span>}</div><span style={{fontSize:12,color:C.tm,flexShrink:0}}>{fmtPrettyDate(w.date)}</span></div>
            {/* Per-workout readiness — equal-width stat cells (label stacked over
                a severity-coloured value), so PAIN/SLEEP/ENERGY line up in a neat
                aligned row rather than differently-sized chips (Ohad: align +
                cleaner design). A thin top accent bar in the severity colour
                gives each cell a quiet at-a-glance read. */}
            {hasReadiness(w.autoregulation)&&(()=>{ const items=CHECKIN_METRICS.filter(m=>w.autoregulation[m.key]); return (
              <div style={{display:'grid',gridTemplateColumns:`repeat(${items.length}, minmax(0,132px))`,gap:8,marginTop:10}}>
                {items.map(m=>{ const col=readinessColor(m.key,w.autoregulation[m.key])||C.tx; return (
                  <div key={m.key} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:5,padding:'9px 8px 8px',border:`1px solid ${C.cardBd}`,borderTop:`2px solid ${col}`,background:'var(--c-sf2)',borderRadius:0}}>
                    <span style={{fontSize:8,fontFamily:FN,color:C.tm,letterSpacing:'0.2em',fontWeight:700}}>{m.label}</span>
                    <span style={{fontSize:13,fontFamily:FN,fontWeight:700,letterSpacing:'0.04em',lineHeight:1,textTransform:'uppercase',color:col}}>{w.autoregulation[m.key]}</span>
                  </div>
                );})}
              </div>
            );})()}
          </Card>)}
      </CollapsibleSection>

      {/* === ASSIGNED PROGRAMS — slot #8 */}
      {couple ? <>
        <CollapsibleSection bare domId="td-sec-programs" title="Assigned Programs" count={tp.length} storageKey={`td-programs-${trainee}`} style={{margin:"28px 0 0", display: showSec('programs') ? undefined : 'none'}} right={<>
            <button onClick={()=>setProgramSort(s=>s==='chrono'?'alpha':'chrono')} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,height:28,padding:"0 12px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:78}}>{programSort==='chrono'?'↕ DATE':'↕ A→Z'}</button>
            <button onClick={()=>setShowAssign(true)} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:28,padding:"0 14px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',whiteSpace:'nowrap',textTransform:'uppercase'}}>+ New Program</button>
          </>}>
        <div className="td-couple-row" style={{display:'flex',gap:12}}>
          {[0,1].map(mi => {
            const m = td.members[mi];
            const memberPlans = tpMember(mi);
            const sorted = [...memberPlans].sort((a,b)=>programSort==='alpha'?(a.name||'').localeCompare(b.name||''):sortProgramsRecent(a,b));
            const memberVisKey = (p) => `${td.name}:${p.name}:m${mi}`;
            // Single-click "only this" within THIS couple member's plan list.
            const onlyThisCouple = (chosenKey) => {
              const nv = { ...(portalVis || {}) };
              sorted.forEach(plan => { nv[memberVisKey(plan)] = false; });
              nv[chosenKey] = true;
              setPortalVis(nv);
            };
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
                      <ProgramCard key={p.id} plan={p} isVis={isVis} onOpen={()=>onOpenPlan&&onOpenPlan(p.id)} onUnassign={()=>{setConfirmUnassign(p.id);setUnassignTyped("")}} onOnly={()=>onlyThisCouple(visKey)} onToggleVis={()=>{const nv={...portalVis,[visKey]:!isVis};setPortalVis(nv)}} />)})}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        </CollapsibleSection>
      </> : <>
        {/* Controls live in the always-visible header (right slot) so + New
            Program / sort / visibility stay reachable even when the program list
            is collapsed. Clean order: sort → portal-visibility → + New Program
            (primary, last); wraps under the title on narrow widths. */}
        <CollapsibleSection bare domId="td-sec-programs" title="Assigned Programs" count={tp.length} storageKey={`td-programs-${trainee}`} style={{margin:"28px 0 0", display: showSec('programs') ? undefined : 'none'}} right={<>
            <button onClick={()=>setProgramSort(s=>s==='chrono'?'alpha':'chrono')} style={{background:'var(--c-sf)',border:`1px solid var(--c-ghostBd)`,borderRadius:0,height:28,boxSizing:'border-box',padding:"0 12px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:78}}>{programSort==='chrono'?'↕ DATE':'↕ A→Z'}</button>
            {bulkToggleBtn(tp, (p)=>`${td.name}:${p.name}`)}
            <button onClick={()=>setShowAssign(true)} style={{background:'var(--c-sf)',border:`1px solid ${C.ac}`,borderRadius:0,height:28,boxSizing:'border-box',padding:"0 14px",color:C.ac,cursor:"pointer",fontFamily:FN,fontSize:10,fontWeight:700,letterSpacing:'0.12em',display:'inline-flex',alignItems:'center',whiteSpace:'nowrap',textTransform:'uppercase'}}>+ New Program</button>
          </>}>
        {tp.length===0?<div style={{color:C.td,fontSize:13}}>No programs assigned.</div>:renderProgramsList()}
        </CollapsibleSection>
      </>}

      {/* === EVALUATION + INTAKE — slot #9. Grouped as one "who is
          this athlete" block: a top gap sets the pair apart from Assigned
          Programs above, while the two sit tight together (Ohad). */}
      {td && showSec('eval') && (
        <div style={{ marginTop: 28 }}>
          <TraineeEvaluation trainee={td} bwLog={bwLog} />
          {/* Renders nothing until an intake is submitted. */}
          <TraineeIntake trainee={td} />
        </div>
      )}

      {/* === PROGRESSIVE OVERLOAD — slot #10. Now the single progression
          hub: the table is the overview, each row expands into the lift's
          full record (all-time PR · trend chart · session history). The old
          standalone "Records" section was merged in here to kill the overlap. */}
      <CollapsibleSection bare domId="td-sec-overload" title="Progressive Overload" storageKey={`td-overload-${trainee}`} style={{margin:'20px 0 0', display: showSec('overload') ? undefined : 'none'}}>
        <OverloadChart workouts={[...tw, ...tcw]} exercises={exercises} />
      </CollapsibleSection>


      <Modal open={showAssign} onClose={()=>{setShowAssign(false);setPendingAssignPlan(null);setPendingBlankCouple(false)}} title={`+ New Program for ${td.name}`}>
        {pendingAssignPlan && couple ? (
          <div style={{textAlign:'center',padding:12}}>
            <div style={{fontSize:13,color:C.tm,marginBottom:16}}>Assign to which member?</div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
              {td.members.map((m,mi)=>(
                <Btn key={mi} onClick={()=>assignPlan(pendingAssignPlan, subMemberId(trainee, mi))} style={{fontSize:13,padding:'8px 20px'}}>{m.name || `Member ${mi+1}`}</Btn>
              ))}
            </div>
            <button onClick={()=>setPendingAssignPlan(null)} style={{background:'none',border:'none',color:C.td,cursor:'pointer',fontSize:11,marginTop:12}}>← Back</button>
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
            <button onClick={()=>setPendingBlankCouple(false)} style={{background:'none',border:'none',color:C.td,cursor:'pointer',fontSize:11,marginTop:12}}>← Back</button>
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
              role="button" tabIndex={0}
              onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); startBlankForTrainee(); } }}
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
      {confirmUnassign && createPortal(<div role="dialog" aria-modal="true" aria-label="Remove program" style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:C.scrim}} onClick={()=>{setConfirmUnassign(null);setUnassignTyped("")}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.rd}`,borderRadius:0,width:380,maxWidth:'calc(100vw - 24px)',padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.rd,textAlign:"center"}}>Remove Program?</h3>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.tm,textAlign:"center"}}>This will unassign <strong style={{color:C.tx}}>{(planIndex||[]).find(p=>p.id===confirmUnassign)?.name}</strong> from {td.name}.</p>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:"uppercase",fontFamily:FN,display:"block",marginBottom:4,textAlign:"center"}}>Type "remove" to confirm</label>
            <input value={unassignTyped} onChange={e=>setUnassignTyped(e.target.value)} style={{background: 'var(--c-sf2)',border:`1px solid ${C.rd}`,borderRadius:0,padding:"8px 12px",color:C.tx,fontFamily:FN,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",textAlign:"center"}} placeholder="remove" autoComplete="off" autoFocus/></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>{setConfirmUnassign(null);setUnassignTyped("")}}>Cancel</Btn>
            <Btn variant="danger" onClick={()=>{if(unassignTyped.trim().toLowerCase()==="remove"){unassignPlan(confirmUnassign);setConfirmUnassign(null);setUnassignTyped("")}}} style={{opacity:unassignTyped.trim().toLowerCase()==="remove"?1:0.3,pointerEvents:unassignTyped.trim().toLowerCase()==="remove"?"auto":"none"}}>Remove</Btn></div></div></div>, document.body)}

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
      {showArchiveConfirm && createPortal(<div role="dialog" aria-modal="true" aria-label="Archive athlete" style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:C.scrim}} onClick={()=>setShowArchiveConfirm(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:'var(--c-sf)',border:`1px solid ${C.cardBd}`,borderRadius:0,width:380,maxWidth:'calc(100vw - 24px)',padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.tx}}>Archive {td.name}?</h3>
          <p style={{margin:"0 0 20px",fontSize:13,color:C.tm}}>Client will be moved to archive. Plans, workouts, and payments are preserved. You can restore anytime.</p>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>setShowArchiveConfirm(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={handleArchive}>Archive</Btn></div></div></div>, document.body)}
      {/* Permanent delete confirm */}
      {showDeleteConfirm && createPortal(<div role="dialog" aria-modal="true" aria-label="Permanent deletion" style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",background:C.scrim}} onClick={()=>{setShowDeleteConfirm(false);setDeleteTyped("");setPurgeHistory(false)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.rd}`,borderRadius:0,width:440,maxWidth:'calc(100vw - 24px)',padding:24}}>
          <h3 style={{margin:"0 0 8px",fontFamily:FN,fontSize:15,color:C.rd,textAlign:"center"}}>⚠ Permanent Deletion</h3>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.tm,textAlign:"center"}}>This will permanently remove <strong style={{color:C.tx}}>{td.name}</strong> from the roster. By default their programs, workout history and payment records are kept (just no longer reachable).</p>
          <p style={{margin:"0 0 14px",fontSize:13,color:C.rd,fontWeight:600,textAlign:"center"}}>This cannot be undone.</p>
          {/* Opt-in hard purge — separate, deliberate choice. */}
          <label style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:16,padding:"10px 12px",border:`1px solid ${purgeHistory?C.rd:C.cardBd}`,background:purgeHistory?C.rdD:'transparent',cursor:"pointer"}}>
            <input type="checkbox" checked={purgeHistory} onChange={e=>setPurgeHistory(e.target.checked)} style={{marginTop:2,accentColor:C.rd,cursor:"pointer"}}/>
            <span style={{fontSize:12,color:purgeHistory?C.rd:C.tm,lineHeight:1.45}}>Also <strong>erase all their history</strong> — programs, workouts, payments, messages, evaluations. This wipes their revenue from your reports and is not recoverable.</span>
          </label>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:C.tm,textTransform:"uppercase",fontFamily:FN,display:"block",marginBottom:4,textAlign:"center"}}>Type "DELETE" to confirm</label>
            <input value={deleteTyped} onChange={e=>setDeleteTyped(e.target.value)} style={{background: 'var(--c-sf2)',border:`1px solid ${C.rd}`,borderRadius:0,padding:"8px 12px",color:C.tx,fontFamily:FN,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",letterSpacing:"0.1em",textAlign:"center"}} placeholder="DELETE" autoComplete="off"/></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>{setShowDeleteConfirm(false);setDeleteTyped("");setPurgeHistory(false)}}>Cancel</Btn>
            <Btn variant="danger" disabled={purging} onClick={()=>{if(deleteTyped.trim().toUpperCase()==="DELETE")handlePermanentDelete()}} style={{opacity:(deleteTyped.trim().toUpperCase()==="DELETE"&&!purging)?1:0.3,pointerEvents:(deleteTyped.trim().toUpperCase()==="DELETE"&&!purging)?"auto":"none"}}>{purging?'Purging…':(purgeHistory?'Delete + Erase History':'Delete Permanently')}</Btn></div></div></div>, document.body)}
    </div>);
}

// Bodyweight sparkline + delta. Plots one point per bw_log entry, oldest →
// newest. Shows the absolute first/current/min/max values plus a Δ from the
// first logged weight so the coach gets net change at a glance.
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

  // Explicit Cancel — the user chose to discard; purge the draft.
  const handleCancel = () => {
    try { localStorage.removeItem(draftKey); } catch {}
    editAutosave.markClean();
    onClose();
  };
  // Dismiss (Escape / overlay click) is NOT a discard decision — keep the
  // draft so an accidental Escape mid-edit doesn't destroy exactly what
  // the autosave exists to protect. It restores on next open.
  const handleDismiss = () => { onClose(); };

  return (
    <Modal open={true} onClose={handleDismiss} title={`Edit — ${td.name}`} wide>
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
            {/* Status moved out of EDIT — changed via the status pill at the top
                of the trainee page (Ohad). */}
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
                    <Input label="Phone" value={m.phone || ""} onChange={e => upd('phone', e.target.value)} placeholder="+972..." autoComplete="off" />
                    <Select label="Gender" placeholder="—" options={GENDER_OPTIONS} value={m.gender || ""} onChange={v => upd('gender', v)} />
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
            <Input label="Phone" value={editForm.phone || ""} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+972..." autoComplete="off" />
            <Select label="Gender" placeholder="—" options={GENDER_OPTIONS} value={editForm.gender || ""} onChange={v => setEditForm({ ...editForm, gender: v })} />
            <Input label="Age" type="number" value={editForm.age || ""} onChange={e => setEditForm({ ...editForm, age: e.target.value })} />
            <Input label="Weight (kg)" type="number" value={editForm.weight || ""} onChange={e => setEditForm({ ...editForm, weight: e.target.value })} />
            <Input label="Height (cm)" type="number" value={editForm.height || ""} onChange={e => setEditForm({ ...editForm, height: e.target.value })} />
            <Select label="Format" options={TRAINING_FORMATS} value={editForm.format || ""} onChange={v => setEditForm({ ...editForm, format: v })} />
            {/* Status moved out of EDIT — changed via the status pill at the top
                of the trainee page (Ohad). */}
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
