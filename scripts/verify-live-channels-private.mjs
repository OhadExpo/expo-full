// verify-live-channels-private.mjs - 'plans-live' and 'bhbc-live' are PRIVATE (#510-A4).
//
// Applied 3.10 (scripts/migrations/2026-10-02-private-plans-bhbc-live.sql): the two
// channels join with private:true and realtime.messages RLS decides who hears them.
// Proven from three seats, both ways:
//   1. two owner sessions on the private channel: one sends, the other HEARS it
//      (the editor <-> preview and the club zone's re-read still work)
//   2. an anonymous socket joining the private channel is REFUSED
//   3. an anonymous socket joining the same topic as a PUBLIC channel does not
//      hear what the owner sends on the private one
//   node scripts/verify-live-channels-private.mjs
import { createClient } from '@supabase/supabase-js';
import { ownerClient } from './lib/store-client.mjs';

const URL = 'https://gtcbfglttoiyfsnfbhdy.supabase.co';
const KEY = 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const join = (client, topic, priv) => new Promise((resolve) => {
  const heard = [];
  const ch = client.channel(topic, { config: { private: priv, broadcast: { self: false } } });
  ch.on('broadcast', { event: 'probe' }, (m) => heard.push(m.payload));
  let done = false;
  ch.subscribe((status) => { if (done) return; if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { done = true; resolve({ ch, status, heard }); } });
  setTimeout(() => { if (!done) { done = true; resolve({ ch, status: 'NO-ANSWER', heard }); } }, 12000);
});

const A = await ownerClient();
const B = await ownerClient();
const anonClient = () => createClient(URL, KEY, { auth: { persistSession: false } });
// a club coach (is_bhbc_coach) must still hear the club zone's re-read signal
let coach = null;
if (process.env.BHBC_COACH_EMAIL) {
  coach = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await coach.auth.signInWithPassword({ email: process.env.BHBC_COACH_EMAIL, password: process.env.BHBC_COACH_PASSWORD || process.env.EXPO_PW || '' });
  if (error) { ok(false, 'club coach sign-in: ' + error.message); coach = null; }
} else { fail++; console.log('  FAIL no BHBC_COACH_EMAIL set - the club coach seat was NOT measured'); }
for (const topic of ['bhbc-live', 'plans-live']) {
  const a = await join(A, topic, true);
  const b = await join(B, topic, true);
  const x = await join(anonClient(), topic, true);
  const y = await join(anonClient(), topic, false);   // its OWN client: a shared one never answered (3.10)
  const c = coach && topic === 'bhbc-live' ? await join(coach, topic, true) : null;
  ok(a.status === 'SUBSCRIBED' && b.status === 'SUBSCRIBED', `${topic}: the owner joins the private channel (${a.status}/${b.status})`);
  ok(x.status !== 'SUBSCRIBED', `${topic}: an anonymous socket is refused on the private channel (${x.status})`);
  ok(y.status === 'SUBSCRIBED', `${topic}: the anonymous PUBLIC listener really joined (${y.status}) - else "hears nothing" measures nothing`);
  if (c) ok(c.status === 'SUBSCRIBED', `${topic}: a club coach joins the private channel (${c.status})`);
  const tag = 'p' + Date.now();
  await a.ch.send({ type: 'broadcast', event: 'probe', payload: { tag } });
  await wait(2500);
  ok(b.heard.some((p) => p && p.tag === tag), `${topic}: a second owner session HEARS the broadcast`);
  if (c) ok(c.heard.some((p) => p && p.tag === tag), `${topic}: the club coach HEARS the broadcast`);
  ok(!y.heard.some((p) => p && p.tag === tag), `${topic}: the anonymous public listener hears nothing (heard ${y.heard.length})`);
  for (const k of [a, b, x, y, c].filter(Boolean)) await k.ch.unsubscribe().catch(() => {});
}
for (const k of [A, B, coach].filter(Boolean)) await k.auth.signOut({ scope: 'local' }).catch(() => {});
console.log(`LIVE CHANNELS PRIVATE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
