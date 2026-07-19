// SECURITY PROBE — can a plain athlete read/destroy push subscriptions?
//
// Advisor flagged lookup_push_subscriptions() and cleanup_push_subscription()
// as SECURITY DEFINER + executable by `authenticated`, and neither has an
// internal ownership guard. This confirms exploitability from a REAL athlete
// seat before any fix is applied.
//
// READ-ONLY: it calls the lookup (harmless) and does NOT call the delete.
// It probes the delete only for the ERROR SHAPE using an id that cannot exist
// (negative), which deletes nothing but proves whether EXECUTE is permitted.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

(async () => {
  const sb = createClient(URL, KEY);
  const { error: authErr } = await sb.auth.signInWithPassword({ email: 'diego@diegoday.com', password: '1234' });
  if (authErr) throw new Error('sign-in: ' + authErr.message);
  console.log('signed in as ATHLETE diego@diegoday.com (not staff)\n');

  const { data: staff } = await sb.rpc('is_staff');
  console.log('is_staff() ->', staff);

  // 1. Read the COACH's push subscriptions as an athlete.
  const { data: subs, error: e1 } = await sb.rpc('lookup_push_subscriptions', {
    target_email: 'ohadyproductions@gmail.com',
  });
  if (e1) {
    console.log('lookup_push_subscriptions -> BLOCKED:', e1.message);
  } else {
    const rows = Array.isArray(subs) ? subs : (subs ? [subs] : []);
    console.log(`lookup_push_subscriptions -> ALLOWED, ${rows.length} row(s) returned`);
    rows.forEach(r => console.log(`   id=${r.id}  endpoint=${String(r.endpoint || '').slice(0, 58)}…  p256dh=${r.p256dh ? 'PRESENT' : '-'}  auth=${r.auth ? 'PRESENT' : '-'}`));
  }

  // 2. Is the DELETE callable at all? Use id = -1 so nothing is ever removed.
  const { error: e2 } = await sb.rpc('cleanup_push_subscription', { sub_id: -1 });
  console.log(e2
    ? `cleanup_push_subscription(-1) -> BLOCKED: ${e2.message}`
    : 'cleanup_push_subscription(-1) -> ALLOWED (executed; deleted nothing, but EXECUTE is granted)');

  await sb.auth.signOut();
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
