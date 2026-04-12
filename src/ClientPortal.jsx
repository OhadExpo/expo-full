import React, { useState } from 'react';
import { C, FN, FB, uid, ytId, EXPO_LOGO, EXPO_ICON } from './theme';
import { EX } from './exerciseData';
import { supabase } from './supabase';

// EX dict now imported from exerciseData.js (single source of truth)
// Previously inline — see exerciseData.js for all client exercises

const CLIENTS = [
{id:"t1",name:"Diego Day",email:"diego@diegoday.com",sessions:8,plans:[{name:"Morning Routine",phase:"Daily",rest:"",warmup:[],days:[{name:"Morning Routine",ex:[{eid:"e3001",s:2,r:"8",tempo:"6-8s/rep"},{eid:"e3002",s:2,r:"20sE",n:"ISO"},{eid:"e3003",s:2,r:"6",tempo:"6-8s/rep"},{eid:"e3004",s:2,r:"20s",n:"ISO"},{eid:"e3005",s:2,r:"6",tempo:"8-10s/rep"},{eid:"e3006",s:1,r:"15",tempo:"4-5s/rep"},{eid:"e3007",s:1,r:"30s",n:"ISO"},{eid:"e3008",s:2,r:"10",tempo:"6-8s/rep"},{eid:"e3009",s:2,r:"30s",n:"ISO"}]}]}]},
{id:"t2",name:"Ron Yonker",email:"",sessions:8,plans:[{name:"Block #13",phase:"Strength",rest:"BB+Chin-Ups: 2-3:30 | Else: 1:30-2:30",
  warmup:[{t:"BW Step-Down",rx:"1x10E",vid:"https://www.youtube.com/watch?v=SZXOPRVP1Oc"},{t:"BW Floating-Heel RFESS",rx:"1x10E",vid:"https://www.youtube.com/watch?v=SH9zQAGb7pQ"},{t:"Bear-POS to Superman",rx:"1x8"}],
  days:[{name:"Day A",ex:[{eid:"e29",s:3,r:"10s"},{eid:"e30",s:3,r:"6E"},{eid:"e31",s:2,r:"3E"},{eid:"e32",s:3,r:">",wk:["4E","4E","3E","3E"]},{eid:"e33",s:5,r:"3",wk:["5set","5set","3set","3set"]},{eid:"e34",s:3,r:">",wk:["8E","8E","6E","6E"]},{eid:"e35",s:2,r:"15"},{eid:"e36",s:3,r:"8"}]},
  {name:"Day B",ex:[{eid:"e37",s:2,r:"5E"},{eid:"e38",s:2,r:"8E"},{eid:"e39",s:2,r:"8E"},{eid:"e40",s:4,r:">",wk:["4x6","4x6","3x5","3x5"]},{eid:"e41",s:4,r:">",wk:["4x6","4x6","3x5","3x5"]},{eid:"e42",s:2,r:"20"},{eid:"e43",s:2,r:"12E"},{eid:"e44",s:3,r:"15s>10",tempo:"ISO>REPs"}]}]}]},
{id:"t3",name:"Omer Sadeh",email:"omersadehbi@gmail.com",sessions:8,plans:[{name:"Block #7",phase:"Power/Strength",rest:"BB+Chin-Ups: 2-3:30 | Else: 1:30-2:30",
  warmup:[{t:"High BW Step-Up",rx:"1x10 E",vid:"https://www.youtube.com/shorts/vyGL_ZHf_EE"},{t:"Plate-Supported Hip Airplane",rx:"1x10 E",vid:"https://www.youtube.com/shorts/a8as1ZMwLsE"},{t:"ISO Hollow Hold w Leg Switches",rx:"2x15 SEC",vid:"https://www.youtube.com/shorts/3wxVbHhOdEM"}],
  days:[{name:"Day A",ex:[{eid:"e50",s:3,r:"6"},{eid:"e51",s:3,r:"6"},{eid:"e52",s:3,r:"6"},{eid:"e53",s:2,r:"10 E"},{eid:"e54",s:2,r:"10 E"},{eid:"e55",s:3,r:"12 E"},{eid:"e56",s:3,r:"10"}]},
  {name:"Day B",ex:[{eid:"e57",s:2,r:"10 SEC"},{eid:"e58",s:2,r:"4 E"},{eid:"e59",s:2,r:"4+4 E"},{eid:"e60",s:3,r:"5",tempo:"8-10s/REP"},{eid:"e61",s:4,r:"8 E",tempo:"3-4s ECC"},{eid:"e62",s:2,r:"20",tempo:"3-4s ECC"},{eid:"e63",s:3,r:"15"},{eid:"e64",s:3,r:"6 E"}]},
  {name:"Day C",ex:[{eid:"e65",s:3,r:"4 E"},{eid:"e66",s:3,r:"1 E",tempo:"3-Way"},{eid:"e67",s:2,r:"8"},{eid:"e68",s:2,r:"6 E"},{eid:"e69",s:2,r:"10 E"},{eid:"e70",s:3,r:"12"},{eid:"e71",s:3,r:"12",tempo:"1s Dead-Stop"},{eid:"e72",s:2,r:">",wk:["25 SEC","35 SEC","45 SEC","60 SEC"]}]}
  ]}]},
{id:"t4",name:"Yuval Barko",email:["shmuel034@gmail.com","yuvalberkovitch@gmail.com"],sessions:8,plans:[{name:"Comeback Block",phase:"GPP",rest:"BB+Chin-Ups: 2-3:30 | Else: 1:30-2:30",
  warmup:[{t:"Kossac Squat to Crossover Lunge",rx:"1x8 E",vid:"https://www.youtube.com/watch?v=MGLj_HrQTgY"},{t:"4-Way Bear-Crawl",rx:"1x8 E",vid:"https://www.youtube.com/shorts/_apvoiIoqgo"},{t:"BW SL Depth Drop",rx:"2x2 E POS",vid:"https://www.youtube.com/watch?v=vNAOj2kxsXE"}],
  days:[{name:"Day A",ex:[{eid:"e100",s:2,r:"8"},{eid:"e101",s:3,r:"8"},{eid:"e102",s:3,r:"10 SEC",n:"ISO"},{eid:"e103",s:3,r:"6 E",tempo:"3s ECC"},{eid:"e104",s:2,r:"8 E",tempo:"2-3s ECC"},{eid:"e105",s:2,r:"15 SEC",n:"ISO",superset:"A"},{eid:"e106",s:2,r:"15 SEC",n:"ISO",superset:"A"}]},
  {name:"Day B",ex:[{eid:"e107",s:3,r:"3 E"},{eid:"e108",s:2,r:"8 E"},{eid:"e109",s:3,r:"8 E",tempo:"2-3s ECC"},{eid:"e110",s:3,r:"8"},{eid:"e111",s:2,r:"12",tempo:"2-3s ECC"},{eid:"e112",s:2,r:"12",tempo:"5-6s/REP"},{eid:"e113",s:3,r:"8"}]},
  {name:"Day C (Home)",ex:[{eid:"e114",s:2,r:"10 E"},{eid:"e115",s:2,r:"15 SEC E",n:"ISO"},{eid:"e116",s:2,r:"10 E",tempo:"6-8s/REP"},{eid:"e117",s:2,r:"15 SEC > 15 Reps"},{eid:"e118",s:3,r:"3 E"},{eid:"e119",s:3,r:"15 SEC"},{eid:"e120",s:2,r:"10 E"}]}
  ]}]},
{id:"t5",name:"Shalev Lugashi",email:"shalev",sessions:8,plans:[{name:"Block #7",phase:"GPP",rest:"BB+Chin-Ups: 2-3:30 | Else: 1:30-2:30",
  warmup:[{t:"5 Min Bike/Cycle",rx:"5 min"}],
  days:[{name:"Day A",ex:[{eid:"e200",s:3,r:"12 E",superset:"A"},{eid:"e201",s:3,r:"4",tempo:"5s ISO top+bottom",superset:"A"},{eid:"e202",s:2,r:"8 E",superset:"B"},{eid:"e203",s:2,r:"12 E",tempo:"חצי סט על רגל אחת, חצי על השנייה",superset:"B"},{eid:"e204",s:3,r:"15 E",superset:"C"},{eid:"e205",s:3,r:"12",superset:"C"},{eid:"e206",s:2,r:"20 SEC E"}]},
  {name:"Day B",ex:[{eid:"e207",s:3,r:"8",superset:"A"},{eid:"e208",s:3,r:"8 E",superset:"A"},{eid:"e209",s:3,r:"8 E",superset:"B"},{eid:"e210",s:3,r:"8 E",tempo:"3-4s ECC",superset:"B"},{eid:"e211",s:2,r:"20",superset:"C"},{eid:"e212",s:2,r:"12",superset:"C"},{eid:"e213",s:3,r:"12",tempo:"3-4s ECC"}]},
  {name:"Day C",ex:[{eid:"e214",s:3,r:"12",superset:"A"},{eid:"e215",s:2,r:"10 E",superset:"A"},{eid:"e216",s:2,r:"8",superset:"B"},{eid:"e217",s:2,r:"10",tempo:"4-5s ECC",superset:"B"},{eid:"e218",s:2,r:"20 SEC E",superset:"C"},{eid:"e219",s:2,r:"8 E",tempo:"5s ISO top+bottom",superset:"C"},{eid:"e220",s:3,r:"15 SEC E"}]},
  {name:"Day D",ex:[{eid:"e221",s:3,r:"15 SEC",tempo:"סטטי",superset:"A"},{eid:"e222",s:3,r:"15 SEC",tempo:"סטטי",superset:"A"},{eid:"e223",s:2,r:"20 SEC E",tempo:"סטטי",superset:"B"},{eid:"e224",s:2,r:"10 E + 10 E",superset:"B"},{eid:"e225",s:2,r:"12",tempo:"סט אחד ידיים אחורה, סט אחד קדימה",superset:"C"},{eid:"e226",s:2,r:"10",tempo:"6-8s/REP",superset:"C"},{eid:"e227",s:2,r:"10 E",tempo:"ידיים על הקיר!",superset:"D"},{eid:"e228",s:3,r:"12",superset:"D"}]}
  ]}]},
];

const bi = {background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 10px",color:C.tx,fontFamily:FB,fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"};
const Bg = ({children,color=C.ac,style:s}) => <span style={{display:"inline-block",padding:"3px 10px",borderRadius:5,fontSize:11,fontWeight:600,fontFamily:FN,background:`${color}18`,color,...s}}>{children}</span>;

// StepLogger: warmup steps → pre-workout → exercise steps → finish
function StepLogger({day, plan, weekNum, clientId, onBack, onComplete, weeklyFocus}) {
  // Steps: 'wu0','wu1',... → 'pre' → 0,1,2,... (exercise indices) → 'end'
  const warmup = plan.warmup || [];
  const wuCount = warmup.length;
  const exCount = day.ex.length;
  const [step, setStep] = useState(wuCount > 0 ? 'wu0' : 'pre');
  const [ar, setAr] = useState({pain:'',energy:'',sleep:''});
  const [notes, setNotes] = useState('');
  const [allSets, setAllSets] = useState(() => day.ex.map(ex => Array.from({length:typeof ex.s==='number'?ex.s:3}, () => ({reps:'',load:'',rpe:'',done:false}))));
  const [fv, setFv] = useState(() => day.ex.map(() => ({note:'',has:false})));
  const [wuDone, setWuDone] = useState(() => warmup.map(() => false));
  const uSet = (ei,si,f,v) => {const n=[...allSets];n[ei]=[...n[ei]];n[ei][si]={...n[ei][si],[f]:v};setAllSets(n)};

  const handleVideoUpload = async (e, exIdx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], has:true, videoUrl:url, fileName:file.name, uploading:true, uploaded:false}; return n; });
    e.target.value = '';
    try {
      const ts = Date.now();
      const path = `${clientId}/${ts}-${file.name}`;
      const { data, error } = await supabase.storage.from('form-videos').upload(path, file, { upsert: true });
      if (!error) {
        const { data: urlData } = supabase.storage.from('form-videos').getPublicUrl(path);
        setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false, uploaded:true, has:true, cloudUrl:urlData.publicUrl}; return n; });
      } else {
        console.error('Storage upload error:', error);
        setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false}; return n; });
      }
    } catch(err) { console.error('Upload catch:', err); setFv(prev => { const n=[...prev]; n[exIdx]={...n[exIdx], uploading:false}; return n; }); }
  };

  const finish = () => onComplete({id:uid(),clientId,planName:plan.name,dayName:day.name,week:weekNum+1,date:new Date().toISOString(),autoregulation:ar,notes,
    formVideos:fv.map(f=>({has:f.has,note:f.note,fileName:f.fileName||null,cloudUrl:f.cloudUrl||null})),
    exercises:day.ex.map((ex,i)=>({eid:ex.eid,title:EX[ex.eid]?.t||'?',prescribed:ex.wk?ex.wk[weekNum]:`${ex.s}x${ex.r}`,sets:allSets[i]}))});

  // Navigation helpers
  const totalSteps = wuCount + 1 + exCount; // warmups + pre + exercises
  const stepIndex = typeof step === 'string' && step.startsWith('wu') ? parseInt(step.slice(2)) :
    step === 'pre' ? wuCount : step === 'end' ? totalSteps : wuCount + 1 + step;
  const goNext = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      const nd = [...wuDone]; nd[wi] = true; setWuDone(nd);
      if (wi + 1 < wuCount) setStep('wu' + (wi + 1));
      else setStep('pre');
    } else if (step === 'pre') setStep(0);
    else if (typeof step === 'number' && step < exCount - 1) setStep(step + 1);
    else setStep('end');
  };
  const goPrev = () => {
    window.scrollTo(0,0);
    if (typeof step === 'string' && step.startsWith('wu')) {
      const wi = parseInt(step.slice(2));
      if (wi > 0) setStep('wu' + (wi - 1)); else onBack();
    } else if (step === 'pre') setStep(wuCount > 0 ? 'wu' + (wuCount - 1) : null);
    else if (step === 0) setStep('pre');
    else if (typeof step === 'number') setStep(step - 1);
    else if (step === 'end') setStep(exCount - 1);
  };

  // Progress bar with EXPO icon
  const bar = <div style={{padding:'10px 16px',background:C.sf,borderBottom:`1px solid ${C.bd}`,position:'sticky',top:0,zIndex:10}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0}}>← Exit</button>
      <img src={EXPO_ICON} alt="EXPO" style={{height:20,opacity:0.5}} />
      <span style={{fontFamily:FN,fontSize:11,color:C.tm}}>{day.name} · W{weekNum+1}</span></div>
    <div style={{display:'flex',gap:2}}>
      {/* Warm-up dots (orange) + Exercise dots (blue/green) */}
      {warmup.map((_,i) => <div key={'wu'+i} style={{flex:1,height:3,borderRadius:2,background:stepIndex>i?C.or:stepIndex===i?C.or+'80':C.bd}} />)}
      {/* Pre-workout dot */}
      <div style={{flex:1,height:3,borderRadius:2,background:stepIndex>wuCount?C.pu:stepIndex===wuCount?C.pu+'80':C.bd}} />
      {/* Exercise dots */}
      {day.ex.map((_,i) => <div key={'ex'+i} style={{flex:1,height:3,borderRadius:2,background:stepIndex>wuCount+1+i?C.gn:stepIndex===wuCount+1+i?C.ac:C.bd}} />)}
    </div>
    <div style={{fontSize:10,color:C.td,fontFamily:FN,marginTop:4,textAlign:'center'}}>
      {typeof step==='string'&&step.startsWith('wu') ? `Warm-Up ${parseInt(step.slice(2))+1}/${wuCount}` :
       step==='pre' ? 'Pre-Workout Check' :
       step==='end' ? 'Complete' :
       `Exercise ${step+1}/${exCount}`}
    </div></div>;

  // ===== WARM-UP STEP =====
  if (typeof step === 'string' && step.startsWith('wu')) {
    const wi = parseInt(step.slice(2));
    const wu = warmup[wi];
    const vid = ytId(wu.vid);
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
      <div style={{padding:20}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <div style={{background:C.orD,borderRadius:8,padding:'4px 10px',fontFamily:FN,fontSize:11,color:C.or,fontWeight:700}}>WARM-UP {wi+1}/{wuCount}</div></div>
        <h2 style={{margin:'0 0 6px',fontFamily:FN,fontSize:18}}>{wu.t}</h2>
        <div style={{fontSize:15,color:C.or,fontWeight:700,fontFamily:FN,marginBottom:14}}>{wu.rx}</div>
        {vid && <div style={{marginBottom:14,borderRadius:12,overflow:'hidden',aspectRatio:'16/9',background:C.sf2}}>
          <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>}
        {!vid && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:30,marginBottom:14,textAlign:'center',color:C.td}}>No video for this exercise</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:10,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:14,fontWeight:600,cursor:'pointer'}}>← Back</button>
          <button onClick={goNext} style={{flex:2,padding:14,borderRadius:10,border:'none',background:C.or,color:'#fff',fontFamily:FB,fontSize:14,fontWeight:700,cursor:'pointer'}}>
            {wi === wuCount - 1 ? 'Start Check-In →' : 'Next Warm-Up →'}</button></div>
      </div></div>;
  }

  // ===== PRE-WORKOUT CHECK =====
  if (step === 'pre') return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20}}>
      <h2 style={{margin:'0 0 16px',fontFamily:FN,fontSize:20}}>Pre-Workout Check</h2>
      {[['pain','Pain Level','0-10',C.rd],['energy','Energy','1-5',C.gn],['sleep','Sleep Quality','1-5',C.pu]].map(([k,l,rng,col]) =>
        <div key={k} style={{marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>{l} ({rng})</div>
          <div style={{display:'flex',gap:4}}>{(rng==='0-10'?[0,1,2,3,4,5,6,7,8,9,10]:[1,2,3,4,5]).map(n =>
            <div key={n} onClick={() => setAr({...ar,[k]:String(n)})} style={{flex:1,height:40,borderRadius:8,background:ar[k]===String(n)?`${col}25`:C.sf2,border:`2px solid ${ar[k]===String(n)?col:C.bd}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FN,fontSize:14,color:ar[k]===String(n)?col:C.tm,cursor:'pointer',fontWeight:ar[k]===String(n)?700:400}}>{n}</div>
          )}</div></div>)}
      {parseInt(ar.pain)>=4 && <div style={{background:C.rdD,borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:C.rd,fontWeight:600}}>⚠ Pain ≥4 — Modify: ROM → Tempo → Intensity → Volume</div>}
      {(parseInt(ar.energy)<=2||parseInt(ar.sleep)<=2) && <div style={{background:C.orD,borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:C.or,fontWeight:600}}>⚠ Low recovery — Auto-regulate down</div>}
      <div style={{display:'flex',gap:8}}>
        <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:10,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:14,fontWeight:600,cursor:'pointer'}}>← Back</button>
        <button onClick={goNext} style={{flex:2,padding:14,borderRadius:10,border:'none',background:C.ac,color:'#fff',fontFamily:FB,fontSize:15,fontWeight:700,cursor:'pointer'}}>Start Workout →</button></div>
    </div></div>;

  // ===== FINISH =====
  if (step === 'end') return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20,textAlign:'center'}}>
      <img src={EXPO_LOGO} alt="EXPO" style={{height:40,marginBottom:16}} />
      <h2 style={{margin:'0 0 8px',fontFamily:FN,fontSize:22}}>Nice Work! 🎉</h2>
      <div style={{color:C.tm,fontSize:13,marginBottom:20}}>Session complete. Any notes?</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel? Pain? Modifications?" style={{...bi,minHeight:120,resize:'vertical',marginBottom:16,textAlign:'left'}}/>
      {fv.some(f => f.uploading) ? (
        <button style={{width:'100%',padding:16,borderRadius:12,border:'none',background:C.sf3,color:C.td,fontFamily:FB,fontSize:16,fontWeight:700,cursor:'wait',opacity:0.6}}>⏳ Video uploading...</button>
      ) : (
        <button onClick={finish} style={{width:'100%',padding:16,borderRadius:12,border:'none',background:C.gn,color:'#fff',fontFamily:FB,fontSize:16,fontWeight:700,cursor:'pointer'}}>✓ Complete Workout</button>
      )}
      <button onClick={goPrev} style={{width:'100%',padding:12,border:'none',background:'transparent',color:C.tm,cursor:'pointer',marginTop:8}}>← Back</button>
    </div></div>;

  // ===== EXERCISE STEP =====
  const ei = step; const ex = day.ex[ei]; const d = EX[ex.eid]; if (!d) return null;
  const vid = ytId(d.vid); const hw = ex.wk?.length > 0;
  const wr = hw ? ex.wk[weekNum] : null; const f = fv[ei];
  return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>{bar}
    <div style={{padding:20}}>
      <h2 style={{margin:'0 0 6px',fontFamily:FN,fontSize:18,textAlign:'center'}}>{d.t}</h2>
      <div style={{fontSize:15,color:C.ac,fontWeight:700,fontFamily:FN,textAlign:'center'}}>{wr || `${ex.s} × ${ex.r}`}</div>
      {ex.tempo && <div style={{fontSize:13,color:C.or,marginTop:4,textAlign:'center'}}>⏱ {ex.tempo}</div>}
      
      {hw && <div style={{background:C.sf2,borderRadius:10,padding:10,marginTop:12,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
          {ex.wk.map((w,i) => <div key={i} style={{background:weekNum===i?C.acD:C.sf3,border:`1px solid ${weekNum===i?C.ac+'60':C.bd}`,borderRadius:6,padding:6,textAlign:'center'}}>
            <div style={{fontSize:9,color:C.td,fontFamily:FN}}>WK {i+1}</div>
            <div style={{fontSize:12,color:weekNum===i?C.ac:C.tx,fontWeight:600}}>{w}</div></div>)}</div></div>}
      {/* Exercise Notes — merged coaching cues (q) + notes (n) */}
      {(d.q || ex.n) && <div style={{background:C.puD,borderRadius:10,padding:12,marginTop:16,marginBottom:12,fontSize:13,color:C.tx,lineHeight:1.6,textAlign:'center'}}>
        <div style={{fontSize:10,fontFamily:FN,color:C.pu,marginBottom:6,fontWeight:700}}>EXERCISE NOTES</div>
        {d.q && <div dir={/[\u0590-\u05FF]/.test(d.q)?'rtl':'ltr'}>{d.q}</div>}{d.q && ex.n && <div style={{borderTop:`1px solid ${C.pu}30`,margin:'8px 0'}}/>}{ex.n && <div dir={/[\u0590-\u05FF]/.test(ex.n)?'rtl':'ltr'} style={{color:C.or}}>{ex.n}</div>}</div>}
      {vid && <div style={{marginBottom:14,borderRadius:12,overflow:'hidden',aspectRatio:'16/9',background:C.sf2}}>
        <iframe src={`https://www.youtube.com/embed/${vid}`} style={{width:'100%',height:'100%',border:'none'}} allowFullScreen/></div>}
      {/* Weekly Coach Focus - always visible, beneath video */}
      {(() => { const fk = `${plan.name}|${day.name}|${ex.eid}|W${weekNum+1}`; const wf = weeklyFocus?.[fk]; return (
        <div style={{background:wf?C.acD:C.sf,border:'1px solid '+(wf?C.ac+'30':C.bd),borderLeft:'3px solid '+(wf?C.ac:C.bd),borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontFamily:FN,color:wf?C.ac:C.td,marginBottom:4,fontWeight:700}}>WEEKLY FOCUS</div>
          <div style={{fontSize:13,color:wf?C.tx:C.td,lineHeight:1.5}}>{wf || 'No focus set this week'}</div></div>); })()}
      <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 32px',gap:4,marginBottom:4}}>
          {['','REPS','KG','RPE','✓'].map(h => <div key={h} style={{fontSize:9,fontFamily:FN,color:C.td,textAlign:!h||h==='✓'?'center':'left'}}>{h}</div>)}</div>
        {(allSets[ei]||[]).map((set,si) => <div key={si} style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr 32px',gap:4,alignItems:'center',marginBottom:4,opacity:set.done?.5:1}}>
          <div style={{fontFamily:FN,fontSize:13,color:C.td,textAlign:'center'}}>{si+1}</div>
          <input value={set.reps} onChange={e => uSet(ei,si,'reps',e.target.value)} placeholder="—" style={bi}/>
          <input value={set.load} onChange={e => uSet(ei,si,'load',e.target.value)} placeholder="kg" style={bi}/>
          <input value={set.rpe} onChange={e => uSet(ei,si,'rpe',e.target.value)} placeholder="—" style={bi}/>
          <div style={{textAlign:'center'}}><input type="checkbox" checked={set.done} onChange={e => uSet(ei,si,'done',e.target.checked)} style={{width:18,height:18,accentColor:C.gn,cursor:'pointer'}}/></div>
        </div>)}</div>
      <div style={{background:C.sf,border:`1px solid ${f.uploaded?C.gn+'60':C.bd}`,borderRadius:12,padding:14,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:11,fontFamily:FN,color:C.tm}}>FORM CHECK</div>
          {f.uploaded && <div style={{display:'flex',alignItems:'center',gap:4,background:C.gnD,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:14}}>✅</span><span style={{fontSize:11,fontFamily:FN,color:C.gn,fontWeight:700}}>UPLOADED</span></div>}
          {f.uploading && <div style={{display:'flex',alignItems:'center',gap:4,background:C.acD,padding:'3px 10px',borderRadius:20}}>
            <span style={{fontSize:11,fontFamily:FN,color:C.ac,fontWeight:700}}>⏳ Uploading...</span></div>}
        </div>
        {f.has && f.videoUrl ? (
          <div style={{marginBottom:10}}>
            <video src={f.videoUrl} controls playsInline style={{width:'100%',borderRadius:8,maxHeight:200,background:C.sf2}} />
            <button onClick={() => setFv(prev => { const n=[...prev]; n[ei]={...n[ei],has:false,videoUrl:null,uploaded:false,cloudUrl:null}; return n; })}
              style={{width:'100%',marginTop:6,padding:8,borderRadius:6,border:`1px solid ${C.rd}30`,background:C.rdD,color:C.rd,fontFamily:FB,fontSize:12,cursor:'pointer'}}>
              Remove Video</button>
          </div>
        ) : (
          <div style={{display:'flex',gap:8}}>
            <label style={{flex:1,padding:'14px 8px',borderRadius:8,border:`1px dashed ${C.bd}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FB,fontSize:12,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:20}}>🎥</span>
              <span>Record</span>
              <input type="file" accept="video/*" capture="environment" style={{display:'none'}}
                onChange={async e => { await handleVideoUpload(e, ei); }} />
            </label>
            <label style={{flex:1,padding:'14px 8px',borderRadius:8,border:`1px dashed ${C.bd}`,background:'transparent',color:C.tm,cursor:'pointer',fontFamily:FB,fontSize:12,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:20}}>📁</span>
              <span>Gallery</span>
              <input type="file" accept="video/*" style={{display:'none'}}
                onChange={async e => { await handleVideoUpload(e, ei); }} />
            </label>
          </div>
        )}
        <textarea value={f.note} onChange={e => {const n=[...fv];n[ei]={...n[ei],note:e.target.value};setFv(n)}} placeholder="Notes for coach" style={{...bi,fontSize:13,minHeight:50,resize:'vertical',marginTop:8}}/></div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={goPrev} style={{flex:1,padding:14,borderRadius:10,border:`1px solid ${C.bd}`,background:'transparent',color:C.tm,fontFamily:FB,fontSize:14,fontWeight:600,cursor:'pointer'}}>← Back</button>
        <button onClick={f.uploading ? undefined : goNext} style={{flex:2,padding:14,borderRadius:10,border:'none',background:f.uploading?C.sf3:C.ac,color:f.uploading?C.td:'#fff',fontFamily:FB,fontSize:14,fontWeight:700,cursor:f.uploading?'wait':'pointer',opacity:f.uploading?0.6:1}}>
          {f.uploading ? '⏳ Uploading video...' : ei===exCount-1 ? 'Finish →' : 'Next Exercise →'}</button></div>
    </div></div>;
}

// Main client portal
export default function ClientPortal({ clientWorkouts, setClientWorkouts, bwLog, setBwLog, weeklyFocus, setWeeklyFocus }) {
  const [ci, setCi] = useState(null);
  const [wk, setWk] = useState(0);
  const [lg, setLg] = useState(null);
  const [vw, setVw] = useState('prog');
  const [bw, setBw] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const cl = CLIENTS.find(c => c.id === ci);
  const cw = clientWorkouts.filter(w => w.clientId === ci);
  const handleComplete = w => { setClientWorkouts(prev => [...prev, w]); if (bw) setBwLog(prev => [...prev, {date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw)}]); setLg(null); };

  // Step Logger
  if (lg !== null && cl) { const plan = cl.plans[0]; return <StepLogger day={plan.days[lg]} plan={plan} weekNum={wk} clientId={cl.id} onBack={() => setLg(null)} onComplete={handleComplete} weeklyFocus={weeklyFocus}/>; }

  // BW Graph tab
  if (vw === 'bwt' && cl) { 
    const bwData = bwLog.filter(b => b.clientId === ci).sort((a,b) => new Date(a.date) - new Date(b.date));
    const existingBw = bwData.find(b => b.week === wk + 1);
    const bwDisplay = bw || (existingBw ? String(existingBw.bw) : '');
    const maxBw = bwData.length ? Math.max(...bwData.map(b=>b.bw)) : 100;
    const minBw = bwData.length ? Math.min(...bwData.map(b=>b.bw)) : 50;
    const range = Math.max(maxBw - minBw, 2);
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      <div style={{padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <button onClick={() => setVw('prog')} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0}}>← Back</button>
          <img src={EXPO_ICON} alt="EXPO" style={{height:18,opacity:0.5}} />
        </div>
        <h2 style={{margin:'0 0 4px',fontFamily:FN,fontSize:18}}>Bodyweight Tracking</h2>
        <div style={{color:C.tm,fontSize:12,marginBottom:16}}>{cl.name} · {bwData.length} entries</div>

        {/* Quick log */}
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>LOG THIS WEEK (W{wk+1})</div>
          <div style={{display:'flex',gap:8}}>
            <input value={bwDisplay} onChange={e => setBw(e.target.value)} placeholder="Weight in kg" type="number" style={{flex:1,background:C.sf2,border:`1px solid ${existingBw?C.gn+'60':C.bd}`,borderRadius:8,padding:'10px 12px',color:C.tx,fontFamily:FN,fontSize:14,outline:'none',boxSizing:'border-box'}}/>
            <button onClick={()=>{const val=bw||bwDisplay;if(val){setBwLog(prev=>{const filtered=prev.filter(b=>!(b.clientId===ci&&b.week===wk+1));return[...filtered,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(val)}]});setBw('')}}} 
              style={{padding:'10px 20px',borderRadius:8,border:'none',background:bw?C.ac:C.sf3,color:bw?'#fff':C.td,fontFamily:FB,fontSize:13,fontWeight:700,cursor:bw?'pointer':'default'}}>Save</button>
          </div>
        </div>

        {/* Graph */}
        {bwData.length < 2 ? (
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:40,textAlign:'center',color:C.td,marginBottom:16}}>
            <div style={{fontSize:24,marginBottom:8}}>📊</div>
            <div style={{fontSize:13}}>Log at least 2 weigh-ins to see your trend</div>
          </div>
        ) : (
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:10}}>TREND</div>
            <svg viewBox={`0 0 ${Math.max(bwData.length * 60, 300)} 175`} style={{width:'100%',height:175}}>
              {/* Grid lines */}
              {[0,0.25,0.5,0.75,1].map((p,i) => {
                const y = 10 + p * 130;
                const val = (maxBw - p * range).toFixed(1);
                return <g key={i}>
                  <line x1="40" y1={y} x2={Math.max(bwData.length*60,300)-10} y2={y} stroke={C.bd} strokeWidth="0.5" strokeDasharray="4"/>
                  <text x="36" y={y+4} fill={C.td} fontSize="9" fontFamily={FN} textAnchor="end">{val}</text>
                </g>;
              })}
              {/* Line + dots */}
              <polyline fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                points={bwData.map((d,i) => `${50+i*50},${10+((maxBw-d.bw)/range)*130}`).join(' ')}/>
              {bwData.map((d,i) => {
                const x = 50 + i * 50;
                const y = 10 + ((maxBw - d.bw) / range) * 130;
                return <g key={i}>
                  <circle cx={x} cy={y} r="4" fill={C.ac} stroke={C.bg} strokeWidth="2"/>
                  <text x={x} y={y-10} fill={C.tx} fontSize="10" fontFamily={FN} textAnchor="middle" fontWeight="600">{d.bw}</text>
                  <text x={x} y={152} fill={C.td} fontSize="8" fontFamily={FN} textAnchor="middle">W{d.week||'?'}</text>
                  <text x={x} y={163} fill={C.td} fontSize="7" fontFamily={FN} textAnchor="middle">{new Date(d.date).toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})}</text>
                </g>;
              })}
            </svg>
            {/* Stats */}
            <div style={{display:'flex',gap:12,marginTop:10}}>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>LATEST</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData[bwData.length-1].bw}kg</div>
              </div>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>CHANGE</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:(bwData[bwData.length-1].bw-bwData[0].bw)<=0?C.gn:C.or}}>
                  {(bwData[bwData.length-1].bw-bwData[0].bw)>0?'+':''}{(bwData[bwData.length-1].bw-bwData[0].bw).toFixed(1)}kg</div>
              </div>
              <div style={{flex:1,background:C.sf2,borderRadius:8,padding:10,textAlign:'center'}}>
                <div style={{fontSize:9,fontFamily:FN,color:C.td}}>ENTRIES</div>
                <div style={{fontSize:16,fontWeight:700,fontFamily:FN,color:C.tx}}>{bwData.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Log history */}
        <div style={{fontSize:11,fontFamily:FN,color:C.td,marginBottom:8}}>HISTORY</div>
        {bwData.slice().reverse().map((d,i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:i%2===0?C.sf:'transparent',borderRadius:6,marginBottom:2}}>
            <div>
              <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{d.bw} kg</span>
              <span style={{fontSize:11,color:C.tm,marginLeft:8}}>W{d.week||'?'}</span>
            </div>
            <span style={{fontSize:10,color:C.td}}>{new Date(d.date).toLocaleDateString()}</span>
          </div>
        ))}
        {bwData.length === 0 && <div style={{textAlign:'center',padding:20,color:C.td,fontSize:13}}>No bodyweight entries yet</div>}
      </div>
    </div>;
  }

  // History
  if (vw === 'hist' && cl) return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
    <div style={{padding:20}}>
      <button onClick={() => setVw('prog')} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:13,padding:0,marginBottom:14}}>← Back</button>
      <h2 style={{margin:'0 0 12px',fontFamily:FN,fontSize:18}}>History ({cw.length})</h2>
      {cw.length === 0 ? <div style={{textAlign:'center',padding:40,color:C.td}}>No workouts yet.</div> :
        cw.slice().reverse().map(w => <div key={w.id} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:12,marginBottom:8}}>
          <div style={{fontWeight:600,fontSize:13}}>{w.dayName} <span style={{color:C.tm,fontWeight:400}}>({w.planName})</span></div>
          <div style={{fontSize:11,color:C.tm}}>{new Date(w.date).toLocaleDateString()} · W{w.week}</div>
          {w.exercises.map((x,i) => <div key={i} style={{fontSize:11,color:C.tm,marginTop:2}}>{i+1}. {x.title} ({x.prescribed}) — {x.sets.filter(s=>s.done).length}/{x.sets.length}</div>)}
          {w.notes && <div style={{fontSize:11,color:C.tm,marginTop:4,background:C.sf2,padding:6,borderRadius:4}}>📝 {w.notes}</div>}
        </div>)}</div></div>;

  // Program view
  if (cl) { const plan = cl.plans[0]; const sl = Math.max(0, cl.sessions - cw.length); const lb = bwLog.filter(b => b.clientId === ci).slice(-1)[0]?.bw;
    return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,maxWidth:500,margin:'0 auto'}}>
      <div style={{background:`linear-gradient(135deg,${C.sf},${C.sf2})`,padding:'20px 20px 16px',borderBottom:`1px solid ${C.bd}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <button onClick={() => {setCi(null);setVw('prog')}} style={{background:'none',border:'none',color:C.ac,cursor:'pointer',fontFamily:FB,fontSize:12,padding:0}}>← Switch</button>
          <img src={EXPO_LOGO} alt="EXPO" style={{height:22}} /></div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
          <div><h1 style={{margin:0,fontFamily:FN,fontSize:20,color:C.tx}}>Hey {cl.name.split(' ')[0]} 💪</h1>
            <div style={{display:'flex',gap:6,marginTop:8}}><Bg color={C.ac}>{plan.phase}</Bg><Bg color={C.tm}>{plan.name}</Bg></div></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:22,fontWeight:700,fontFamily:FN,color:sl<=2?C.rd:C.gn}}>{sl}</div><div style={{fontSize:9,color:C.tm,fontFamily:FN}}>SESSIONS</div></div></div></div>
      <div style={{padding:20}}>
        <div style={{display:'flex',gap:4,marginBottom:14}}>{[['prog','Program'],['bwt','BW Graph'],['hist',`History (${cw.length})`]].map(([k,l]) =>
          <button key={k} onClick={() => setVw(k)} style={{flex:1,padding:8,borderRadius:6,border:`1px solid ${vw===k?C.ac:C.bd}`,background:vw===k?C.acD:'transparent',color:vw===k?C.ac:C.tm,fontFamily:FB,fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>)}</div>
        <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
          <div style={{flex:1}}><div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:4}}>Week</div>
            <div style={{display:'flex',gap:4}}>{[0,1,2,3].map(w => <button key={w} onClick={() => setWk(w)} style={{flex:1,padding:'8px 0',borderRadius:6,border:`1px solid ${wk===w?C.ac:C.bd}`,background:wk===w?C.acD:'transparent',color:wk===w?C.ac:C.tm,fontFamily:FN,fontSize:12,fontWeight:600,cursor:'pointer'}}>W{w+1}</button>)}</div></div>
          <div style={{width:120}}><div style={{fontSize:10,fontFamily:FN,color:C.td,marginBottom:4}}>BW {lb?`(${lb}kg)`:''}</div>
            <div style={{display:'flex',gap:4}}>
            <input value={bw} onChange={e => setBw(e.target.value)} placeholder="kg" type="number" style={{background:C.sf2,border:`1px solid ${C.bd}`,borderRadius:6,padding:'8px',color:C.tx,fontFamily:FN,fontSize:12,outline:'none',width:'100%',boxSizing:'border-box',textAlign:'center'}}/>
            {bw && <button onClick={()=>{setBwLog(prev=>[...prev,{date:new Date().toISOString(),clientId:ci,week:wk+1,bw:parseFloat(bw)}]);setBw('')}} style={{background:C.acD,border:'none',borderRadius:6,padding:'4px 8px',color:C.ac,fontFamily:FN,fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>Save</button>}
            </div></div></div>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12,color:C.tm}}>⏱ {plan.rest}</div>
        {/* Warm-up section */}
        {plan.warmup?.length > 0 && <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:11,fontFamily:FN,color:C.or,marginBottom:8,fontWeight:700}}>Warm-Up ({plan.warmup.length})</div>
          {plan.warmup.map((w,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:i<plan.warmup.length-1?`1px solid ${C.bd}22`:'none'}}>
            <span style={{fontSize:13,color:C.tx}}>{w.t}</span>
            <div style={{display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:11,color:C.ac,fontFamily:FN,fontWeight:600}}>{w.rx}</span>
              {w.vid && <a href={w.vid} target="_blank" rel="noopener" style={{color:C.rd,fontSize:10,textDecoration:'none',padding:'2px 6px',background:C.rdD,borderRadius:4}}>▶</a>}</div></div>)}</div>}
        {/* Training days */}
        {plan.days.map((day,di) => { const done = cw.some(w => w.dayName === day.name && w.week === wk + 1);
          return <div key={di} style={{background:C.sf,border:`1px solid ${done?C.gn+'40':C.bd}`,borderRadius:12,marginBottom:12,padding:'14px 18px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div><span style={{fontWeight:700,fontSize:15}}>{day.name}</span>{done && <Bg color={C.gn} style={{fontSize:9,padding:'2px 6px',marginLeft:6}}>✓</Bg>}
                <div style={{fontSize:11,color:C.tm,marginTop:2}}>{day.ex.length} exercises</div></div>
              <button onClick={() => setLg(di)} style={{padding:'6px 12px',borderRadius:6,border:'none',background:done?C.gnD:C.acD,color:done?C.gn:C.ac,fontFamily:FB,fontSize:11,fontWeight:600,cursor:'pointer'}}>{done?'Again':'📝 Log'}</button></div>
            {day.ex.map((ex,i) => {const d = EX[ex.eid]; if(!d) return null; const hw = ex.wk?.length>0;
              return <div key={i} style={{display:'flex',gap:8,alignItems:'center',padding:'4px 0',borderTop:i?`1px solid ${C.bd}22`:'none'}}>
                <div style={{width:22,height:22,borderRadius:4,background:C.acD,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FN,fontSize:10,fontWeight:700,color:C.ac,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{d.t}</div>
                  <span style={{fontSize:11,fontWeight:700,color:C.ac,fontFamily:FN}}>{hw?ex.wk[wk]:ex.s+'x'+ex.r}</span>
                  {ex.tempo && <span style={{fontSize:9,color:C.or,marginLeft:4}}>{ex.tempo}</span>}</div></div>})}
          </div>})}
      </div></div>; }

  // Fallback — if authClientId was provided, ci should already be set.
  // Legacy email login kept as fallback for direct/unauthenticated access.
  const handleLogin = () => {
    const email = loginEmail.trim().toLowerCase();
    if (!email) return;
    const found = CLIENTS.find(c => {
      if (!c.email) return false;
      if (Array.isArray(c.email)) return c.email.some(e => e.toLowerCase() === email);
      return c.email.toLowerCase() === email;
    });
    if (found) { setCi(found.id); setLoginError(''); }
    else setLoginError('Email not found. Contact your trainer.');
  };
  return <div style={{background:C.bg,color:C.tx,minHeight:'100vh',fontFamily:FB,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20}}>
    <div style={{textAlign:'center',marginBottom:40}}>
      <img src={EXPO_LOGO} alt="EXPO" style={{height:36,marginBottom:12}} />
      <div style={{color:C.tm,fontSize:15}}>Training Portal</div></div>
    <div style={{width:'100%',maxWidth:380}}>
      <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:14,padding:28}}>
        <div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:16}}>Log in with your email</div>
        <input value={loginEmail} onChange={e => {setLoginEmail(e.target.value);setLoginError('')}}
          onKeyDown={e => e.key==='Enter' && handleLogin()}
          placeholder="your@email.com" type="email" autoComplete="email" autoFocus
          style={{width:'100%',background:C.sf2,border:`1px solid ${loginError?C.rd:C.bd}`,borderRadius:10,padding:'14px 16px',color:C.tx,fontFamily:FB,fontSize:15,outline:'none',boxSizing:'border-box',marginBottom:12}} />
        {loginError && <div style={{color:C.rd,fontSize:12,marginBottom:10}}>{loginError}</div>}
        <button onClick={handleLogin}
          style={{width:'100%',padding:14,borderRadius:10,border:'none',background:loginEmail.trim()?C.ac:C.sf3,color:loginEmail.trim()?'#000':C.td,fontFamily:FB,fontSize:15,fontWeight:700,cursor:loginEmail.trim()?'pointer':'default',transition:'all .15s'}}>
          Enter</button>
      </div>
    </div></div>;
}
