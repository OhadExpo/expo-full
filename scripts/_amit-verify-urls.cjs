const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');
(async () => {
  await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  const { data: plans } = await s.from('plans').select('name,data').eq('trainee_id', 'tr_bh_4djtfei1ly3');
  const rows = [];
  for (const p of plans) (p.data.days || []).forEach((d, di) => {
    const list = (d.exercises && d.exercises.length) ? d.exercises : (d.ex || []);
    list.forEach((ex, xi) => rows.push({ d: di + 1, i: xi + 1, t: ex.title || ex.name || '', v: ex.videoUrl != null ? ex.videoUrl : ex.video }));
  });
  const bad = rows.filter((r) => !/^https?:\/\/\S+$/.test(String(r.v || '')));
  const hosts = {};
  rows.forEach((r) => { try { const h = new URL(r.v).host; hosts[h] = (hosts[h] || 0) + 1; } catch { /* counted as bad */ } });
  console.log('rows:', rows.length, '| malformed or empty:', bad.length);
  bad.forEach((b) => console.log('   BAD day' + b.d + '#' + b.i, JSON.stringify(b.v), b.t));
  console.log('hosts:', JSON.stringify(hosts));
  const dupes = {};
  rows.forEach((r) => { dupes[r.v] = (dupes[r.v] || 0) + 1; });
  const rep = Object.entries(dupes).filter(([, n]) => n > 1);
  console.log('same URL on more than one row:', rep.length ? rep.map(([u, n]) => n + 'x ' + u.slice(0, 60)) : 'none');
})();
