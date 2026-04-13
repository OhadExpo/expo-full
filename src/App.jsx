import React, { useState, useCallback, useRef, useEffect } from 'react';
import { C, FN, FB, uid, EXPO_LOGO, EXPO_ICON } from './theme';
import { useStore } from './useStore';
import { useSupaStore, useSupaClientWorkouts, useSupaBwLog, useSupaWeeklyFocus } from './useSupaStore';
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

const KEYS = { trainees:"expo-trainees", exercises:"expo-exercises", plans:"expo-plans", workouts:"expo-workouts", payments:"expo-payments", cw:"expo-cw", bw:"expo-bw" };

function parseSingleSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
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
    exercises.push({id:eid,title:exName,videoLink:'',cues:'',category:'',resistanceType:'',movementPattern:'',laterality:'',primaryMuscles:'',secondaryMuscles:'',primaryJoints:'',jointMovements:'',bodyPosition:'',movementType:'',notes:''});
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
  const [trainees,setTrainees]=useSupaStore(KEYS.trainees,[]);
  const [exercises,setExercises]=useSupaStore(KEYS.exercises,[]);
  const [plans,setPlans]=useSupaStore(KEYS.plans,[]);
  const [workouts,setWorkouts]=useSupaStore(KEYS.workouts,[]);
  const [payments,setPayments]=useSupaStore(KEYS.payments,[]);
  const [clientWorkouts,setClientWorkouts]=useSupaClientWorkouts([]);
  const [bwLog,setBwLog]=useSupaBwLog([]);
  const [weeklyFocus,setWeeklyFocus]=useSupaWeeklyFocus({});
  const [portalVis,setPortalVis]=useSupaStore('expo-portal-vis',{});
  const isPortalDirect = typeof window !== 'undefined' && (window.location.pathname === '/portal' || window.location.search.includes('portal') || window.location.hash.includes('portal'));
  const [tab,setTab]=useState(isPortalDirect ? "client" : "dashboard");
  const [selectedTrainee,setSelectedTrainee]=useState(null);
  const [importMsg,setImportMsg]=useState(null);
  const [trainerCode,setTrainerCode]=useState('');
  const [trainerAuth,setTrainerAuth]=useState(()=>{ try{return localStorage.getItem('expo-trainer-auth')==='1'}catch{return false} });
  const fileRef=useRef(null);

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

  const doImportSingle=(data)=>{
    const trainee={...data.trainee,id:data.trainee.id||uid(),email:"",phone:"",age:"",weight:"",height:"",injuries:"",goals:"",notes:"",startDate:new Date().toISOString().slice(0,10),packagePrice:""};
    setTrainees(prev=>{const exists=prev.find(t=>t.name===trainee.name);if(exists){trainee.id=exists.id;return prev.map(t=>t.name===trainee.name?{...t,...trainee}:t)}return[...prev,trainee]});
    const exMap={};
    setExercises(prev=>{const u=[...prev];for(const ex of data.exercises){const e=u.find(x=>x.title===ex.title);if(e){exMap[ex.id]=e.id}else{const nw={...ex,id:ex.id||uid()};exMap[ex.id]=nw.id;u.push(nw)}}return u});
    const plan={id:data.plan.id||uid(),name:data.plan.name,traineeId:trainee.id,phase:data.plan.phase||"",notes:"",createdAt:new Date().toISOString(),
      days:(data.plan.days||[]).map(d=>({id:uid(),name:d.name,exercises:(d.ex||[]).map((ex,i)=>({id:uid(),exerciseId:exMap[ex.eid]||ex.eid,sets:ex.s||3,reps:ex.r||"8-12",load:"",rpe:"",tempo:ex.tempo||"",rest:"90",notes:"",order:i,superset:ex.superset||""}))}))};
    setPlans(prev=>[...prev,plan]);
    return{name:trainee.name,days:plan.days.length,exercises:data.exercises.length,plans:1};
  };

  const doImportMulti=(data)=>{
    const trainee={...data.trainee,id:data.trainee.id||uid(),email:"",phone:"",age:"",weight:"",height:"",injuries:"",goals:"",notes:"",startDate:new Date().toISOString().slice(0,10),packagePrice:""};
    setTrainees(prev=>{const exists=prev.find(t=>t.name===trainee.name);if(exists){trainee.id=exists.id;return prev.map(t=>t.name===trainee.name?{...t,...trainee}:t)}return[...prev,trainee]});
    const exMap={};
    setExercises(prev=>{const u=[...prev];for(const ex of data.exercises){const e=u.find(x=>x.title===ex.title);if(e){exMap[ex.id]=e.id}else{const nw={...ex,id:ex.id||uid()};exMap[ex.id]=nw.id;u.push(nw)}}return u});
    let pc=0;
    const newPlans=data.plans.map(p=>{pc++;return{id:p.id||uid(),name:p.name,traineeId:trainee.id,phase:p.phase||"",notes:"",createdAt:new Date().toISOString(),
      days:(p.days||[]).map(d=>({id:uid(),name:d.name,exercises:(d.ex||[]).map((ex,i)=>({id:uid(),exerciseId:exMap[ex.eid]||ex.eid,sets:ex.s||3,reps:ex.r||"8-12",load:"",rpe:"",tempo:ex.tempo||"",rest:"90",notes:"",order:i,superset:ex.superset||""}))}))};});
    setPlans(prev=>[...prev,...newPlans]);
    return{name:trainee.name,exercises:data.exercises.length,plans:pc};
  };

  const handleImport=(e)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='json'){
      const reader=new FileReader();
      reader.onload=(ev)=>{
        try{
          const data=JSON.parse(ev.target.result);
          if(data.trainee && data.plan && data.exercises){
            const r=doImportSingle(data);
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
            if(data.plans)setPlans(data.plans); if(data.workouts)setWorkouts(data.workouts); if(data.payments)setPayments(data.payments);
            setImportMsg("✓ Full backup restored");
          } else{setImportMsg("⚠ Unrecognized JSON format")}
        }catch(err){setImportMsg("✗ Error: "+err.message)}
        setTimeout(()=>setImportMsg(null),6000);
      }; reader.readAsText(file);
    } else if(['xlsx','xls','csv'].includes(ext)){
      const reader=new FileReader();
      reader.onload=(ev)=>{
        try{
          const parsed=parseSpreadsheet(new Uint8Array(ev.target.result),file.name);
          const r=doImportMulti(parsed);
          setImportMsg(`✓ Imported ${ext.toUpperCase()}: ${r.name} — ${r.plans} blocks, ${r.exercises} unique exercises`);
        }catch(err){setImportMsg("✗ Error: "+err.message)}
        setTimeout(()=>setImportMsg(null),6000);
      }; reader.readAsArrayBuffer(file);
    } else{setImportMsg("⚠ Unsupported file type");setTimeout(()=>setImportMsg(null),4000)}
    e.target.value="";
  };

  const handleExport=()=>{
    const data=JSON.stringify({trainees,exercises,plans,workouts,payments,clientWorkouts,bwLog,exportDate:new Date().toISOString(),version:"1.0"},null,2);
    const blob=new Blob([data],{type:"application/json"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`expo-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
  };

  const tabs=[{key:"dashboard",label:"Dashboard",count:null},{key:"trainees",label:"Trainees",count:trainees.length},{key:"plans",label:"Plans",count:plans.length},{key:"exercises",label:"Exercises",count:exercises.length},{key:"review",label:"Review",count:null},{key:"client",label:"Portal",count:null}];

  if(tab==="client")return(<div>
    {!isPortalDirect&&<div style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,padding:"8px 20px",display:"flex",justifyContent:"center"}}>
      <button onClick={()=>setTab("trainees")} style={{background:"none",border:"none",color:C.ac,cursor:"pointer",fontFamily:FB,fontSize:12}}>← Trainer View</button></div>}
    <ClientPortal clientWorkouts={clientWorkouts} setClientWorkouts={setClientWorkouts} bwLog={bwLog} setBwLog={setBwLog} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} portalVis={portalVis} trainerPlans={plans} trainerExercises={exercises} trainees={trainees}/></div>);

  // Trainer login gate (portal bypasses this)
  if(!trainerAuth && !isPortalDirect && tab!=="client") return(
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{textAlign:"center",marginBottom:30}}>
        <img src={EXPO_LOGO} alt="EXPO" style={{height:48,marginBottom:12,marginTop:-19}}/>
        <div style={{color:C.tm,fontSize:14}}>Trainer Access</div></div>
      <div style={{width:"100%",maxWidth:320}}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:14,padding:28}}>
          <input value={trainerCode} onChange={e=>setTrainerCode(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){if(trainerCode==='#81'){setTrainerAuth(true);try{localStorage.setItem('expo-trainer-auth','1')}catch{}}else{setTrainerCode('')}}}}
            placeholder="Enter code" type="password" autoFocus
            style={{width:"100%",background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"14px 16px",color:C.tx,fontFamily:FN,fontSize:18,outline:"none",boxSizing:"border-box",textAlign:"center",letterSpacing:"0.15em",marginBottom:12}}/>
          <button onClick={()=>{if(trainerCode==='#81'){setTrainerAuth(true);try{localStorage.setItem('expo-trainer-auth','1')}catch{}}else{setTrainerCode('')}}}
            style={{width:"100%",padding:14,borderRadius:10,border:"none",background:trainerCode?C.ac:C.sf3,color:trainerCode?"#000":C.td,fontFamily:FB,fontSize:15,fontWeight:700,cursor:trainerCode?"pointer":"default"}}>
            Enter</button>
        </div></div></div>);

  return(
    <div style={{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:FB}}>
      <header style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64,gap:12}}>
          <div style={{display:"flex",alignItems:"center",flex:"0 0 auto"}}>
            <img src={EXPO_LOGO} alt="EXPO" style={{height:48,marginRight:8,marginTop:-19}}/></div>
          <nav style={{display:"flex",gap:2,alignItems:"center",overflowX:"auto",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none",flex:"1 1 auto",minWidth:0}}>
            {tabs.map(t=>(<button key={t.key} onClick={()=>{setTab(t.key);setSelectedTrainee(null)}} style={{...baseBtn,background:tab===t.key?C.acD:"transparent",color:tab===t.key?C.ac:C.tm,borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:tab===t.key?700:500,whiteSpace:"nowrap"}}>
              <span>{t.label}</span>{t.count!==null&&<span style={{fontSize:10,color:tab===t.key?C.ac:C.td,fontFamily:FN}}>{t.count}</span>}</button>))}
            <div style={{width:1,height:24,background:C.bd,margin:"0 6px"}}/>
            <button onClick={()=>fileRef.current?.click()} title="Import" style={{...baseBtn,background:"transparent",color:C.tm,padding:"6px 10px",fontSize:14,borderRadius:6}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
            <button onClick={handleExport} title="Export" style={{...baseBtn,background:"transparent",color:C.tm,padding:"6px 10px",fontSize:14,borderRadius:6}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
            <input ref={fileRef} type="file" accept=".json,.xlsx,.xls,.csv" onChange={handleImport} style={{display:"none"}}/></nav></div></header>
      {importMsg&&<div style={{maxWidth:1200,margin:"0 auto",padding:"8px 20px"}}><div style={{background:importMsg.startsWith("✗")?C.rdD:importMsg.startsWith("⚠")?C.orD:C.gnD,color:importMsg.startsWith("✗")?C.rd:importMsg.startsWith("⚠")?C.or:C.gn,borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:600}}>{importMsg}</div></div>}
      <main style={{maxWidth:1200,margin:"0 auto",padding:"12px"}}>
        {tab==="dashboard"&&<DashboardView trainees={trainees} plans={plans} workouts={workouts} payments={payments} onSelectTrainee={id=>{setSelectedTrainee(id);setTab("trainees")}}/>}
        {tab==="trainees"&&!selectedTrainee&&<TraineesView trainees={trainees} setTrainees={setTrainees} onSelect={id=>setSelectedTrainee(id)}/>}
        {tab==="trainees"&&selectedTrainee&&<TraineeDetail trainee={selectedTrainee} trainees={trainees} setTrainees={setTrainees} plans={plans} onOpenPlan={pid=>{setTab("plans");setSelectedTrainee(null);}} exercises={exercises} workouts={workouts} payments={payments} setPayments={setPayments} portalVis={portalVis} setPortalVis={setPortalVis} onBack={()=>setSelectedTrainee(null)}/>}
        {tab==="exercises"&&<ExercisesView exercises={exercises} setExercises={setExercises}/>}
        {tab==="review"&&<WorkoutReview clientWorkouts={clientWorkouts} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus} workouts={workouts} setWorkouts={setWorkouts} plans={plans} trainees={trainees} exercises={exercises} onDecrementSession={handleDecrementSession}/>}
        {tab==="plans"&&<PlansView plans={plans} setPlans={setPlans} trainees={trainees} exercises={exercises} weeklyFocus={weeklyFocus} setWeeklyFocus={setWeeklyFocus}/>}
        {tab==="workouts"&&<WorkoutsView workouts={workouts} setWorkouts={setWorkouts} plans={plans} trainees={trainees} exercises={exercises} onDecrementSession={handleDecrementSession}/>}
      </main></div>);
}
