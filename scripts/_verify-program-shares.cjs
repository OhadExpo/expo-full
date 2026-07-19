// Verify: share tokens are no longer dumpable, but a real share link still works.
const { createClient } = require('@supabase/supabase-js');
const URL='https://gtcbfglttoiyfsnfbhdy.supabase.co', KEY='sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
let pass=0,fail=0;
const check=(l,ok,d='')=>{if(ok){pass++;console.log(`  PASS  ${l}${d?'  — '+d:''}`);}else{fail++;console.log(`  FAIL  ${l}${d?'  — '+d:''}`);}};
(async()=>{
  // Grab a real token as the OWNER (who legitimately can), to test the RPC with.
  const owner=createClient(URL,KEY,{auth:{persistSession:false}});
  await owner.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:mine}=await owner.from('program_shares').select('token').limit(1);
  const token=(mine&&mine[0]&&mine[0].token)||null;
  check('owner can still list shares (coach UI)', Array.isArray(mine), `${(mine||[]).length} row(s)`);

  // ANON — the attacker path.
  const anon=createClient(URL,KEY,{auth:{persistSession:false}});
  const {data:dump}=await anon.from('program_shares').select('*');
  check('anon CANNOT dump share tokens', !dump || dump.length===0, `${(dump||[]).length} row(s)`);

  // ANON — the legitimate share-link path must still work.
  if(token){
    const {data:prog,error}=await anon.rpc('get_shared_program',{p_token:token});
    check('anon CAN still open a real share link via RPC', !error && !!prog, error?error.message:'program returned');
    const {data:bad}=await anon.rpc('get_shared_program',{p_token:'not-a-real-token'});
    check('bogus token returns nothing', !bad || (Array.isArray(bad)&&bad.length===0) || bad===null);
  } else {
    console.log('  SKIP  no existing share rows to test the RPC against');
  }
  await owner.auth.signOut();
  console.log(`\nassertions: ${pass+fail}  passed: ${pass}  failed: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});
