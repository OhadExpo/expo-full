// One-off verification for the DashboardView storage-widget fix:
// replicate the widget's exact REST walk twice — anon (old behavior)
// vs coach session Bearer (new behavior) — and print both totals.
const { createClient } = require('@supabase/supabase-js');
const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

const walk = async (token) => {
  const listRaw = async (prefix) => {
    const r = await fetch(`${URL}/storage/v1/object/list/form-videos`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix, limit: 1000 }),
    });
    if (!r.ok) throw new Error(`list failed at "${prefix}" (${r.status})`);
    return r.json();
  };
  let total = 0, files = 0;
  const rec = async (prefix) => {
    const data = await listRaw(prefix);
    if (!Array.isArray(data)) return;
    for (const it of data) {
      if (it.id === null) await rec(prefix ? `${prefix}/${it.name}` : it.name);
      else { total += it.metadata?.size || 0; files++; }
    }
  };
  await rec('');
  return { mb: (total / 1024 / 1024).toFixed(1), files };
};

(async () => {
  console.log('anon walk (old widget behavior):', JSON.stringify(await walk(null)));
  const s = createClient(URL, KEY);
  const { data, error } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (error) { console.error('AUTH FAIL', error.message); process.exit(1); }
  console.log('coach-session walk (new widget behavior):', JSON.stringify(await walk(data.session.access_token)));
})().catch(e => { console.error(e); process.exit(1); });
