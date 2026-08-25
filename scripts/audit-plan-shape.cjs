// Structural integrity of every plan after today's writes. Nothing here should
// ever be non-zero; if it is, a repair script damaged real programming.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:plans}=await s.from('plans').select('id,name,trainee_id,data');
  let P=0,D=0,R=0;
  const bad={noDays:0,dayNotArray:0,rowsNotArray:0,noTitleNoEid:0,badSets:0,badReps:0,nanish:0,dupRowId:0,emptyDay:0,badSuperset:0,badVideo:0};
  const examples=[];
  const note=(k,msg)=>{bad[k]++; if(examples.length<8) examples.push(`${k}: ${msg}`);};
  for(const p of plans||[]){
    P++;
    const days=p.data?.days;
    if(!days){note('noDays',p.name);continue;}
    if(!Array.isArray(days)){note('dayNotArray',p.name);continue;}
    for(const d of days){
      D++;
      const rows=d.exercises||d.ex;
      if(rows===undefined){note('rowsNotArray',`${p.name}/${d.name}`);continue;}
      if(!Array.isArray(rows)){note('rowsNotArray',`${p.name}/${d.name}`);continue;}
      if(!rows.length) bad.emptyDay++;
      const ids=new Set();
      for(const e of rows){
        R++;
        if(e.id){ if(ids.has(e.id)) note('dupRowId',`${p.name}/${d.name}/${e.id}`); ids.add(e.id); }
        const title=String(e.title||'').trim(), eid=String(e.exerciseId||e.eid||'').trim();
        if(!title && !eid) note('noTitleNoEid',`${p.name}/${d.name}`);
        const sets=e.sets??e.s, reps=e.reps??e.r;
        if(sets!==undefined && String(sets).toLowerCase()==='nan') note('badSets',`${p.name}/${title}`);
        if(reps!==undefined && String(reps).toLowerCase()==='nan') note('badReps',`${p.name}/${title}`);
        for(const [k,v] of Object.entries(e)) if(typeof v==='number' && Number.isNaN(v)) note('nanish',`${p.name}/${title}/${k}`);
        if(e.superset!==undefined && e.superset!=='' && !/^[A-E]$/.test(String(e.superset))) note('badSuperset',`${p.name}/${title}=${e.superset}`);
        if(e.videoUrl!==undefined && e.videoUrl!=='' && !/^https:\/\//i.test(String(e.videoUrl))) note('badVideo',`${p.name}/${title}`);
      }
    }
  }
  console.log(`plans ${P} | days ${D} | rows ${R}`);
  console.log(Object.entries(bad).map(([k,v])=>`${k}=${v}`).join('  '));
  examples.forEach(e=>console.log('  '+e));
  const fatal=bad.noDays+bad.dayNotArray+bad.rowsNotArray+bad.noTitleNoEid+bad.badSets+bad.badReps+bad.nanish+bad.dupRowId+bad.badSuperset+bad.badVideo;
  console.log(fatal? `\n${fatal} STRUCTURAL PROBLEMS` : '\nstructure clean');
  process.exit(0);
})();
