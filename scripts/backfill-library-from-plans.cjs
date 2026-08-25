// Fill library videos from PLAN ROWS.
//
// 699 plan rows carry their own videoUrl. Where such a row points at an
// exerciseId whose library entry has NO video, the link is already in the
// system — it just never made it up to the library, so every other athlete
// doing that exercise sees nothing.
//
// Matched by exerciseId, so there is no title guessing at all. Where several
// rows disagree, the most common url wins and the rest are reported.
const { createClient } = require('@supabase/supabase-js');
const fs=require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY=process.argv.includes('--apply');
const okUrl=(u)=>/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(u||''));
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:row}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=row.value||[];
  const need=new Set(lib.filter(e=>!okUrl(e.videoLink)).map(e=>e.id));
  const {data:plans}=await s.from('plans').select('data');
  const votes=new Map();
  for(const p of plans||[]) for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
    const id=e.exerciseId||e.eid||''; if(!id||!need.has(id)) continue;
    if(!okUrl(e.videoUrl)) continue;
    const m=votes.get(id)||new Map(); m.set(e.videoUrl,(m.get(e.videoUrl)||0)+1); votes.set(id,m);
  }
  let disagree=0;
  const pick=new Map();
  for(const [id,m] of votes){ const sorted=[...m.entries()].sort((a,b)=>b[1]-a[1]); if(sorted.length>1) disagree++; pick.set(id,sorted[0][0]); }
  console.log(`library entries with no video: ${need.size}`);
  console.log(`  fillable from plan rows: ${pick.size}  (${disagree} had more than one candidate; most common wins)`);
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  const stamp=new Date().toISOString().slice(0,10);
  const bak=`scripts/_backup-expo-exercises-plansfill-${stamp}.json`;
  if(!fs.existsSync(bak)) fs.writeFileSync(bak,JSON.stringify(lib,null,2));
  const next=lib.map(e=>pick.has(e.id)?{...e,videoLink:pick.get(e.id)}:e);
  const {error}=await s.from('store').update({value:next}).eq('key','expo-exercises');
  if(error){console.log('WRITE FAILED',error.message);process.exit(1);}
  const {data:after}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const now=(after.value||[]).filter(e=>okUrl(e.videoLink)).length;
  console.log(`VERIFIED FROM DB: ${now} of ${(after.value||[]).length} library exercises have a video | backup ${bak}`);
  process.exit(0);
})();
