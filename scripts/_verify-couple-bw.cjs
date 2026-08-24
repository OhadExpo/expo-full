// Is the couple card's "NO LOGS" honest? Count bodyweight rows per couple —
// parent id and both member ids. Read-only.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

(async () => {
  const { error: e1 } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (e1) { console.log('AUTH FAIL', e1.message); process.exit(1); }

  const { data: tRow } = await s.from('store').select('value').eq('key', 'expo-trainees').single();
  const trainees = (tRow && tRow.value) || [];
  const couples = trainees.filter((t) => t && Array.isArray(t.members) && t.members.length === 2 && t.status !== 'Archived');

  const { data: bw, error: e2 } = await s.from('bw_logs').select('client_id,bw,date');
  if (e2) { console.log('bw_logs read failed:', e2.message); }
  const rows = bw || [];
  console.log('bw_logs rows total:', rows.length);
  const subIdRows = rows.filter((r) => /__\d$/.test(String(r.client_id || '')));
  console.log('rows keyed to a couple MEMBER id (__0/__1):', subIdRows.length);

  console.log('\nper couple — parent / member0 / member1');
  for (const c of couples) {
    const n = (id) => rows.filter((r) => r.client_id === id && Number.isFinite(parseFloat(r.bw))).length;
    console.log(`  ${String(c.name).padEnd(26)} ${String(n(c.id)).padStart(3)} / ${String(n(c.id + '__0')).padStart(3)} / ${String(n(c.id + '__1')).padStart(3)}`);
  }
  console.log('\nA couple card shows the shared curve only at >= 2 parent-keyed rows;');
  console.log('anything less is an HONEST "NO LOGS", not a broken read.');
})();
