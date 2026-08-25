// Rows that are not exercises at all: movement-breakdown cells ("Sagittal,
// Bilateral"), group labels ("SuperSet"), and empty titles. They came in from
// sheet imports that read the wrong column, and an athlete sees them as
// exercises with no video and no cues.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const PLANE=/^(sagittal|frontal|transverse|triplanar)\b/i;
const AXIS=/^(bilateral|unilateral|up\/down|front\/back|alternating|uni|bi)\b/i;
const LABEL=/^(superset|super ?set|back-?off ?set|circuit|giant ?set|complex|dropset|drop ?set|amrap|rest|note)s?\s*:?\s*$/i;
// A row is junk only when the title consists ENTIRELY of plane/axis vocabulary.
// "Unilateral DB Step-Up" and "Alternating DB Chest-Press" are real exercises —
// an earlier version matched any title STARTING with those words and flagged
// them, which would have deleted real programming.
const VOCAB=/^(sagittal|frontal|transverse|triplanar|bilateral|unilateral|alternating|uni|bi|up|down|front|back)$/i;
const isJunk=(t)=>{const c=String(t||'').trim();
  if(!c) return 'empty';
  if(LABEL.test(c)) return 'label';
  if(/^[\^*~]+.*[\^*~]+$/.test(c)) return 'banner';
  const words=c.split(/[\s,\/]+/).filter(Boolean);
  if(words.length && words.every(w=>VOCAB.test(w))) return 'breakdown';
  return null;};
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:tr}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const names=new Map((tr.value||[]).map(t=>[t.id,t.name]));
  const {data:plans}=await s.from('plans').select('id,name,trainee_id,data');
  const kinds={}; const perPlan=new Map(); let rows=0;
  for(const p of plans||[]){
    for(const d of (p.data?.days||[])) for(const e of (d.exercises||d.ex||[])){
      rows++;
      const k=isJunk(e.title);
      if(!k) continue;
      kinds[k]=(kinds[k]||0)+1;
      const key=p.id; const rec=perPlan.get(key)||{name:p.name,who:names.get(String(p.trainee_id||'').replace(/__\d+$/,''))||p.trainee_id,n:0,samples:[]};
      rec.n++; if(rec.samples.length<3) rec.samples.push(String(e.title||'(empty)').slice(0,30));
      perPlan.set(key,rec);
    }
  }
  console.log(`plan rows: ${rows}`);
  console.log('junk by kind:', Object.entries(kinds).map(([k,v])=>`${k}=${v}`).join('  ')||'none');
  const list=[...perPlan.entries()].sort((a,b)=>b[1].n-a[1].n);
  console.log(`plans containing junk rows: ${list.length}`);
  list.slice(0,10).forEach(([id,r])=>console.log(`  ${String(r.who).slice(0,18).padEnd(19)} ${String(r.name).slice(0,26).padEnd(27)} ${String(r.n).padStart(3)}  e.g. ${r.samples.join(' | ')}`));
  process.exit(0);
})();
