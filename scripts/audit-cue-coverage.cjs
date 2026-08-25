// What coaching guidance does an athlete actually get? A plan row shows its own
// notes, else the library's cues. Same shape as the video question.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const has=(v)=>!!String(v||'').trim();
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:libRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=libRow.value||[]; const byId=new Map(lib.map(e=>[e.id,e]));
  console.log(`library: ${lib.length} exercises | with cues: ${lib.filter(e=>has(e.cues)).length}`);
  const {data:plans}=await s.from('plans').select('data');
  let rows=0,own=0,viaLib=0,none=0,cleared=0;
  const missing=new Map();
  for(const p of plans||[]) for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
    rows++;
    const n=e.notes??e.n;
    if(has(n)){own++;continue;}
    if(e.notesEdited===true){cleared++;continue;}   // deliberately blank
    const L=byId.get(e.exerciseId||e.eid||'');
    if(L&&has(L.cues)){viaLib++;continue;}
    none++;
    const t=String((L&&L.title)||e.title||'').trim();
    if(t) missing.set(t,(missing.get(t)||0)+1);
  }
  console.log(`plan rows: ${rows}`);
  console.log(`  own notes:        ${own}`);
  console.log(`  via library cues: ${viaLib}`);
  console.log(`  deliberately blank: ${cleared}`);
  console.log(`  NO GUIDANCE:      ${none}  (${(none/rows*100).toFixed(1)}%)`);
  console.log('\ntop exercises with no cues anywhere:');
  [...missing.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([t,c])=>console.log(`  ${String(c).padStart(3)}x  ${t.slice(0,52)}`));
  process.exit(0);
})();
