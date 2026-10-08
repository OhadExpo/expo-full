// COACH VOICE NOTES: WHO CAN SIGN A URL (9.10 #480).
//
// The owner's seat got 400 on every createSignedUrl for a coach-voice note: the
// bucket had INSERT policies only. voice_read_authed (2026-10-09 migration)
// mirrors the write rule: staff, or the athlete whose folder it is.
//
// The owner signing a real note is asserted FIRST: if nobody can sign, the
// "denied" lines below prove nothing.
import { createClient } from '@supabase/supabase-js';

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const NOTE = process.env.NOTE || 'tr_ylc4i7edmnxqyj3j/1778886328221.webm';
const OWNER_FOLDER = NOTE.split('/')[0];

const SEATS = [
  { who: 'OWNER   ohadyproductions', email: 'ohadyproductions@gmail.com', expect: 'sign' },
  { who: 'ATHLETE diego', email: 'diego@diegoday.com', expect: 'own-folder-only' },
  { who: 'BHBC PT tomerlich', email: 'tomerlich11@gmail.com', expect: 'denied' },
  { who: 'ANON    (signed out)', email: null, expect: 'denied' },
];

let bad = 0;
for (const seat of SEATS) {
  const s = createClient(URL, KEY, { auth: { persistSession: false } });
  let traineeId = null;
  if (seat.email) {
    const { error } = await s.auth.signInWithPassword({ email: seat.email, password: '1234' });
    if (error) { bad++; console.log(`FAIL  ${seat.who}: cannot sign in (${error.message})`); continue; }
    const { data } = await s.rpc('my_trainee');
    const row = Array.isArray(data) ? data[0] : data;
    traineeId = row?.id || null;
  }
  const { data, error } = await s.storage.from('coach-voice').createSignedUrl(NOTE, 60);
  const signed = !error && !!data?.signedUrl;
  let want = seat.expect === 'sign';
  if (seat.expect === 'own-folder-only') want = !!traineeId && traineeId.replace(/__\d+$/, '') === OWNER_FOLDER.replace(/__\d+$/, '');
  if (signed && want) {
    const r = await fetch(data.signedUrl, { method: 'GET', headers: { Range: 'bytes=0-15' } });
    if (r.status >= 400) { bad++; console.log(`FAIL  ${seat.who} signed but the URL returns ${r.status}`); }
    else console.log(`ok    ${seat.who} signs ${NOTE} and the URL returns ${r.status}`);
  } else if (signed !== want) {
    bad++; console.log(`FAIL  ${seat.who} ${signed ? 'CAN' : 'cannot'} sign ${NOTE} (expected ${want ? 'can' : 'cannot'})${error ? ': ' + error.message : ''}`);
  } else console.log(`ok    ${seat.who} cannot sign another athlete's note${error ? ' (' + error.message + ')' : ''}`);
  if (seat.email) await s.auth.signOut({ scope: 'local' });
}
console.log(bad ? `COACH-VOICE READ: ${bad} failed` : 'COACH-VOICE READ: all seats as expected');
process.exit(bad ? 1 : 0);
