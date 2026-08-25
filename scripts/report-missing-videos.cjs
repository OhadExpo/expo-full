// Which missing videos actually COST the most — ranked by how many live plan
// rows they leave blank, so recording a handful covers the most athletes.
const { createClient } = require('@supabase/supabase-js');
const fs=require('fs');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const okUrl=(u)=>/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(u||''));
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:libRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=libRow.value||[]; const byId=new Map(lib.map(e=>[e.id,e]));
  const {data:tr}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const names=new Map((tr.value||[]).map(t=>[t.id,t.name]));
  const {data:plans}=await s.from('plans').select('trainee_id,active,data');
  const cost=new Map();
  for(const p of plans||[]){
    const who=names.get(String(p.trainee_id||'').replace(/__\d+$/,''))||p.trainee_id;
    for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
      if(okUrl(e.videoUrl)) continue;
      const L=byId.get(e.exerciseId||e.eid||'');
      if(L&&okUrl(L.videoLink)) continue;
      const title=String((L&&L.title)||e.title||'').trim();
      if(!title) continue;
      const rec=cost.get(title)||{n:0,who:new Set(),id:(L&&L.id)||''};
      rec.n++; rec.who.add(who); cost.set(title,rec);
    }
  }
  const list=[...cost.entries()].map(([t,r])=>({t,n:r.n,ath:r.who.size,id:r.id})).sort((a,b)=>b.n-a.n);
  const totalRows=list.reduce((a,x)=>a+x.n,0);
  console.log(`exercises with no video anywhere: ${list.length}  (leaving ${totalRows} plan rows blank)`);
  const top=list.slice(0,25);
  console.log(`top 25 cover ${top.reduce((a,x)=>a+x.n,0)} rows:\n`);
  top.forEach((x,i)=>console.log(`${String(i+1).padStart(3)}. ${String(x.n).padStart(3)} rows / ${String(x.ath).padStart(2)} athletes  ${x.t.slice(0,54)}`));
  fs.writeFileSync('docs/missing-videos.md',
    '# Exercises with no video anywhere\n\n'+
    `${list.length} exercises leave ${totalRows} plan rows without a demo video. Ranked by how many rows each one would fix.\n\n`+
    '| rows | athletes | exercise | id |\n|---:|---:|---|---|\n'+
    list.map(x=>`| ${x.n} | ${x.ath} | ${x.t.replace(/\|/g,'/')} | ${x.id} |`).join('\n')+'\n');
  console.log('\nfull list -> docs/missing-videos.md');
  process.exit(0);
})();
