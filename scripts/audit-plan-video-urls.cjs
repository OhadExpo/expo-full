// Structural validity of every videoUrl on a plan row and every warm-up vid.
// Same defect class as the library: "&amp;" and "http://" and a bad host make a
// link that silently shows the athlete nothing.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY = process.argv.includes('--apply');
const fixUrl=(u)=>{let v=String(u).trim().replace(/&amp;/g,'&');
  v=v.replace(/^https?:\/\/\.?youtube\.com/i,'https://www.youtube.com').replace(/^http:\/\//i,'https://');return v;};
const ok=(u)=>{try{const x=new URL(u);return /^https?:$/.test(x.protocol)&&/\w\.\w/.test(x.hostname);}catch{return false;}};
const dirty=(u)=>u && (!ok(u) || /&amp;|^http:/i.test(u));
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:plans}=await s.from('plans').select('id,name,data');
  let rows=0,rowBad=0,warm=0,warmBad=0,plansTouched=0,unfixable=0;
  const updates=[];
  for(const p of plans||[]){
    const data=JSON.parse(JSON.stringify(p.data||{}));
    let touched=0;
    for(const d of (data.days||[])) for(const e of (d.exercises||d.ex||[])){
      if(!e.videoUrl) continue; rows++;
      if(!dirty(e.videoUrl)) continue;
      rowBad++; const f=fixUrl(e.videoUrl);
      if(ok(f)){ e.videoUrl=f; touched++; } else unfixable++;
    }
    for(const w of (data.warmup||[])){
      if(!w.vid) continue; warm++;
      if(!dirty(w.vid)) continue;
      warmBad++; const f=fixUrl(w.vid);
      if(ok(f)){ w.vid=f; touched++; } else unfixable++;
    }
    if(touched){ plansTouched++; updates.push({id:p.id,data}); }
  }
  console.log(`plan rows with a video: ${rows} | malformed: ${rowBad}`);
  console.log(`warm-up steps with a video: ${warm} | malformed: ${warmBad}`);
  console.log(`plans needing repair: ${plansTouched} | unfixable: ${unfixable}`);
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  let done=0; for(const u of updates){ const {error}=await s.from('plans').update({data:u.data}).eq('id',u.id); if(!error)done++; else console.log('FAIL',u.id,error.message); }
  const {data:after}=await s.from('plans').select('data');
  let still=0;
  for(const p of after||[]){ for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])) if(dirty(e.videoUrl)) still++;
    for(const w of (p.data?.warmup||[])) if(dirty(w.vid)) still++; }
  console.log(`VERIFIED FROM DB: repaired ${done} plans, still malformed ${still}`);
  process.exit(0);
})();
