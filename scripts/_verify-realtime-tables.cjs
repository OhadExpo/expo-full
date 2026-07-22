// Verify postgres_changes subscriptions now work (publication was empty before).
const { createClient } = require('@supabase/supabase-js');
const URL='https://gtcbfglttoiyfsnfbhdy.supabase.co', KEY='sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
function check(sb, table){
  return new Promise((resolve)=>{
    const ch = sb.channel('verify:'+table)
      .on('postgres_changes',{event:'*',schema:'public',table},()=>{})
      .subscribe((status, err)=>{
        if(status==='SUBSCRIBED'){ resolve(`${table}: SUBSCRIBED ✓`); try{sb.removeChannel(ch);}catch{} }
        else if(status==='CHANNEL_ERROR'){ resolve(`${table}: ERROR ✗ ${err?err.message:''}`); try{sb.removeChannel(ch);}catch{} }
        else if(status==='TIMED_OUT'){ resolve(`${table}: TIMED_OUT ✗`); try{sb.removeChannel(ch);}catch{} }
      });
    setTimeout(()=>resolve(`${table}: (no terminal status in 12s)`), 12000);
  });
}
(async()=>{
  const sb=createClient(URL,KEY,{auth:{persistSession:false}});
  await sb.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  await sb.realtime.setAuth();
  for(const t of ['coach_notes','coach_messages','bit_payment_requests']){
    console.log('  '+await check(sb,t));
  }
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
