const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blockNum=(n)=>{const m=/(?:block|phase)\s*#?\s*(\d+)|#(\d+)/i.exec(n||'');return m?parseInt(m[1]||m[2],10):-1;};
const isHttp=(u)=>typeof u==='string'&&/^https?:\/\//i.test(u);
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:exRow}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const libById=new Map((exRow?.value||[]).map(e=>[e.id,e]));
  const {data:trRow}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const trainees=(trRow?.value||[]).filter(t=>t.status==='Active');
  const {data:plans}=await s.from('plans').select('id,name,trainee_id,data');
  for(const t of trainees){
    const ids=[t.id,t.id+'__0',t.id+'__1'];
    const theirs=plans.filter(p=>ids.includes(p.trainee_id));
    if(!theirs.length)continue;
    const latest=theirs.slice().sort((a,b)=>blockNum(b.name)-blockNum(a.name))[0];
    const missing=[];
    for(const d of (latest.data?.days||[])) for(const ex of (d.exercises||d.ex||[])){
      const eid=ex.exerciseId||ex.eid; const ov=('videoUrl'in ex)?ex.videoUrl:ex.vid;
      const libVid=libById.get(eid)?.videoLink||libById.get(eid)?.videoUrl;
      const resolved=(ov&&ov!=='')?ov:libVid;
      if(!isHttp(resolved)) missing.push(ex.title||eid);
    }
    if(missing.length&&!/עומר/.test(t.name)) console.log(`\n${t.name} · ${latest.name} (${missing.length}):\n  - `+missing.join('\n  - '));
  }
  process.exit(0);
})();
