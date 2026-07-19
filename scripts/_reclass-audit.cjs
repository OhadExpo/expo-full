const { createClient } = require('@supabase/supabase-js');
const fs = require('fs'), path = require('path');
const URL='https://gtcbfglttoiyfsnfbhdy.supabase.co', KEY='sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
function load(){const p=path.join(__dirname,'..','src','liftDetect.js');let s=fs.readFileSync(p,'utf8').replace(/^import[^;]+;/gm,'').replace(/^export\s+/gm,'');const shim=`const medianFilter=(x)=>x,findPeaks=()=>[],isReal=(x)=>x!=null&&Number.isFinite(x);`;const m={};new Function('module','exports',`${shim}\n${s}\nmodule.exports={channelFromTaxonomy,channelFromTitle,isIsometricTitle};`)(m,m);return m.exports;}
const {channelFromTaxonomy,channelFromTitle,isIsometricTitle}=load();
const nameOf=(ex,t)=> isIsometricTitle(t) ? {kind:'none',source:'name',why:'isometric/hold'} : (channelFromTaxonomy(ex)||channelFromTitle(t));
// The four regressions found by auditing the previous build, plus guards that
// the good reclassifications survived.
const CASES=[
 ['ISO Kneeling Push-Up','none'],['ISO SL Superman Plank','none'],['ISO Wide-Grip Push-Up','none'],
 ['Cable Squatting Bicep Curl','elbow'],['SLDL POS SA DB Row','elbow'],
 ['Trap-Bar Squat','knee'],['Trap-Bar Continuous Squat Jump','knee'],
 ['Hip-Thrust March','hip'],['SL Hip-Thrust March','hip'],
 // must NOT regress:
 ['DB Pullover','sho'],['Machine SL Calf Raise','knee'],['Squatting Calf Raise','knee'],
 ['GHD Back Extension','hip'],['Lateral Bound','knee'],['BB DL','hip'],['Trap-Bar DL','hip'],
 ['BB SQ','knee'],['Standing Pronated DB Lateral Raise','sho'],['Machine Leg Extension','knee'],
 ['Laying DB Skullcrusher','elbow'],['Supine-Lying External-Rotation','sho'],
 ['Prone Laying Around the World','sho'],['Alternating UNI/IPSI KB SLDL','hip'],
 ['SL Hip-Thurst (Full-Foot)','hip'],['Hollow Rock','none'],['BB Bench Press','elbow'],
 ['Back Squat','knee'],['Romanian Deadlift','hip'],['Standing Cable Bicep Curl','elbow'],
];
let pass=0,fail=0;
for(const [title,want] of CASES){const r=nameOf(null,title);const got=r?r.kind:'(unknown)';
 if(got===want){pass++;} else {fail++;console.log(`FAIL  ${title}\n      got=${got} want=${want}  ${r?r.why:''}`);}}
console.log(`\ntargeted cases: ${pass+fail}  passed: ${pass}  failed: ${fail}`);
(async()=>{const sb=createClient(URL,KEY);await sb.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
const{data}=await sb.from('store').select('value').eq('key','expo-exercises').single();
const list=typeof data.value==='string'?JSON.parse(data.value):data.value;
let unknown=0,iso=0;const dist={};
for(const ex of list){const t=ex.title||ex.name||'';if(!t)continue;if(isIsometricTitle(t))iso++;const n=nameOf(ex,t);
 if(!n){unknown++;continue;}dist[n.kind]=(dist[n.kind]||0)+1;}
console.log(`\nlibrary ${list.length}: unknown ${unknown} (${(unknown/list.length*100).toFixed(1)}%), isometric-guarded ${iso}`);
console.log('distribution:',Object.entries(dist).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join('  '));
process.exit(fail?1:0);})();
