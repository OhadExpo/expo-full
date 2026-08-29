// APPLIES the unambiguous roster updates approved by Ohad (2026-07-01):
// 8 last-payment dates + Omer's perSession=175. Does NOT touch split prices.
// Owner auth required. Re-reads after writing to confirm.
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co','sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv');

// id -> field patch
const PATCH = {
  tr_amit:       { lastPayment: '2026-06-01' },
  tr_ron:        { lastPayment: '2026-05-29' },
  tr_ayelet:     { lastPayment: '2026-06-17' },
  tr_moshe_dana: { lastPayment: '2026-06-22' },
  tr_miya_hilk:  { lastPayment: '2026-06-06' },
  tr_neta_tom:   { lastPayment: '2026-07-01' },
  tr_ilan:       { lastPayment: '2026-06-26' },
  tr_omer:       { lastPayment: '2026-06-23', perSession: 175 },
};

(async () => {
  const { error: authErr } = await s.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (authErr) { console.error('AUTH FAILED:', authErr.message); process.exit(1); }

  const { data: tr } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const trainees = tr?.value || [];
  if (!trainees.length) { console.error('No trainees loaded — aborting.'); process.exit(1); }

  let touched = 0;
  const next = trainees.map(t => {
    const p = PATCH[t.id];
    if (!p) return t;
    touched++;
    return { ...t, ...p };
  });
  if (touched !== Object.keys(PATCH).length) {
    console.error(`Expected ${Object.keys(PATCH).length} matches, patched ${touched} — aborting to be safe.`);
    process.exit(1);
  }

  const { error: upErr } = await s.from('store').update({ value: next }).eq('key','expo-trainees');
  if (upErr) { console.error('WRITE FAILED:', upErr.message); process.exit(1); }

  // Verify
  const { data: chk } = await s.from('store').select('value').eq('key','expo-trainees').maybeSingle();
  const after = new Map((chk?.value || []).map(t => [t.id, t]));
  console.log('WROTE OK. Verified:');
  for (const id of Object.keys(PATCH)) {
    const t = after.get(id);
    console.log('  ' + id.padEnd(16) + ' lastPayment=' + (t?.lastPayment||'-') + ' perSession=' + (t?.perSession ?? '-'));
  }
})().catch(e => console.error(e));
