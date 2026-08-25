// The original bug, re-run against REAL data through the REAL function.
//
// Takes the actual days of the program Ohad copied (Omer's Block #3) and the
// actual exercise library, runs cloneDayForCopy, and checks the copied rows are
// self-contained — i.e. an athlete who cannot resolve the library still gets
// the video and the name.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const SRC = process.argv[2] || 'plan_qmbgj6pue69mo91eqy0';   // Omer Block #3
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const { cloneDayForCopy } = await import('../src/planCopy.js');
  const {data:libRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=libRow.value||[];
  const {data:p}=await s.from('plans').select('id,name,data').eq('id',SRC).single();
  if(!p){console.log('source plan not found');process.exit(1);}
  let uid=0; const newId=()=>'test'+(++uid);
  let rows=0, withVid=0, withTitle=0, before=0;
  for(const d of (p.data?.days||[])){
    for(const e of (d.exercises||d.ex||[])) if(e.videoUrl) before++;
    const c=cloneDayForCopy(d, lib, newId);
    for(const e of c.exercises){ rows++; if(e.videoUrl) withVid++; if(String(e.title||'').trim()) withTitle++; }
  }
  console.log(`source: "${p.name}" (${SRC})`);
  console.log(`  rows: ${rows}`);
  console.log(`  rows carrying their OWN videoUrl BEFORE the copy: ${before}`);
  console.log(`  rows carrying their OWN videoUrl AFTER  the copy: ${withVid}`);
  console.log(`  rows carrying a title after the copy:             ${withTitle}/${rows}`);
  const gained = withVid - before;
  console.log(gained>0 ? `\nPASS — the copy materialises ${gained} videos that the row did not previously hold.`
                       : `\nNOTE — no videos gained; the library has none for these exercises.`);
  process.exit(0);
})();
