// Put the superset letters back exactly as they were before today.
//
// The sheet's 3a/3b numbering derived a DIFFERENT grouping from the one the app
// already held: the app had three distinct pairs (A,A|B,B|C,C) and the derived
// version collapsed the first two into one group of four (A,A,A,A|B,B). The
// app's grouping is the better record, and nothing in the sheet proves
// otherwise, so the derived letters are reverted.
//
// Keyed by ROW ID so a removed row cannot be mistaken for a changed field.
// Videos are NOT touched — the sheet IS the reference for those.
const { createClient } = require('@supabase/supabase-js');
const fs=require('fs'), path=require('path');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const DIR=process.argv[2];
const APPLY=process.argv.includes('--apply');
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const updates=[]; let n=0;
  for(const f of fs.readdirSync(DIR).filter(x=>x.endsWith('.json'))){
    const before=JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));
    const {data:after}=await s.from('plans').select('data,name').eq('id',before.id).single();
    if(!after) continue;
    const bMap=new Map();
    for(const d of (before.data?.days||[])) for(const e of (d.exercises||d.ex||[])) if(e.id) bMap.set(e.id,e);
    const data=JSON.parse(JSON.stringify(after.data));
    let touched=0;
    for(const d of (data.days||[])) for(const e of (d.exercises||d.ex||[])){
      const b=e.id&&bMap.get(e.id); if(!b) continue;
      if(String(b.superset||'')===String(e.superset||'')) continue;
      e.superset=b.superset===undefined?'':b.superset; touched++;
    }
    if(touched){ n+=touched; updates.push({id:before.id,name:after.name,data,touched}); }
  }
  console.log(`superset values to revert: ${n} across ${updates.length} plans`);
  updates.forEach(u=>console.log(`   ${String(u.name).slice(0,30).padEnd(31)} ${u.touched}`));
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  let ok=0; for(const u of updates){ const {error}=await s.from('plans').update({data:u.data}).eq('id',u.id); if(!error)ok++; else console.log('FAIL',u.id,error.message); }
  // verify against the backups again
  let left=0;
  for(const f of fs.readdirSync(DIR).filter(x=>x.endsWith('.json'))){
    const before=JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));
    const {data:a}=await s.from('plans').select('data').eq('id',before.id).single();
    if(!a) continue;
    const bMap=new Map();
    for(const d of (before.data?.days||[])) for(const e of (d.exercises||d.ex||[])) if(e.id) bMap.set(e.id,e);
    for(const d of (a.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
      const b=e.id&&bMap.get(e.id); if(b && String(b.superset||'')!==String(e.superset||'')) left++; }
  }
  console.log(`VERIFIED FROM DB: reverted ${ok} plans, superset differences remaining: ${left}`);
  process.exit(left?1:0);
})();
