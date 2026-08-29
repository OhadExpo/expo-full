// Root-cause the library enrichment problem. Read-only.
// 1. Distinct xlsx values per column (are Movement Type = patterns? resistance = Dumbbell?).
// 2. How the expo library titles overlap the xlsx (exact / token-set), and spot-check
//    specific library titles Ohad sees to prove whether matching is buggy or the names differ.
// 3. Current fill state of the whole library (how many have each taxonomy field).
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const XLSX = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Desktop-expo-full/33c126c1-1fa5-49fc-8867-e401ddbc6e30/scratchpad/xlsx_library.json';
const norm=(x)=>String(x||'').trim().replace(/\s+/g,' ').toLowerCase();
const tset=(x)=>norm(x).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data}=await s.from('store').select('value').eq('key','expo-exercises').single();
  const lib=data.value;
  const xlsx=JSON.parse(fs.readFileSync(XLSX,'utf8'));
  const xArr=Object.values(xlsx);

  // 1. distinct xlsx values
  const distinct=(f)=>{const m={};xArr.forEach(r=>{if(r[f])m[r[f]]=(m[r[f]]||0)+1;});return m;};
  console.log('=== xlsx resistanceType values ==='); console.log(distinct('resistanceType'));
  console.log('=== xlsx movementType values (should be PATTERNS) ==='); console.log(distinct('movementType'));

  // 2. overlap
  const libByNorm=new Map(), libByTset=new Map();
  lib.forEach(e=>{const n=norm(e.title); if(n&&!libByNorm.has(n))libByNorm.set(n,e); const t=tset(e.title); if(t&&!libByTset.has(t))libByTset.set(t,e);});
  let exact=0,tsetOnly=0;
  xArr.forEach(r=>{const n=norm(r.name); if(libByNorm.has(n))exact++; else if(libByTset.has(tset(r.name)))tsetOnly++;});
  console.log(`\n=== overlap: exact=${exact} tsetOnly=${tsetOnly} total-matched=${exact+tsetOnly} of ${xArr.length} ===`);

  // 3. spot-check specific library titles Ohad sees — are they in the xlsx?
  const probes=['ISO Prone-Laying SA Y-Raise','Crab-POS Raise','Supine-Lying External-Rotation','Prone-Laying Neck Hold','Declined Push-Up Scap Protraction/Retraction','Inclined BB Supinated Push-Up','Banded Elbow Wall-Slide'];
  const xByNorm=new Set(xArr.map(r=>norm(r.name))), xByTset=new Set(xArr.map(r=>tset(r.name)));
  console.log('\n=== probe: library title -> in xlsx? ===');
  probes.forEach(p=>console.log(`  "${p}"  exact:${xByNorm.has(norm(p))} tset:${xByTset.has(tset(p))}`));

  // 4. library fill state
  const F=['category','resistanceType','bodyPosition','movementType','movementPattern','laterality','primaryMuscles'];
  const fill={}; F.forEach(f=>fill[f]=lib.filter(e=>e[f]&&String(e[f]).trim()).length);
  console.log('\n=== library (1472) current fill counts ==='); console.log(fill);

  // 5. how many library titles look like xlsx entries but DON'T token-set match
  //    (sample the first 12 library titles + whether each maps to an xlsx entry)
  console.log('\n=== first 15 library titles + xlsx match ===');
  lib.slice(0,15).forEach(e=>console.log(`  "${e.title}" -> exact:${xByNorm.has(norm(e.title))} tset:${xByTset.has(tset(e.title))}`));
})().catch(e=>{console.error(e);process.exit(1);});
