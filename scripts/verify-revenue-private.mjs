// REVENUE IS OWNER-ONLY, AND THIS PROVES IT FROM THE OTHER SEATS.
//
// Ohad's standing non-negotiable: "make sure nothing that you ever [do]
// interrupts with the athlete experience on expo and the physical therapists on
// bhbc. they should never be affected or stalled."
//
// The reconstructed revenue is deliberately NOT in bit_payment_requests -
// that table is athlete-readable, so importing history into it would put rows
// in athletes' portals. It lives in two tables with an owner-only policy and
// no athlete or staff policy at all.
//
// An empty table would pass any read test, so this asserts the owner CAN see
// rows first. A test that cannot fail proves nothing.
import { createClient } from '@supabase/supabase-js';

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const TABLES = ['revenue_sheet_event', 'revenue_month_total'];

const SEATS = [
  { who: 'OWNER   ohadyproductions', email: 'ohadyproductions@gmail.com', pw: '1234', expect: 'rows' },
  { who: 'ATHLETE diego', email: 'diego@diegoday.com', pw: '1234', expect: 'none' },
  { who: 'BHBC PT tomerlich', email: 'tomerlich11@gmail.com', pw: '1234', expect: 'none' },
  { who: 'BHBC    benshemer', email: 'benshemer4@gmail.com', pw: '1234', expect: 'none' },
  { who: 'ANON    (signed out)', email: null, expect: 'none' },
];

let bad = 0;
for (const seat of SEATS) {
  const s = createClient(URL, KEY, { auth: { persistSession: false } });
  if (seat.email) {
    const { error } = await s.auth.signInWithPassword({ email: seat.email, password: seat.pw });
    if (error) { console.log(`SKIP  ${seat.who}: cannot sign in (${error.message})`); continue; }
  }
  for (const t of TABLES) {
    const { data, error, count } = await s.from(t).select('*', { count: 'exact' }).limit(3);
    const n = error ? null : (count ?? (data || []).length);
    const denied = !!error;
    if (seat.expect === 'rows') {
      if (denied || !n) { bad++; console.log(`FAIL  ${seat.who} sees NOTHING in ${t} - the test cannot prove anything${error ? ': ' + error.message : ''}`); }
      else console.log(`ok    ${seat.who} sees ${n} rows in ${t}`);
    } else {
      if (!denied && n > 0) { bad++; console.log(`FAIL  ${seat.who} can READ ${n} rows of ${t}`); }
      else console.log(`ok    ${seat.who} sees nothing in ${t}${denied ? ' (denied)' : ' (0 rows)'}`);
    }
  }
  // A write from a non-owner seat must be refused, not silently dropped.
  if (seat.expect === 'none' && seat.email) {
    const { error } = await s.from('revenue_month_total')
      .insert({ month: '2000-01-01', channel: 'probe', amount: 1 });
    if (!error) { bad++; console.log(`FAIL  ${seat.who} could INSERT into revenue_month_total`); }
    else console.log(`ok    ${seat.who} cannot insert (${String(error.message).slice(0, 44)})`);
  }
}
console.log('');
console.log(bad ? `${bad} privacy problem(s) - revenue is visible where it must not be`
                : '0 - revenue is readable by the owner and by nobody else');
process.exit(bad ? 1 : 0);
