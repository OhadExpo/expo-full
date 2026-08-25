// Restore plans from a backup directory written by apply-sheet-fixes.cjs.
const { createClient } = require('@supabase/supabase-js');
const fs=require('fs'), path=require('path');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const DIR=process.argv[2], APPLY=process.argv.includes('--apply');
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const files=fs.readdirSync(DIR).filter(f=>f.endsWith('.json'));
  console.log('backups found:',files.length);
  if(!APPLY){console.log('DRY RUN — pass --apply');process.exit(0);}
  let ok=0,fail=0;
  for(const f of files){
    const p=JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));
    const {error}=await s.from('plans').update({data:p.data}).eq('id',p.id);
    if(error){console.log('FAIL',p.id,error.message);fail++;}else ok++;
  }
  console.log(`restored ${ok}, failed ${fail}`);
  process.exit(fail?1:0);
})();
