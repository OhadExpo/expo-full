// verify-partner-realtime.mjs - live updates in Elad's sandbox, and to nobody else (1.10, audit F6).
//
// The sbx_ copies of store / coach_notes / coach_messages / bit_payment_requests are in the
// realtime publication, and supabase.js points his postgres_changes subscriptions at them.
//
// 1. THE APP ITSELF (audit C M4: the first version subscribed to 'sbx_store' by hand, so the
//    supabase.js wrapper it was written for never ran). His real seat, in the built app
//    (BASE): every channel JOIN the page sends over the websocket is read off the wire -
//    every postgres_changes table must be an sbx_ copy, every public live channel (plans-live,
//    bhbc-live) must carry the sbx: name.
// 2. THE DATABASE, with listeners that COULD hear a leak (audit C M4: "nothing on the real
//    table" listened as Elad, who may not read that key anyway):
//    - HE subscribes to sbx_store, writes a probe row -> the change arrives;
//    - the OWNER listens on sbx_store too (positive control: his listener works) and on the
//      REAL store (he reads every key) -> he hears the sandbox write only on sbx_store;
//    - an ATHLETE subscribed (SUBSCRIBED, not an error) to sbx_store hears nothing (RLS).
// The probe row is removed. Local sign-out.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5277 node scripts/verify-partner-realtime.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE || 'http://127.0.0.1:5277';
const src = fs.readFileSync('src/supabase.js', 'utf8');
const mk = () => createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
const SBX_TABLES = new Set([...src.match(/const SBX_TABLES = new Set\(\[([^\]]+)\]/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
let pass = 0, fail = 0;
const ok = (c, w) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + w); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('1. his seat in the built app: what the page joins, read off the websocket');
{
  const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
  const ctx = await b.createBrowserContext();
  try {
    const pg = await ctx.newPage(); await pg.setViewport({ width: 1366, height: 900 });
    await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); } catch (e) {} });
    const cdp = await pg.createCDPSession(); await cdp.send('Network.enable');
    const joins = [];
    cdp.on('Network.webSocketFrameSent', ({ response }) => {
      const t = response && response.payloadData; if (!t || !t.includes('phx_join')) return;
      try { const j = JSON.parse(t); const topic = Array.isArray(j) ? j[2] : j.topic; const payload = Array.isArray(j) ? j[4] : j.payload; joins.push({ topic, pc: (payload && payload.config && payload.config.postgres_changes) || [] }); } catch { /* not JSON */ }
    });
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await wait(3000);
    await pg.evaluate(() => {
      const ins = [...document.querySelectorAll('input')];
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(ins.find((i) => /email/i.test(i.type + i.placeholder + i.name)), 'eladeluz24@gmail.com'); set(ins.find((i) => i.type === 'password'), '1234');
    });
    await wait(300);
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*(sign\s*in|כניסה)\s*$/i.test(y.textContent || '')); if (x) x.click(); });
    await wait(8000);
    for (const r of ['/coach/dashboard', '/coach/programs', '/coach/billing', '/coach/tasks', '/coach/bhbc']) { await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' }); await wait(7000); }
    ok(await pg.evaluate(() => window.__expoSandbox === true), 'the page is his sandbox seat');
    const tables = joins.flatMap((j) => j.pc.map((c) => c.table)).filter(Boolean);
    const realOnes = tables.filter((t) => !t.startsWith('sbx_') && SBX_TABLES.has(t));
    ok(tables.length > 0 && realOnes.length === 0, `${joins.length} channel joins, ${tables.length} live table subscriptions: ${[...new Set(tables)].join(', ') || 'none'}${realOnes.length ? ' - REAL: ' + [...new Set(realOnes)].join(', ') : ''}`);
    const pub = joins.map((j) => j.topic).filter((t) => /(plans|bhbc)-live/.test(t || ''));
    ok(pub.length > 0 && pub.every((t) => /sbx:/.test(t)), `public live channels carry the sandbox name: ${[...new Set(pub)].join(', ') || 'NONE JOINED'}`);
  } catch (e) { fail++; console.log('FAIL (browser): ' + e.message); }
  finally { await ctx.close(); b.disconnect(); }
}

console.log('2. the database: he hears his change; the owner hears it only on the sandbox table; an athlete hears nothing');
const KEY = 'expo-partner-rt-probe';
const seat = async (email) => { const c = mk(); const { error } = await c.auth.signInWithPassword({ email, password: '1234' }); if (error) throw new Error(email + ': ' + error.message); return c; };
const e = await seat('eladeluz24@gmail.com'), d = await seat('diego@diegoday.com'), o = await seat('ohadyproductions@gmail.com');
const heard = { elad: 0, athlete: 0, ownerSbx: 0, ownerReal: 0 };
const sub = (c, name, table, who) => new Promise((res) => {
  const ch = c.channel(name).on('postgres_changes', { event: '*', schema: 'public', table, filter: `key=eq.${KEY}` }, () => { heard[who]++; })
    .subscribe((st) => { if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') res({ ch, st }); });
});
try {
  const subs = [await sub(e, 'rt-e', 'sbx_store', 'elad'), await sub(d, 'rt-d', 'sbx_store', 'athlete'), await sub(o, 'rt-os', 'sbx_store', 'ownerSbx'), await sub(o, 'rt-or', 'store', 'ownerReal')];
  ok(subs.every((s) => s.st === 'SUBSCRIBED'), `all four listeners subscribed (${subs.map((s) => s.st).join(', ')})`);
  await wait(1500);
  const { error: we } = await e.from('sbx_store').upsert({ key: KEY, value: { t: Date.now() } });
  ok(!we, 'he writes a probe into his copy' + (we ? ' - ' + we.message : ''));
  for (let k = 0; k < 20 && !(heard.elad && heard.ownerSbx); k++) await wait(500);
  await wait(2500);
  ok(heard.elad > 0, `the change reaches him live (${heard.elad} event(s))`);
  ok(heard.ownerSbx > 0, `positive control: the owner's listener on the sandbox table hears it (${heard.ownerSbx})`);
  ok(heard.ownerReal === 0, `the owner, who reads every store key, hears NOTHING on the real table (${heard.ownerReal})`);
  ok(subs[1].st === 'SUBSCRIBED' && heard.athlete === 0, `a subscribed athlete hears nothing on the sandbox table (${heard.athlete})`);
  for (const x of subs) try { await x.ch.unsubscribe(); } catch { /* noop */ }
} catch (x) { fail++; console.log('FAIL: ' + x.message); }
finally {
  try { await e.from('sbx_store').delete().eq('key', KEY); } catch { /* noop */ }
  for (const c of [e, d, o]) { try { c.removeAllChannels(); } catch { /* noop */ } await c.auth.signOut({ scope: 'local' }); }
}
console.log(`PARTNER REALTIME: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
