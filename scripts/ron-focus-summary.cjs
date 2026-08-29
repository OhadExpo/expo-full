const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blockNum = (n) => { const m = /(?:block|phase)\s*#?\s*(\d+)|#(\d+)/i.exec(n||''); return m?parseInt(m[1]||m[2],10):-1; };
(async()=>{
  await s.auth.signInWithPassword({email:'ohadyproductions@gmail.com',password:'1234'});
  const {data:trRow}=await s.from('store').select('value').eq('key','expo-trainees').single();
  const ron=(trRow?.value||[]).find(t=>/רון יונקר|yunker/i.test(t.name||''));
  const {data:plans}=await s.from('plans').select('id,name,data').eq('trainee_id',ron.id);
  const latest=(plans||[]).slice().sort((a,b)=>blockNum(b.name)-blockNum(a.name))[0];
  const weeks = latest.data?.weeks || '?';
  const dayNames = (latest.data?.days||[]).map(d=>d.name||d.n);
  console.log('block:',latest.name,'| weeks:',weeks,'| days:',JSON.stringify(dayNames));
  // client_workouts logged for this block → what week is Ron on?
  const {data:cw}=await s.from('client_workouts').select('week,day_name,date').eq('client_id',ron.id).eq('plan_name',latest.name);
  const loggedWeeks=[...new Set((cw||[]).map(w=>w.week))].sort((a,b)=>a-b);
  console.log('logged weeks:',JSON.stringify(loggedWeeks),'(',cw?.length,'workouts)');
  const {data:wf}=await s.from('weekly_focus').select('focus_key').eq('client_id',ron.id);
  const forBlock=(wf||[]).filter(r=>r.focus_key.includes(`|${latest.name}|`));
  const byWeek={};
  for(const r of forBlock){const m=r.focus_key.match(/\|W(\d+)$/);const wk=m?+m[1]:-1;byWeek[wk]=(byWeek[wk]||0)+1;}
  console.log('focus notes per week:', JSON.stringify(byWeek));
  process.exit(0);
})();
