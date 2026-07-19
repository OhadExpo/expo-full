// Probe: what identity helpers exist for the Realtime Authorization policy (#35).
// We need to know, from an AUTHENTICATED session, how the DB can answer:
//   "is this caller staff?"  and  "which trainee id is this caller?"
// because the realtime.messages RLS policy for 'gym-set:<tid>' has to decide
// exactly that. Read-only — calls RPCs, writes nothing.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

async function probe(label, email, password) {
  const sb = createClient(URL, KEY);
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) { console.log(`\n[${label}] SIGN-IN FAILED: ${authErr.message}`); return; }
  console.log(`\n=== ${label} (${email}) ===`);

  const { data: staff, error: sErr } = await sb.rpc('is_staff');
  console.log('is_staff() ->', sErr ? `ERR ${sErr.message}` : JSON.stringify(staff));

  const { data: mt, error: mErr } = await sb.rpc('my_trainee');
  if (mErr) {
    console.log('my_trainee() -> ERR', mErr.message);
  } else {
    const row = Array.isArray(mt) ? mt[0] : mt;
    console.log('my_trainee() -> id:', row?.id, '| keys:', row ? Object.keys(row).join(',') : '(null)');
  }
  await sb.auth.signOut();
}

(async () => {
  await probe('OWNER', 'ohadyproductions@gmail.com', '1234');
  await probe('ATHLETE', 'diego@diegoday.com', '1234');
})();
