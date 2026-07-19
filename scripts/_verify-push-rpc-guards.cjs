// Verify the push-RPC guards: attack blocked, real feature still working.
//
// Non-destructive: the only delete attempted targets a row that does NOT
// belong to the caller, which is exactly what must now be refused. We assert
// the row still exists afterwards.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const OWNER = 'ohadyproductions@gmail.com';
const OTHER_ATHLETE = 'kidneythief14@gmail.com';   // Ayelet — unrelated to Diego

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  — ' + detail : ''}`); }
};

async function seat(email) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: '1234' });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sb;
}
const rows = (d) => (Array.isArray(d) ? d : d ? [d] : []);

(async () => {
  const athlete = await seat('diego@diegoday.com');
  const coach = await seat(OWNER);

  console.log('ATHLETE seat (diego, is_staff=false):');

  // Baseline: how many subs does the owner have (read via coach, authoritative)
  const { data: ownerSubsCoach } = await coach.rpc('lookup_push_subscriptions', { target_email: OWNER });
  const ownerCount = rows(ownerSubsCoach).length;
  const victimId = rows(ownerSubsCoach)[0]?.id;

  // 1. athlete -> ANOTHER ATHLETE must now be blocked (privacy between athletes)
  const { data: otherSubs, error: e1 } = await athlete.rpc('lookup_push_subscriptions', { target_email: OTHER_ATHLETE });
  check('athlete cannot enumerate another athlete', !!e1 || rows(otherSubs).length === 0,
    e1 ? e1.message : `${rows(otherSubs).length} row(s)`);

  // 2. athlete -> OWNER still allowed (athlete->coach push depends on it)
  const { data: ownerSubs, error: e2 } = await athlete.rpc('lookup_push_subscriptions', { target_email: OWNER });
  check('athlete CAN still resolve coach subs (feature intact)', !e2 && rows(ownerSubs).length === ownerCount,
    e2 ? e2.message : `${rows(ownerSubs).length}/${ownerCount} row(s)`);

  // 3. THE ATTACK: athlete deletes the coach's subscription. Must not remove it.
  if (victimId != null) {
    const { error: e3 } = await athlete.rpc('cleanup_push_subscription', { sub_id: victimId });
    const { data: after } = await coach.rpc('lookup_push_subscriptions', { target_email: OWNER });
    const stillThere = rows(after).some(r => r.id === victimId);
    check('athlete CANNOT delete the coach subscription', stillThere,
      `id=${victimId} ${stillThere ? 'survived' : 'WAS DELETED'}${e3 ? ' / rpc err: ' + e3.message : ''}`);
    check('coach subscription count unchanged', rows(after).length === ownerCount,
      `${rows(after).length}/${ownerCount}`);
  } else {
    console.log('  SKIP  no owner subscription rows to test against');
  }

  console.log('\nCOACH seat (staff):');
  const { data: anySubs, error: e4 } = await coach.rpc('lookup_push_subscriptions', { target_email: OTHER_ATHLETE });
  check('staff can still look up any athlete', !e4, e4 ? e4.message : `${rows(anySubs).length} row(s)`);

  await athlete.auth.signOut(); await coach.auth.signOut();
  console.log(`\nassertions: ${pass + fail}  passed: ${pass}  failed: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
