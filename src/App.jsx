import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { C, FN, FB, uid, EXPO_LOGO, EXPO_ICON, EXPO_LOGO_NAV } from './theme';
import { useStore } from './useStore';
import { useSupaStore, useSupaClientWorkouts, useSupaBwLog, useSupaWeeklyFocus } from './useSupaStore';
import { usePlanIndex, savePlan } from './usePlansStore';
import { supabase } from './supabase';
import { Btn, baseBtn } from './ui';
import * as XLSX from 'xlsx';
import TraineesView from './TraineesView';
import TraineeDetail from './TraineeDetail';
import ExercisesView from './ExercisesView';
import PlansView from './PlansView';
import WorkoutsView from './WorkoutsView';
import ClientPortal from './ClientPortal';
import DashboardView from './DashboardView';
import WorkoutReview from './WorkoutReview';

// Memo wrappers prevent re-renders when parent state changes but these props haven't
const MemoPlans = React.memo(PlansView);
const MemoExercises = React.memo(ExercisesView);
const MemoWorkouts = React.memo(WorkoutsView);
const MemoReview = React.memo(WorkoutReview);

const KEYS = { trainees:"expo-trainees", exercises:"expo-exercises", workouts:"expo-workouts", payments:"expo-payments", cw:"expo-cw", bw:"expo-bw" };

function parseSingleSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Build hyperlink lookup: row,col -> URL (SheetJS stores hyperlinks on cell objects)
  const getHyperlink = (r, c) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    const cell = ws[cellRef];
    return cell?.l?.Target || cell?.l?.target || '';
  };
  const exercises = []; const days = []; let currentDay = null; let blockName = '';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]; const a = String(row[0]||'').trim(); const b = String(row[1]||'').trim();
    if (r===0 && a && !blockName) { blockName = a; continue; }
    if (r===0 && !a && b && !blockName) { blockName = b; continue; }
    if (a==='#' && b) { if (currentDay?.ex.length>0) days.push(currentDay); currentDay={name:b,ex:[]}; continue; }
    if (!a||a==='#'||a.toLowerCase().includes('rest')||a.toLowerCase().includes('off')) continue;
    if (!b||b.toLowerCase()==='exercise'||b.toLowerCase()==='name') continue;
    if (b.toLowerCase().includes('rest')&&b.toLowerCase().includes('off')) continue;
    if (a.toLowerCase()==='instructions'||a.toLowerCase().startsWith('bb -')||a.toLowerCase().startsWith('bb exercises')) continue;
    const tempo=String(row[4]||'').trim(); const setsRaw=String(row[5]||'3').trim(); const repsRaw=String(row[6]||'').trim();
    let sets=parseInt(setsRaw)||3; const wave=[];
    if (repsRaw.includes('>')) { for(let ci=7;ci<=10;ci++){if(row[ci])wave.push(String(row[ci]).trim())} }
    let superset=''; const ssMatch=a.match(/\d+([a-e])/i); if(ssMatch)superset=ssMatch[1].toUpperCase();
    const eid='ex_'+uid(); const exName=b||String(row[2]||'').trim(); if(!exName)continue;
    const videoLink=getHyperlink(r, 3);
    exercises.push({id:eid,title:exName,videoLink,cues:'',category:'',resistanceType:'',movementPattern:'',laterality:'',primaryMuscles:'',secondaryMuscles:'',primaryJoints:'',jointMovements:'',bodyPosition:'',movementType:'',notes:''});
    const dayEx={eid,s:sets,r:repsRaw||'8-12'}; if(tempo&&tempo.toLowerCase()!=='tempo'&&tempo.toLowerCase()!=='none')dayEx.tempo=tempo; if(wave.length>0)dayEx.wk=wave; if(superset)dayEx.superset=superset;
    if(!currentDay)currentDay={name:'Day 1',ex:[]}; currentDay.ex.push(dayEx);
  }
  if(currentDay?.ex.length>0) days.push(currentDay);
  return {blockName:blockName||sheetName,exercises,days};
}

function parseSpreadsheet(data, fileName) {
  const wb=XLSX.read(data,{type:'array'}); const traineeName=fileName.replace(/\.(xlsx|xls|csv)$/i,'').replace(/[-_]/g,' ').replace(/\s*Training Program\s*$/i,'').replace(/^מעקב\s*/,'').replace(/\s*מעקב\s*$/,'').replace(/^\s*-\s*/,'').replace(/\s*-\s*$/,'').trim();
  const allExercises=[]; const allPlans=[]; const exTitleMap={};
  for(const sheetName of wb.SheetNames){const ws=wb.Sheets[sheetName]; const{blockName,exercises,days}=parseSingleSheet(ws,sheetName); if(days.length===0)continue;
    const sheetExercises=[]; for(const ex of exercises){if(!exTitleMap[ex.title]){exTitleMap[ex.title]=ex.id;allExercises.push(ex)}sheetExercises.push({...ex,dedupId:exTitleMap[ex.title]})}
    const remappedDays=days.map(d=>({...d,ex:d.ex.map(e=>{const orig=sheetExercises.find(se=>se.id===e.eid);return{...e,eid:orig?orig.dedupId:e.eid}})}));
    allPlans.push({id:'plan_'+uid(),name:blockName,phase:'',rest:'',warmup:[],days:remappedDays});
  }
  return{trainee:{id:'tr_'+uid(),name:traineeName,status:'Active',format:'In-Person Private',package:'8 Sessions',sessionsRemaining:8},exercises:allExercises,plans:allPlans,version:'2.0',source:fileName};
}

export default function App() {
  const [trainees,setTrainees,tL]=useSupaStore(KEYS.trainees,[]);
  const [exercises,setExercises,eL]=useSupaStore(KEYS.exercises,[]);
  const { index: planIndex, loaded: pL, reload: reloadPlanIndex } = usePlanIndex();
  const [workouts,setWorkouts,wL]=useSupaStore(KEYS.workouts,[]);
  const [payments,setPayments,pyL]=useSupaStore(KEYS.payments,[]);
  const [clientWorkouts,setClientWorkouts]=useSupaClientWorkouts([]);
  const [bwLog,setBwLog]=useSupaBwLog([]);
  const [weeklyFocus,setWeeklyFocus]=useSupaWeeklyFocus({});
  const [portalVis,setPortalVis]=useSupaStore('expo-portal-vis',{});

  // Routing: / = portal, /coach = trainer, /coach/tab = specific tab
  const getRoute = () => {
    const p = window.location.pathname;
    if (p.startsWith('/coach')) {
      const sub = p.replace('/coach','').replace(/^\//,'');
      if (sub.startsWith('trainees/')) return { mode:'coach', tab:'trainees', traineeId:sub.split('/')[1] };
      const tabMap = {dashboard:'dashboard',trainees:'trainees',programs:'plans',exercises:'exercises',review:'review',workouts:'workouts'};
      return { mode:'coach', tab: tabMap[sub] || 'dashboard', traineeId:null };
    }
    return { mode:'portal' };
  };
  const initRoute = getRoute();
  const isCoach = initRoute.mode === 'coach';

  const [tab,setTab]=useState(isCoach ? initRoute.tab : "client");
  const [selectedTrainee,setSelectedTrainee]=useState(initRoute.traineeId || null);
  const [selectedPlanId,setSelectedPlanId]=useState(null);
  const [importMsg,setImportMsg]=useState(null);
  const [pendingImport,setPendingImport]=useState(null); // {parsed, type:'multi'|'single'} — awaiting trainee selection
  const [importSelectedTrainees,setImportSelectedTrainees]=useState([]); // selected trainee IDs for import
  const [trainerCode,setTrainerCode]=useState('');
  const [trainerAuth,setTrainerAuth]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const fileRef=useRef(null);

  // Sync URL when tab or trainee changes (coach mode only)
  const updateURL = useCallback((newTab, newTrainee) => {
    if (tab === 'client' && !isCoach) return;
    const tabUrl = {dashboard:'dashboard',trainees:'trainees',plans:'programs',exercises:'exercises',review:'review',workouts:'workouts'};
    let path = '/coach/' + (tabUrl[newTab] || 'dashboard');
    if (newTab === 'trainees' && newTrainee) path += '/' + newTrainee;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, [tab, isCoach]);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const r = getRoute();
      if (r.mode === 'coach') { setTab(r.tab); setSelectedTrainee(r.traineeId); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navTo = useCallback((newTab, newTrainee) => {
    setTab(newTab);
    setSelectedTrainee(newTrainee || null);
    updateURL(newTab, newTrainee);
  }, [updateURL]);

  // One-time billing data migration
  useEffect(()=>{
    if(!trainees.length) return;
    const BILLING={
      "איילת קזצב":{monthly:800,perSession:200,lastPayment:"2026-01-21"},
      "משה ודנה טיני":{monthly:2400,perSession:200,lastPayment:"2026-01-18"},
      "מיה וחילק יניב":{monthly:800,perSession:250,lastPayment:"2026-02-06"},
      "נטע ותום רונן":{monthly:1200,perSession:300,lastPayment:"2026-04-01"},
      "לימור ודניאל ספן":{monthly:1200,perSession:300,lastPayment:"2026-01-28"},
      "עמית יהודאי":{monthly:500,lastPayment:"2026-04-01"},
      "רון יונקר":{monthly:0,lastPayment:"2026-03-16"},
      "דיאגו דיי":{monthly:800,lastPayment:"2026-02-12"},
      "טל סיאונוב":{monthly:600,lastPayment:"2026-04-06"},
      "רועי הצבי":{monthly:0,lastPayment:"2025-09-30"},
    };
    const needsUpdate=trainees.some(t=>BILLING[t.name]&&!t.monthly);
    if(needsUpdate){
      setTrainees(prev=>prev.map(t=>{
        const b=BILLING[t.name];
        return b?{...t,monthly:b.monthly||t.monthly||0,perSession:b.perSession||t.perSession||0,lastPayment:b.lastPayment||t.lastPayment||""}:t;
      }));
    }
  },[trainees.length]);

  const handleDecrementSession=useCallback(tid=>{setTrainees(prev=>prev.map(t=>t.id===tid&&t.sessionsRemaining>0?{...t,sessionsRemaining:t.sessionsRemaining-1}:t))},[setTrainees]);

  const doImportSingle=async(data)=>{
    const trainee={...data.trainee,id:data.trainee.id||uid(),email:"",phone:"",age:"",weight:"",height:"",injuries:"",goals:"",notes:"",startDate:new Date().toISOString().slice(0,10),packagePrice:""};
    setTrainees(prev=>{const exists=prev.find(t=>t.name===trainee.name);if(exists){trainee.id=exists.id;return prev.map(t=>t.name===trainee.name?{...t,...trainee}:t)}return[...prev,trainee]});
    const exMap={};
    setExercises(prev=>{const u=[...prev];for(const ex of data.exercises){const e=u.find(x=>x.title===ex.title);if(e){exMap[ex.id]=e.id}else{const nw={...ex,id:ex.id||uid()};exMap[ex.id]=nw.id;u.push(nw)}}return u});
    const plan={id:data.plan.id||uid(),name:data.plan.name,traineeId:trainee.id,phase:data.plan.phase||"",notes:"",createdAt:new Date().toISOString(),
      days:(data.plan.days||[]).map(d=>({id:uid(),name:d.name,exercises:(d.ex||[]).map((ex,i)=>({id:uid(),exerciseId:exMap[ex.eid]||ex.eid,sets:ex.s||3,reps:ex.r||"8-12",load:"",rpe:"",tempo:ex.tempo||"",rest:"90",notes:"",order:i,superset:ex.superset||""}))}))};
    await savePlan(plan);
    await reloadPlanIndex();
    return{name:trainee.name,days:plan.days.length,exercises:data.exercises.length,plans:1};
  };

  const doImportMulti=async(data, targetTraineeIds)=>{
    // Add exercises to the library (dedup by title)
    const exMap={};
    setExercises(prev=>{const u=[...prev];for(const ex of data.exercises){const e=u.find(x=>x.title===ex.title);if(e){exMap[ex.id]=e.id}else{const nw={...ex,id:ex.id||uid()};exMap[ex.id]=nw.id;u.push(nw)}}return u});
    let totalPlans=0;
    for(const tid of targetTraineeIds){
      const newPlans=data.plans.map(p=>{totalPlans++;return{id:'plan_'+uid(),name:p.name,traineeId:tid,phase:p.phase||"",notes:"",createdAt:new Date().toISOString(),
        days:(p.days||[]).map(d=>({id:uid(),name:d.name,exercises:(d.ex||[]).map((ex,i)=>({id:uid(),exerciseId:exMap[ex.eid]||ex.eid,sets:ex.s||3,reps:ex.r||"8-12",load:"",rpe:"",tempo:ex.tempo||"",rest:"90",notes:"",order:i,superset:ex.superset||""}))}))};});
      for(const p of newPlans){ await savePlan(p); }
    }
    await reloadPlanIndex();
    const names=targetTraineeIds.map(id=>trainees.find(t=>t.id===id)?.name||'?').join(', ');
    return{names,exercises:data.exercises.length,plans:totalPlans};
  };

  const handleImport=(e)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='json'){
      const reader=new FileReader();
      reader.onload=async(ev)=>{
        try{
          const data=JSON.parse(ev.target.result);
          if(data.trainee && data.plan && data.exercises){
            const r=await doImportSingle(data);
            setImportMsg(`✓ Imported: ${r.name} — ${r.days} days, ${r.exercises} exercises`);
          } else if(data.trainees && !data.exportDate){
            let added=0, updated=0;
            setTrainees(prev=>{
              const result=[...prev];
              for(const t of data.trainees){
                const existing=result.find(x=>x.name===t.name);
                if(existing){const idx=result.indexOf(existing);result[idx]={...existing,...t,id:existing.id};updated++}
                else{result.push(t);added++}
              }
              return result;
            });
            if(data.payments){setPayments(prev=>[...prev,...data.payments]);}
            setImportMsg(`✓ Trainees: ${added} added, ${updated} updated${data.payments?`, ${data.payments.length} payments`:''}`);
          } else if(data.exportDate){
            if(data.trainees)setTrainees(data.trainees); if(data.exercises)setExercises(data.exercises);
            if(data.plans && Array.isArray(data.plans)){ for(const p of data.plans){ await savePlan(p); } await reloadPlanIndex(); }
            if(data.workouts)setWorkouts(data.workouts); if(data.payments)setPayments(data.payments);
            setImportMsg("✓ Full backup restored");
          } else{setImportMsg("⚠ Unrecognized JSON format")}
        }catch(err){setImportMsg("✗ Error: "+err.message)}
        setTimeout(()=>setImportMsg(null),6000);
      }; reader.readAsText(file);
    } else if(['xlsx','xls','csv'].includes(ext)){
      const reader=new FileReader();
      reader.onload=async(ev)=>{
        try{
          const parsed=parseSpreadsheet(new Uint8Array(ev.target.result),file.name);
          // Stage for trainee selection instead of importing immediately
          setPendingImport({parsed,fileName:file.name,ext:ext.toUpperCase()});
          setImportSelectedTrainees([]);
        }catch(err){setImportMsg("✗ Error: "+err.message);setTimeout(()=>setImportMsg(null),6000)}
      }; reader.readAsArrayBuffer(file);
    } else{setImportMsg("⚠ Unsupported file type");setTimeout(()=>setImportMsg(null),4000)}
    e.target.value="";
  };

  const handleExport=async()=>{
    const { data: allPlans } = await supabase.from('plans').select('*');
    const data=JSON.stringify({trainees,exercises,plans:allPlans||[],workouts,payments,clientWorkouts,bwLog,exportDate:new Date().toISOString(),version:"1.0"},null,2);
    const blob=new Blob([data],{type:"application/json"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`expo-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
  };

  const handleDrop=(e)=>{e.preventDefault();setDragOver(false);const file=e.dataTransfer?.files?.[0];if(file)handleImport({target:{files:[file],value:""}})};
  const handleDragOver=(e)=>{e.preventDefault();setDragOver(true)};
  const handleDragLeave=()=>{setDragOver(false)};

  const handleConfirmImport=async()=>{
    if(!pendingImport||importSelectedTrainees.length===0) return;
    try{
      const r=await doImportMulti(pendingImport.parsed,importSelectedTrainees);
      setImportMsg(`✓ Imported ${pendingImport.ext}: ${r.names} — ${r.plans} blocks, ${r.exercises} unique exercises`);
    }catch(err){setImportMsg("✗ Error: "+err.message)}
    setPendingImport(null);setImportSelectedTrainees([]);
    setTimeout(()=>setImportMsg(null),6000);
  };
  const toggleImportTrainee=(tid)=>{
    setImportSelectedTrainees(prev=>prev.includes(tid)?prev.filter(x=>x!==tid):[...prev,tid]);
  };

  const tabs=[{key:"dashboard",label:"Dashboard",count:null},{key:"trainees",label:"Trainees",count:trainees.length},{key:"plans",label:"Programs",count:planIndex.length},{key:"exercises",label:"Exercises",count:exercises.length},{key:"review",label:"Review",count:null},{key:"client",label:"Portal",count:null}];

  // Pre-compute plan counts per trainee — avoids passing full plans array to Dashboard
  const planCounts = useMemo(() => {
    const m = {};
    planIndex.forEach(p => { if (p.traineeId) m[p.traineeId] = (m[p.traineeId]||0) + 1; });
    return m;
  }, [planIndex]);

  // Presence polling — read which clients are online
  const [presence, setPresence] = useState({});
  useEffect(() => {
    if (!isCoach) return;
    const poll = async () => {
      try {
        const { data } = await supabase.from('store').select('value').eq('key', 'expo-presence').maybeSingle();
        if (data?.value) setPresence(data.value);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [isCoach]);

  if(tab==="client")return(<div>
    {isCoach&&<div style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,padding:"8px 20px",display:"flex",justifyContent:"center"}}>
      <button onClick={()=>navTo("dashboard")} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:12}}>← Trainer View</button></div>}
    <ClientPortal clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} bwLog={bwLog} setBwLog={setBwLog} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} portalVis={portalVis} trainerExercises={exercises} trainees={trainees} onDecrementSession={handleDecrementSession}/></div>);

  // Trainer login gate (portal bypasses this)
  if(!trainerAuth && isCoach) return(
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:60,marginBottom:12}}/>
        <div style={{color:C.tm,fontSize:15}}>Coaching Portal</div></div>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:14,padding:28,textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:16}}>Enter access code</div>
          <input value={trainerCode} onChange={e=>setTrainerCode(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){if(trainerCode==='#81'){setTrainerAuth(true)}else{setTrainerCode('')}}}}
            placeholder="Code" type="password" autoFocus
            style={{width:"100%",background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"14px 16px",color:C.tx,fontFamily:FB,fontSize:15,outline:"none",boxSizing:"border-box",textAlign:"center",letterSpacing:"0.1em",marginBottom:12}}/>
          <button onClick={()=>{if(trainerCode==='#81'){setTrainerAuth(true)}else{setTrainerCode('')}}}
            style={{width:"100%",padding:14,borderRadius:10,border:"none",background:trainerCode?C.ac:C.sf3,color:trainerCode?"#000":C.td,fontFamily:FB,fontSize:15,fontWeight:700,cursor:trainerCode?"pointer":"default",transition:"all .15s"}}>
            Enter</button>
        </div>
        <button onClick={()=>window.location.href='/'} style={{background:"none",border:"none",color:C.td,cursor:"pointer",fontFamily:FB,fontSize:12,marginTop:20,display:"block",width:"100%",textAlign:"center"}}>Training Portal →</button>
      </div></div>);

  // Wait for small stores only — plans/exercises load in background
  const storesReady = tL && wL && pyL;
  if (!storesReady) return (
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <img src={EXPO_LOGO_NAV} alt="EXPO" style={{height:50}} />
      <div style={{color:C.td,fontSize:13}}>Loading data...</div>
    </div>);

  return(
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB}}>
      <header style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:100}}>
        <style>{`.hdr-scroll::-webkit-scrollbar{display:none}`}</style>
        <div className="hdr-scroll" style={{maxWidth:1200,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",height:56,overflowX:"auto",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none"}}>
          <div style={{flex:"0 0 auto",position:"relative",width:83,height:56,marginRight:12,overflow:"hidden"}}>
            <img src={EXPO_LOGO} alt="EXPO" style={{height:56,position:"absolute",left:0,bottom:16}}/></div>
          <nav style={{display:"flex",gap:2,alignItems:"center",flex:"1 1 auto",justifyContent:"center",minWidth:"max-content"}}>
            {tabs.map(t=>(<button key={t.key} onClick={()=>{if(t.key==='client'){window.location.href='/'}else{navTo(t.key)}}} style={{...baseBtn,background:tab===t.key?C.acD:"transparent",color:tab===t.key?C.ac:C.tm,borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:tab===t.key?700:500,whiteSpace:"nowrap"}}>
              <span>{t.label}</span>{t.count!==null&&<span style={{fontSize:10,color:tab===t.key?C.ac:C.td,fontFamily:FN}}>{t.count}</span>}</button>))}</nav>
          <div style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:2,marginLeft:12}}>
            <button onClick={()=>fileRef.current?.click()} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} title="Import — click or drag file here" style={{...baseBtn,background:dragOver?C.acD:"transparent",color:dragOver?C.ac:C.tm,padding:"6px 8px",fontSize:14,borderRadius:6,border:dragOver?`1px dashed ${C.ac}`:"1px solid transparent",transition:"all .15s"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
            <button onClick={handleExport} title="Export" style={{...baseBtn,background:"transparent",color:C.tm,padding:"6px 8px",fontSize:14,borderRadius:6}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
            <input ref={fileRef} type="file" accept=".json,.xlsx,.xls,.csv" onChange={handleImport} style={{display:"none"}}/></div></div></header>
      {importMsg&&<div style={{maxWidth:1200,margin:"0 auto",padding:"8px 20px"}}><div style={{background:importMsg.startsWith("✗")?C.rdD:importMsg.startsWith("⚠")?C.orD:C.gnD,color:importMsg.startsWith("✗")?C.rd:importMsg.startsWith("⚠")?C.or:C.gn,borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:600}}>{importMsg}</div></div>}
      <main style={{maxWidth:1200,margin:"0 auto",padding:"12px"}}>
        {tab==="dashboard"&&<DashboardView trainees={trainees} planCounts={planCounts} workouts={workouts} payments={payments} presence={presence} onSelectTrainee={id=>navTo("trainees",id)}/>}
        {tab==="trainees"&&!selectedTrainee&&<TraineesView trainees={trainees} setTrainees={setTrainees} planCounts={planCounts} portalVis={portalVis} presence={presence} onSelect={id=>navTo("trainees",id)}/>}
        {tab==="trainees"&&selectedTrainee&&<TraineeDetail trainee={selectedTrainee} trainees={trainees} setTrainees={setTrainees} planIndex={planIndex} reloadPlanIndex={reloadPlanIndex} onOpenPlan={pid=>{setSelectedPlanId(pid);navTo("plans")}} exercises={exercises} workouts={workouts} payments={payments} setPayments={setPayments} portalVis={portalVis} setPortalVis={setPortalVis} presence={presence} onBack={()=>navTo("trainees")}/>}
        {tab==="exercises"&&<MemoExercises exercises={exercises} setExercises={setExercises}/>}
        {tab==="review"&&<MemoReview clientWorkouts={clientWorkouts} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} workouts={workouts} setWorkouts={setWorkouts} planIndex={planIndex} trainees={trainees} exercises={exercises} onDecrementSession={handleDecrementSession}/>}
        {tab==="plans"&&<MemoPlans planIndex={planIndex} reloadIndex={reloadPlanIndex} trainees={trainees} exercises={exercises} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} openPlanId={selectedPlanId} onPlanOpened={()=>setSelectedPlanId(null)}/>}
        {tab==="workouts"&&<MemoWorkouts workouts={workouts} setWorkouts={setWorkouts} planIndex={planIndex} trainees={trainees} exercises={exercises} onDecrementSession={handleDecrementSession}/>}
      </main>
      {/* Import trainee assignment modal */}
      {pendingImport&&<div style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}} onClick={()=>setPendingImport(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,width:480,maxHeight:"80vh",overflow:"auto",padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{margin:0,fontFamily:FN,fontSize:16,color:C.tx}}>Assign Imported Program</h3>
            <button onClick={()=>setPendingImport(null)} style={{background:"none",border:"none",color:C.tm,cursor:"pointer",padding:4,fontSize:16}}>✕</button></div>
          <div style={{background:C.sf2,borderRadius:8,padding:12,marginBottom:16}}>
            <div style={{fontSize:13,color:C.tx,fontWeight:600}}>{pendingImport.parsed.plans?.length||0} block{(pendingImport.parsed.plans?.length||0)!==1?'s':''} · {pendingImport.parsed.exercises?.length||0} exercises</div>
            <div style={{fontSize:11,color:C.tm,marginTop:4}}>{pendingImport.fileName}</div>
            {pendingImport.parsed.plans?.map(p=><div key={p.id} style={{fontSize:12,color:C.ac,marginTop:4}}>• {p.name} — {p.days?.length||0} days</div>)}
          </div>
          <div style={{fontSize:11,fontFamily:FN,color:C.td,textTransform:"uppercase",marginBottom:8}}>Assign to trainee(s)</div>
          <div style={{maxHeight:300,overflow:"auto",marginBottom:16}}>
            {trainees.filter(t=>t.status!=="Archived").map(t=>{
              const sel=importSelectedTrainees.includes(t.id);
              return <div key={t.id} onClick={()=>toggleImportTrainee(t.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:6,cursor:"pointer",background:sel?C.acD:"transparent",border:`1px solid ${sel?C.ac:C.bd}`,marginBottom:4,transition:"all .15s"}}>
                <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${sel?C.ac:C.bd2}`,background:sel?C.ac:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {sel&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <div>
                  <div style={{fontSize:13,color:C.tx,fontWeight:600}}>{t.name}</div>
                  <div style={{fontSize:11,color:C.tm}}>{t.format}</div>
                </div>
              </div>})}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn variant="ghost" onClick={()=>setPendingImport(null)}>Cancel</Btn>
            <Btn onClick={handleConfirmImport} style={{opacity:importSelectedTrainees.length?1:0.4,pointerEvents:importSelectedTrainees.length?"auto":"none"}}>
              Import to {importSelectedTrainees.length||0} trainee{importSelectedTrainees.length!==1?'s':''}</Btn>
          </div>
        </div>
      </div>}
    </div>);
}
