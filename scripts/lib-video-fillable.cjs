const { createClient } = require('@supabase/supabase-js');
const fs=require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const norm=(t)=>String(t||'').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.\s]+$/,'');
const isHttp=(u)=>typeof u==='string'&&/^https?:\/\//i.test(u);
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const map=JSON.parse(fs.readFileSync('scripts/omer-video-map.json','utf8')); // all-sheets title->video
  const {data:exRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=exRow?.value||[];
  const noVid=lib.filter(e=>!isHttp(e.videoLink||e.videoUrl));
  let fillable=0; const samples=[];
  for(const e of noVid){ const v=map[norm(e.title)]; if(v){fillable++; if(samples.length<15) samples.push(`${e.title}  ->  ${v.slice(0,45)}`);} }
  console.log(`library no-video: ${noVid.length}`);
  console.log(`fillable by EXACT title from your sheets: ${fillable}`);
  console.log('\nsamples:'); samples.forEach(x=>console.log('  '+x));
  process.exit(0);
})();
