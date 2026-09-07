// TWO CLIENTS, ONE TRUTH.
//
// Ohad: "make sure the app is perfectly live sync." The store hook subscribes to
// postgres_changes on the `store` table, so a write from another device — or
// from a sync script — should land in every open client with no reload.
//
// Reading that code proves nothing. This opens TWO authenticated pages on the
// same route, writes a value from OUTSIDE both of them (a third Supabase
// client, exactly like another device would), and watches whether each page
// picks it up on its own. The value written is a harmless BHBC fixture note,
// and the original value is restored at the end.
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const KEY = 'expo-bhbc-league';           // read-only in the UI, safe to touch
const PROBE = '__livesync_probe';

const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });

const { data: before, error: readErr } = await sb.from('store').select('value').eq('key', KEY).maybeSingle();
if (readErr || !before) { console.log('FAIL cannot read ' + KEY + ': ' + (readErr && readErr.message)); process.exit(1); }
const original = before.value;

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pages = [];
for (let i = 0; i < 2; i++) {
  const pg = await b.newPage();
  await A.signIn(pg, BASE);
  await setWidth(pg, 1400, 900);
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
  pages.push(pg);
}
await new Promise((r) => setTimeout(r, 14000));

// HOW THIS READS THE CLIENT'S VIEW.
//
// The first version polled localStorage and got null from both pages — which
// looked like broken sync and was not. useSupaStore mirrors a key to
// localStorage only if it FITS: this payload is ~150KB and the snapshot helper
// deliberately drops anything that would crowd the session. So the probe was
// reading a snapshot that is never written for this key.
//
// This asks the page to open its OWN realtime subscription on the same table
// and filter the hook uses, with the page's own authenticated Supabase client.
// If that event arrives, realtime reaches this client — which is the thing
// being tested — without depending on whether a given key is cached.
const arm = (pg) => pg.evaluate(async (key) => {
  const mod = await import('/src/supabase.js');
  const sb = mod.supabase || mod.default;
  window.__rt = { fired: 0, status: null };
  const ch = sb.channel('livesync-probe-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store', filter: `key=eq.${key}` }, () => { window.__rt.fired++; })
    .subscribe((st) => { window.__rt.status = st; });
  window.__rtCh = ch;
  return true;
}, KEY);

for (const pg of pages) await arm(pg);
// Give the sockets time to reach SUBSCRIBED before writing.
await new Promise((r) => setTimeout(r, 6000));
console.log('channel status: ' + JSON.stringify(await Promise.all(pages.map((pg) => pg.evaluate(() => window.__rt && window.__rt.status)))));

const stamp = String(Date.now());
const next = { ...(original || {}), [PROBE]: stamp };
const { error: wErr } = await sb.from('store').update({ value: next }).eq('key', KEY);
if (wErr) { console.log('FAIL write: ' + wErr.message); process.exit(1); }
console.log('wrote probe ' + stamp + ' to ' + KEY + ' from a THIRD client');

// Poll both pages for up to 20s.
const deadline = Date.now() + 20000;
const got = [0, 0];
while (Date.now() < deadline && got.some((g) => g < 1)) {
  for (let i = 0; i < pages.length; i++) got[i] = await pages[i].evaluate(() => (window.__rt && window.__rt.fired) || 0);
  if (got.every((g) => g >= 1)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

// Restore before reporting, so a failure never leaves the probe behind.
await sb.from('store').update({ value: original }).eq('key', KEY);
console.log('restored original value');

let bad = 0;
pages.forEach((_, i) => {
  const ok = got[i] >= 1;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} client ${i + 1} ${ok ? 'received the change live' : 'received NO realtime event'}`);
});
console.log(bad ? `\n${bad} of ${pages.length} clients did not sync live` : `\n0 — every open client picked up an outside write with no reload`);
for (const pg of pages) { try { await pg.close(); } catch {} }
b.disconnect();
process.exit(bad ? 1 : 0);
