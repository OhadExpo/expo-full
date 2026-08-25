// What an ATHLETE actually sees: for every exercise row in every plan, is there
// a video? Row override first, then the library. This is the coverage number
// that matters, not the library's internal count.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:libRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=libRow.value||[]; const byId=new Map(lib.map(e=>[e.id,e]));
  const {data:tr}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const names=new Map((tr.value||[]).map(t=>[t.id,t.name]));
  const {data:plans}=await s.from('plans').select('id,name,trainee_id,active,data');
  let rows=0,haveRow=0,haveLib=0,none=0;
  const perAthlete=new Map(); const missTitles=new Map();
  for(const p of plans||[]){
    const base=String(p.trainee_id||'').replace(/__\d+$/,'');
    for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
      rows++;
      const rec=perAthlete.get(base)||{n:0,ok:0}; rec.n++;
      if(e.videoUrl){haveRow++;rec.ok++;}
      else{ const L=byId.get(e.exerciseId||e.eid||''); if(L&&L.videoLink){haveLib++;rec.ok++;} else {none++; const t=String(e.title||L&&L.title||'?').trim(); missTitles.set(t,(missTitles.get(t)||0)+1);} }
      perAthlete.set(base,rec);
    }
  }
  console.log(`plan exercise rows: ${rows}`);
  console.log(`  own videoUrl:    ${haveRow}`);
  console.log(`  via library:     ${haveLib}`);
  console.log(`  NO VIDEO:        ${none}  (${(none/rows*100).toFixed(1)}%)`);
  console.log('\nworst athletes by missing count:');
  [...perAthlete.entries()].map(([id,r])=>({id,name:names.get(id)||id,miss:r.n-r.ok,n:r.n}))
    .filter(x=>x.miss).sort((a,b)=>b.miss-a.miss).slice(0,8)
    .forEach(x=>console.log(`  ${String(x.name).slice(0,22).padEnd(23)} ${x.miss} of ${x.n}`));
  console.log('\nmost common exercises with no video anywhere:');
  [...missTitles.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([t,c])=>console.log(`  ${String(c).padStart(3)}x  ${t.slice(0,52)}`));
  process.exit(0);
})();
