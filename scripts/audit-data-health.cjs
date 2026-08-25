// Broad data-health sweep. Same spirit as the video audit: find the silent
// problems nobody sees until an athlete opens their phone.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const norm=(t)=>String(t||'').toLowerCase().replace(/\s+/g,' ').trim();
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:tr}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const trainees=tr.value||[];
  const memberIds=new Set();
  for(const t of trainees){ memberIds.add(t.id); if(t.members&&t.members.length===2){memberIds.add(t.id+'__0');memberIds.add(t.id+'__1');} }
  const {data:plans}=await s.from('plans').select('id,name,trainee_id,active,data,created_at');
  const {data:libRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const libIds=new Set((libRow.value||[]).map(e=>e.id));

  // 1. plans pointing at a trainee that does not exist
  const orphanPlans=(plans||[]).filter(p=>p.trainee_id && !memberIds.has(p.trainee_id));
  // 2. plans with no trainee at all
  const unassigned=(plans||[]).filter(p=>!p.trainee_id);
  // 3. couples: a plan on the PARENT id instead of a member
  const couples=new Set(trainees.filter(t=>t.members&&t.members.length===2).map(t=>t.id));
  const onParent=(plans||[]).filter(p=>couples.has(p.trainee_id));
  // 4. duplicate plan names per athlete
  const dupNames=[]; const byT=new Map();
  for(const p of plans||[]){ const k=p.trainee_id||'(none)'; (byT.get(k)||byT.set(k,[]).get(k)).push(p); }
  for(const [t,list] of byT){ const seen=new Map();
    for(const p of list){ const n=norm(p.name); if(seen.has(n)) dupNames.push(`${t}: "${p.name}" x2`); seen.set(n,1); } }
  // 5. rows pointing at an exerciseId that is not in the library
  let deadIds=0; const deadSample=new Set();
  for(const p of plans||[]) for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
    const id=e.exerciseId||e.eid||''; if(id && !libIds.has(id)){deadIds++; if(deadSample.size<5) deadSample.add(`${p.name}/${String(e.title||'').slice(0,26)}`);} }
  // 6. athletes with NO plan at all
  const withPlan=new Set((plans||[]).map(p=>String(p.trainee_id||'').replace(/__\d+$/,'')));
  const noPlan=trainees.filter(t=>!withPlan.has(t.id));
  // 7. empty days
  let emptyDays=0; for(const p of plans||[]) for(const d of (p.data?.days||[])) if(!((d.exercises||d.ex||[]).length)) emptyDays++;

  const line=(k,v,extra='')=>console.log(`  ${String(v).padStart(4)}  ${k}${extra?'   '+extra:''}`);
  console.log(`trainees ${trainees.length} | plans ${(plans||[]).length}`);
  line('plans whose trainee_id does not exist', orphanPlans.length, orphanPlans.slice(0,3).map(p=>p.trainee_id).join(', '));
  line('plans with NO trainee', unassigned.length, unassigned.slice(0,3).map(p=>p.name).join(', '));
  line('plans on a COUPLE parent id (should be a member)', onParent.length, onParent.slice(0,3).map(p=>`${p.name}@${p.trainee_id}`).join(', '));
  line('duplicate plan names for one athlete', dupNames.length, dupNames.slice(0,2).join(' | '));
  line('rows pointing at a missing library exercise', deadIds, [...deadSample].slice(0,2).join(' | '));
  line('athletes with no plan at all', noPlan.length, noPlan.slice(0,6).map(t=>t.name).join(', '));
  line('empty days', emptyDays);
  process.exit(0);
})();
