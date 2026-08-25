// Athletes' logged history. This is the data they cannot recreate, so it is
// worth checking for the same silent damage the plans had.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:tr}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const ids=new Set(); for(const t of (tr.value||[])){ids.add(t.id); if(t.members&&t.members.length===2){ids.add(t.id+'__0');ids.add(t.id+'__1');}}
  const {data:plans}=await s.from('plans').select('id,name,trainee_id');
  const planNames=new Map(); for(const p of plans||[]){ const k=String(p.trainee_id||'').replace(/__\d+$/,''); if(!planNames.has(k)) planNames.set(k,new Set()); planNames.get(k).add(String(p.name||'').toLowerCase()); }
  const {data:cw}=await s.from('client_workouts').select('*');
  let n=0,orphanClient=0,noPlanName=0,unknownPlan=0,noEx=0,futureDate=0,badDate=0,dupIds=0;
  const seen=new Set(); const samples=[];
  const today=new Date().toISOString().slice(0,10);
  for(const w of cw||[]){
    n++;
    if(w.id){ if(seen.has(w.id)) dupIds++; seen.add(w.id); }
    const cid=String(w.client_id||'');
    if(cid && !ids.has(cid)){orphanClient++; if(samples.length<5) samples.push('orphan client_id '+cid);}
    const pn=String(w.plan_name||'').trim();
    if(!pn) noPlanName++;
    else { const set=planNames.get(cid.replace(/__\d+$/,'')); if(set && !set.has(pn.toLowerCase())){unknownPlan++; if(samples.length<8) samples.push(`log "${pn}" has no such plan for ${cid}`);} }
    if(!((w.exercises||[]).length)) noEx++;
    const d=String(w.date||'');
    if(!/^\d{4}-\d{2}-\d{2}/.test(d)) badDate++;
    else if(d.slice(0,10)>today) futureDate++;
  }
  console.log(`client_workouts rows: ${n}`);
  const line=(k,v)=>console.log(`  ${String(v).padStart(4)}  ${k}`);
  line('client_id not in the roster', orphanClient);
  line('no plan_name', noPlanName);
  line('plan_name that matches no plan for that athlete', unknownPlan);
  line('no exercises logged', noEx);
  line('date in the future', futureDate);
  line('malformed date', badDate);
  line('duplicate row ids', dupIds);
  samples.slice(0,6).forEach(x=>console.log('    '+x));
  process.exit(0);
})();
