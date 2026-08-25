// Every videoLink in the library, checked for STRUCTURAL validity.
// A malformed host ("http://.youtube.com") silently shows the athlete nothing.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv.includes('--apply');
const fixUrl = (u) => {
  let v = String(u).trim().replace(/&amp;/g, '&');
  v = v.replace(/^http:\/\/\.youtube\.com/i, 'https://www.youtube.com');
  v = v.replace(/^https?:\/\/\.?youtube\.com/i, 'https://www.youtube.com');
  v = v.replace(/^http:\/\//i, 'https://');
  return v;
};
const ok = (u) => {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) && /\w\.\w/.test(x.hostname); }
  catch { return false; }
};
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:row}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=row.value||[];
  const broken=[], fixable=[];
  for(const e of lib){
    const u=e.videoLink; if(!u) continue;
    if(ok(u) && !/&amp;|^http:/i.test(u)) continue;
    const f=fixUrl(u);
    if(ok(f)) fixable.push({id:e.id,title:e.title,from:u,to:f}); else broken.push({id:e.id,title:e.title,u});
  }
  console.log(`library videos: ${lib.filter(e=>e.videoLink).length}`);
  console.log(`  repairable (bad host / http / &amp;): ${fixable.length}`);
  console.log(`  unrepairable: ${broken.length}`);
  fixable.slice(0,6).forEach(f=>console.log(`   ${f.title.slice(0,34).padEnd(35)} ${f.from.slice(0,40)} -> ${f.to.slice(0,40)}`));
  broken.slice(0,4).forEach(b=>console.log(`   BROKEN ${b.title.slice(0,30)} ${String(b.u).slice(0,44)}`));
  if(!APPLY){ console.log('DRY RUN — pass --apply'); process.exit(0); }
  if(!fixable.length){ console.log('nothing to do'); process.exit(0); }
  const byId=new Map(fixable.map(f=>[f.id,f.to]));
  const next=lib.map(e=>byId.has(e.id)?{...e,videoLink:byId.get(e.id)}:e);
  const {error}=await s.from('store').update({value:next}).eq('key','expo-exercises');
  if(error){console.log('WRITE FAILED',error.message);process.exit(1);}
  const {data:after}=await s.from('store').select('value').eq('key','expo-exercises').single();
  let stillBad=0; for(const e of after.value||[]){ if(e.videoLink && (!ok(e.videoLink) || /&amp;|^http:/i.test(e.videoLink))) stillBad++; }
  console.log(`VERIFIED FROM DB: repaired ${fixable.length}, still malformed ${stillBad}`);
  process.exit(0);
})();
