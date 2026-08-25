// Some library entries are the SAME exercise written short: "BB DL" vs
// "BB Deadlift". When one carries a video (or coaching cues) and the other does
// not, copy it across.
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
  const hasCue=(e)=>!!String(e.cues||'').trim();
  const vidKey=new Map(), cueKey=new Map();
  for(const e of lib){ const k=key(e.title); if(!k) continue;
    if(okUrl(e.videoLink)&&!vidKey.has(k)) vidKey.set(k,e);
    if(hasCue(e)&&!cueKey.has(k)) cueKey.set(k,e); }
  const pick=new Map();
  for(const e of lib){
    const k=key(e.title); if(!k) continue;
    const patch={};
    if(!okUrl(e.videoLink)){ const t=vidKey.get(k); if(t){patch.videoLink=t.videoLink; patch.vidFrom=t.title;} }
    if(!hasCue(e)){ const t=cueKey.get(k); if(t){patch.cues=t.cues; patch.cueFrom=t.title;} }
    if(Object.keys(patch).length) pick.set(e.id,{...patch,to:e.title});
  }
  console.log(`twins to fill: ${pick.size}`);
  [...pick.values()].forEach(v=>console.log(`   ${v.to.slice(0,36).padEnd(37)} ${v.videoLink?'VIDEO<-'+String(v.vidFrom).slice(0,20):''} ${v.cues?'CUES<-'+String(v.cueFrom).slice(0,20):''}`));
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  if(!pick.size) process.exit(0);
  const bak='scripts/_backup-expo-exercises-twins-'+new Date().toISOString().slice(0,10)+'.json';
  if(!fs.existsSync(bak)) fs.writeFileSync(bak,JSON.stringify(lib,null,2));
  const next=lib.map(e=>{ const p=pick.get(e.id); if(!p) return e;
    const o={...e}; if(p.videoLink) o.videoLink=p.videoLink; if(p.cues) o.cues=p.cues; return o; });
  const {error}=await s.from('store').update({value:next}).eq('key','expo-exercises');
  if(error){console.log('WRITE FAILED',error.message);process.exit(1);}
  const {data:after}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const A=after.value||[];
  console.log(`VERIFIED FROM DB: ${A.filter(e=>okUrl(e.videoLink)).length} have a video, ${A.filter(e=>String(e.cues||'').trim()).length} have cues, of ${A.length}`);
  process.exit(0);
})();
