// Verify the storage INSERT scoping: an athlete may write ONLY into their own
// folder, and legitimate uploads still succeed.
//
// Writes one tiny probe object into the athlete's OWN meal-photos folder and
// deletes it again. Everything else asserted here is a REJECTED write, so
// nothing lands in anyone else's prefix.
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  — ' + detail : ''}`); }
};

(async () => {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({ email: 'diego@diegoday.com', password: '1234' });
  if (authErr) throw new Error(authErr.message);

  const { data: mine } = await sb.rpc('current_trainee_id');
  console.log(`athlete seat: diego@diegoday.com   current_trainee_id() = ${mine}\n`);

  const body = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' });
  const stamp = Date.now();

  // 1. OWN folder — must still work (this is the real feature).
  const ownPath = `${mine}/_probe-${stamp}.jpg`;
  const { error: e1 } = await sb.storage.from('meal-photos').upload(ownPath, body, { contentType: 'image/jpeg' });
  check('athlete CAN upload to own meal-photos folder', !e1, e1 ? e1.message : ownPath);
  if (!e1) await sb.storage.from('meal-photos').remove([ownPath]);   // clean up

  // 2. ANOTHER athlete's folder — must be refused.
  const { error: e2 } = await sb.storage.from('meal-photos').upload(`tr_ayelet/_probe-${stamp}.jpg`, body, { contentType: 'image/jpeg' });
  check('athlete CANNOT write into another athlete meal folder', !!e2, e2 ? e2.message : '** WRITE SUCCEEDED **');

  // 3. Another athlete's coach-voice prefix — must be refused.
  const { error: e3 } = await sb.storage.from('coach-voice').upload(`tr_ayelet/_probe-${stamp}.webm`, body, { contentType: 'audio/webm' });
  check('athlete CANNOT write into another athlete voice folder', !!e3, e3 ? e3.message : '** WRITE SUCCEEDED **');

  // 4. coaching-contracts — staff-only now; athlete must be refused.
  const { error: e4 } = await sb.storage.from('coaching-contracts').upload(`tr_diego/_probe-${stamp}.pdf`, body, { contentType: 'application/pdf' });
  check('athlete CANNOT plant a coaching contract', !!e4, e4 ? e4.message : '** WRITE SUCCEEDED **');

  await sb.auth.signOut();
  console.log(`\nassertions: ${pass + fail}  passed: ${pass}  failed: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
