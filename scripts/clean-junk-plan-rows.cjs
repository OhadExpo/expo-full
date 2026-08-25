// Remove rows that are not exercises. Conservative by default: only LABEL and
// BANNER rows ("SuperSet", "Super Set:", "^ ... ^"), which are formatting
// devices an import mistook for exercises.
//
// --breakdown additionally removes movement-breakdown cells ("Sagittal,
// Bilateral"). That is left OFF by default because a plan made mostly of them
// is a wholesale bad import, and emptying it is a decision, not a cleanup.
const { createClient } = require('@supabase/supabase-js');
const fs=require('fs'), path=require('path');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const APPLY=process.argv.includes('--apply'), DOBREAK=process.argv.includes('--breakdown');
const LABEL=/^(superset|super ?set|back-?off ?set|circuit|giant ?set|complex|dropset|drop ?set|amrap)s?\s*:?\s*$/i;
const VOCAB=/^(sagittal|frontal|transverse|triplanar|bilateral|unilateral|alternating|uni|bi|up|down|front|back)$/i;
const kindOf=(t)=>{const c=String(t||'').trim();
  if(LABEL.test(c)) return 'label';
  if(/^[\^*~]+.*[\^*~]+$/.test(c)) return 'banner';
  const w=c.split(/[\s,\/]+/).filter(Boolean);
  if(w.length && w.every(x=>VOCAB.test(x))) return 'breakdown';
  return null;};
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:plans}=await s.from('plans').select('id,name,trainee_id,data');
  const dir='scripts/_junk-backups-'+new Date().toISOString().slice(0,10);
  const updates=[]; let removed=0;
  for(const p of plans||[]){
    const data=JSON.parse(JSON.stringify(p.data||{})); let n=0;
    for(const d of (data.days||[])){
      const key=d.exercises?'exercises':(d.ex?'ex':null); if(!key) continue;
      const before=d[key].length;
      d[key]=d[key].filter(e=>{const k=kindOf(e.title); if(!k) return true; if(k==='breakdown'&&!DOBREAK) return true; return false;});
      n+=before-d[key].length;
    }
    if(n){ removed+=n; updates.push({id:p.id,name:p.name,data,n,orig:p}); }
  }
  console.log(`plans to clean: ${updates.length} | rows to remove: ${removed}`);
  updates.forEach(u=>console.log(`  ${String(u.name).slice(0,30).padEnd(31)} -${u.n}`));
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  fs.mkdirSync(dir,{recursive:true});
  let done=0;
  for(const u of updates){
    fs.writeFileSync(path.join(dir,u.id+'.json'),JSON.stringify(u.orig,null,2));
    const {error}=await s.from('plans').update({data:u.data}).eq('id',u.id);
    if(error) console.log('FAIL',u.id,error.message); else done++;
  }
  const {data:after}=await s.from('plans').select('data');
  let still=0; for(const p of after||[]) for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){const k=kindOf(e.title); if(k&&(k!=='breakdown'||DOBREAK)) still++;}
  console.log(`VERIFIED FROM DB: cleaned ${done} plans, junk rows left ${still} | backups: ${dir}`);
  process.exit(0);
})();
