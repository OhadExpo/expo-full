// Inspect Ron Yunker's weekly_focus for his latest block — before migrating.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
const blockNum = (n) => { const m = /(?:block|phase)\s*#?\s*(\d+)|#(\d+)/i.exec(n || ''); return m ? parseInt(m[1] || m[2], 10) : -1; };
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  // find Ron
  const { data: trRow } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const ron = (trRow?.value || []).find(t => /רון יונקר|ron.*yunk|yunker/i.test(t.name || ''));
  console.log('Ron:', ron?.id, ron?.name);
  if (!ron) { process.exit(1); }
  // his plans → latest block
  const { data: plans } = await s.from('plans').select('id,name').eq('trainee_id', ron.id);
  const latest = (plans || []).slice().sort((a, b) => blockNum(b.name) - blockNum(a.name))[0];
  console.log('Latest block:', latest?.name);
  // all weekly_focus rows for Ron
  const { data: wf } = await s.from('weekly_focus').select('focus_key,value').eq('client_id', ron.id);
  const forBlock = (wf || []).filter(r => r.focus_key.includes(`|${latest.name}|`));
  console.log(`\nweekly_focus rows for Ron total=${wf?.length || 0}, for "${latest.name}"=${forBlock.length}`);
  // group by week
  const byWeek = {};
  for (const r of forBlock) {
    const m = r.focus_key.match(/\|W(\d+)$/);
    const wk = m ? m[1] : '?';
    (byWeek[wk] = byWeek[wk] || []).push(r);
  }
  for (const wk of Object.keys(byWeek).sort((a, b) => a - b)) {
    console.log(`\n  === W${wk} (${byWeek[wk].length} notes) ===`);
    byWeek[wk].forEach(r => {
      const parts = r.focus_key.split('|');
      console.log(`    ${parts[3]} : ${String(r.value).replace(/\n/g, ' ').slice(0, 55)}`);
    });
  }
  process.exit(0);
})();
