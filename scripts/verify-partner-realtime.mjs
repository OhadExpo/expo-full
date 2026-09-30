// verify-partner-realtime.mjs - live updates in Elad's sandbox, and to nobody else (1.10, audit F6).
//
// The sbx_ copies of store / coach_notes / coach_messages / bit_payment_requests are in the
// realtime publication, and supabase.js points his postgres_changes subscriptions at them.
// Real seats, supabase-js realtime:
//   - HE subscribes to sbx_store, writes a probe row -> the change arrives;
//   - an ATHLETE subscribed to the same sandbox table hears nothing (RLS);
//   - HE subscribed to the REAL store key hears nothing of his own sandbox write.
// The probe row is removed. Local sign-out.
//
//   node scripts/verify-partner-realtime.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const src = fs.readFileSync('src/supabase.js', 'utf8');
const mk = () => createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (c, w) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + w); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const seat = async (email) => { const c = mk(); const { error } = await c.auth.signInWithPassword({ email, password: '1234' }); if (error) throw new Error(email + ': ' + error.message); return c; };
const KEY = 'expo-partner-rt-probe';
const e = await seat('eladeluz24@gmail.com'), d = await seat('diego@diegoday.com');
const heard = { elad: 0, athlete: 0, eladReal: 0 };
const sub = (c, name, table, who) => new Promise((res) => {
  const ch = c.channel(name).on('postgres_changes', { event: '*', schema: 'public', table, filter: `key=eq.${KEY}` }, () => { heard[who]++; })
    .subscribe((st) => { if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') res({ ch, st }); });
});
try {
  const a = await sub(e, 'rt-e', 'sbx_store', 'elad');
  const b = await sub(d, 'rt-d', 'sbx_store', 'athlete');
  const r = await sub(e, 'rt-er', 'store', 'eladReal');
  ok(a.st === 'SUBSCRIBED', `he subscribes to his copy (${a.st})`);
  await wait(1500);
  const { error: we } = await e.from('sbx_store').upsert({ key: KEY, value: { t: Date.now() } });
  ok(!we, 'he writes a probe into his copy' + (we ? ' - ' + we.message : ''));
  for (let k = 0; k < 20 && !heard.elad; k++) await wait(500);
  await wait(2000);
  ok(heard.elad > 0, `the change reaches him live (${heard.elad} event(s))`);
  ok(heard.athlete === 0, `an athlete listening to the sandbox table hears nothing (${heard.athlete}; subscribe status ${b.st})`);
  ok(heard.eladReal === 0, `nothing of his sandbox write shows on the REAL table (${heard.eladReal})`);
  for (const x of [a, b, r]) try { await x.ch.unsubscribe(); } catch { /* noop */ }
} catch (x) { fail++; console.log('FAIL: ' + x.message); }
finally {
  try { await e.from('sbx_store').delete().eq('key', KEY); } catch { /* noop */ }
  for (const c of [e, d]) { try { c.removeAllChannels(); } catch { /* noop */ } await c.auth.signOut({ scope: 'local' }); }
}
console.log(`PARTNER REALTIME: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
