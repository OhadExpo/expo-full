// Some library entries are the SAME exercise written short: "BB DL" vs
// "BB Deadlift". When one carries a video and the other does not, copy it.
//
// Guarded: the canonical key must be non-empty and at least two tokens. Hebrew
// titles contain no a-z characters, so an unguarded key collapses ALL of them
// to "" and they match each other — which would have copied a shoulder-raise
// video onto a row exercise.
const { createClient } = require('@supabase/supabase-js');
const fs=require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY=process.argv.includes('--apply');
const okUrl=(u)=>/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(u||''));
const norm=(t)=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const EXPAND={dl:'deadlift',ohp:'overheadpress',rdl:'romaniandeadlift',sldl:'singlelegdeadlift'};
const expand=(t)=>norm(t).split(' ').map(w=>EXPAND[w]||w).join(' ');
const key=(t)=>{const toks=expand(t).split(' ').filter(Boolean); if(toks.length<2) return ''; return toks.map(w=>w.slice(0,5)).sort().join('|');};
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:row}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=row.value||[];
  const byKey=new Map(); for(const e of lib) if(okUrl(e.videoLink)){const k=key(e.title); if(k&&!byKey.has(k)) byKey.set(k,e);}
  const pick=new Map();
  for(const e of lib){ if(okUrl(e.videoLink)) continue; const k=key(e.title); if(!k) continue; const t=byKey.get(k); if(t) pick.set(e.id,{url:t.videoLink,from:t.title,to:e.title}); }
  console.log(`twins to fill: ${pick.size}`);
  [...pick.values()].forEach(v=>console.log(`   ${v.to.slice(0,38).padEnd(39)} <- ${v.from.slice(0,38)}`));
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  if(!pick.size) process.exit(0);
  const bak='scripts/_backup-expo-exercises-twins-'+new Date().toISOString().slice(0,10)+'.json';
  if(!fs.existsSync(bak)) fs.writeFileSync(bak,JSON.stringify(lib,null,2));
  const next=lib.map(e=>pick.has(e.id)?{...e,videoLink:pick.get(e.id).url}:e);
  const {error}=await s.from('store').update({value:next}).eq('key','expo-exercises');
  if(error){console.log('WRITE FAILED',error.message);process.exit(1);}
  const {data:after}=await s.from('store').select('value').eq('key','expo-exercises').single();
  console.log(`VERIFIED FROM DB: ${(after.value||[]).filter(e=>okUrl(e.videoLink)).length} of ${(after.value||[]).length} have a video`);
  process.exit(0);
})();
