// Verify the plans RLS fix from REAL non-staff seats. READ-ONLY.
//
// Note: the only id collision on the live roster was tr_yuval -> tr_yuval_gotlib,
// and tr_yuval is the STAFF account (yuvalberkovitch@gmail.com), who reads all
// plans legitimately via trainer_all_plans. So the old policy bug was real but
// NOT exploitable in practice today; the fix is correctness/defence for the
// moment any two athlete ids share a prefix. The wildcard-vs-literal proof is
// in the migration (expression-level).
const { createClient } = require('@supabase/supabase-js');
const URL='https://gtcbfglttoiyfsnfbhdy.supabase.co', KEY='sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
let pass=0,fail=0;
const check=(l,ok,d='')=>{if(ok){pass++;console.log(`  PASS  ${l}${d?'  — '+d:''}`);}else{fail++;console.log(`  FAIL  ${l}${d?'  — '+d:''}`);}};
async function seat(email){const sb=createClient(URL,KEY,{auth:{persistSession:false}});
 const {error}=await sb.auth.signInWithPassword({email,password:'1234'});if(error)throw new Error(`${email}: ${error.message}`);return sb;}
const parentOf=(id)=>String(id).replace(/__[0-9]+$/,'');
(async()=>{
  for (const [label,email,expectParent] of [
    ['solo athlete (Diego)','diego@diegoday.com','tr_diego'],
    ['couple member (Moshe)','mtini30@gmail.com','tr_moshe_dana'],
    ['couple member (Dana)','danina.ronen@gmail.com','tr_moshe_dana'],
  ]) {
    const sb=await seat(email);
    const {data}=await sb.from('plans').select('id,trainee_id');
    const rows=data||[];
    const foreign=rows.filter(r=>parentOf(r.trainee_id)!==expectParent);
    check(`${label}: sees only own/sub plans`, foreign.length===0,
      foreign.length?`LEAKED ${[...new Set(foreign.map(f=>f.trainee_id))].join(', ')}`:`${rows.length} row(s)`);
    check(`${label}: still HAS plan access (not broken)`, rows.length>0, `${rows.length} row(s)`);
    await sb.auth.signOut();
  }
  console.log(`\nassertions: ${pass+fail}  passed: ${pass}  failed: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});
