// verify-store-cas.mjs - two devices, one stale, no edit lost (2.10 #510-B1).
//
// Runs the app's REAL write path (storeWriteMerged in src/useSupaStore.js, the
// real supabase client with its seat/sandbox wrapper) in two browser pages - two
// "devices" - signed in as the owner, on a throwaway store key. Both start from
// the same base; A saves its edit; B, still holding the old base, saves a
// different edit. Before #510-B1, B's whole-value write erased A's. Now B's
// write is refused by compare-and-swap, merged, and both edits must be on the
// server. Also: a delete on B of a row A did not touch must stand.
// The key is deleted afterwards. Needs the dev server (BASE, default :5311).
//
//   BASE=http://127.0.0.1:5311 node scripts/verify-store-cas.mjs
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5311';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const KEY = '__cas_gate_510__';
const j = await (await fetch(`${CDP}/json/version`)).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, defaultViewport: null, protocolTimeout: 90000 });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, JSON.stringify(got)); } };
const A = await browser.newPage();
const B = await browser.newPage();
try {
  await signIn(A, BASE);
  if (!(await assertAuthed(A, BASE, '/coach/dashboard'))) throw new Error('not signed in');
  await B.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2500));
  const run = (page, fn, arg) => page.evaluate(fn, arg);
  const mod = '/src/useSupaStore.js';
  const sbMod = '/src/supabase.js';
  // seed: [a, b, c]
  const seed = await run(A, async ({ KEY, sbMod }) => {
    const { supabase } = await import(sbMod);
    await supabase.from('store').delete().eq('key', KEY);
    const v = [{ id: 'a', n: 1 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }];
    const { data, error } = await supabase.from('store').insert({ key: KEY, value: v, updated_at: new Date().toISOString() }).select('updated_at');
    return { at: data && data[0] && data[0].updated_at, err: error && error.message, v };
  }, { KEY, sbMod });
  ok('seed row written', !!seed.at && !seed.err, seed);
  // A: edit a (n:2) on the fresh base
  const ra = await run(A, async ({ KEY, mod, seed }) => {
    const { storeWriteMerged } = await import(mod);
    const mine = seed.v.map((x) => (x.id === 'a' ? { ...x, n: 2 } : x));
    try { return await storeWriteMerged(KEY, mine, seed.at, seed.v); } catch (e) { return { err: e.message }; }
  }, { KEY, mod, seed });
  ok('device A saved', !ra.err, ra);
  // B: STALE base - adds d and deletes c, never saw A's edit
  const rb = await run(B, async ({ KEY, mod, seed }) => {
    const { storeWriteMerged } = await import(mod);
    const mine = [...seed.v.filter((x) => x.id !== 'c'), { id: 'd', n: 1 }];
    try { return await storeWriteMerged(KEY, mine, seed.at, seed.v); } catch (e) { return { err: e.message }; }
  }, { KEY, mod, seed });
  ok('device B (stale) saved without error', !rb.err, rb);
  const fin = await run(A, async ({ KEY, sbMod }) => {
    const { supabase } = await import(sbMod);
    const { data } = await supabase.from('store').select('value').eq('key', KEY).maybeSingle();
    return data && data.value;
  }, { KEY, sbMod });
  const by = Object.fromEntries((fin || []).map((x) => [x.id, x]));
  ok("A's edit survived B's stale write (a.n === 2)", by.a && by.a.n === 2, fin);
  ok("B's new row is there (d)", !!by.d, fin);
  ok("B's delete of an untouched row stands (no c)", !by.c, fin);
  ok('nothing duplicated', (fin || []).length === 3, fin);
  // A ROW WITH updated_at NULL (nullable column; review of #510): a write from a
  // device that does not know the version must land, not read as a refusal
  const nul = await run(A, async ({ KEY, mod, sbMod }) => {
    const { supabase } = await import(sbMod);
    const { storeWriteMerged } = await import(mod);
    await supabase.from('store').delete().eq('key', KEY);
    const ins = await supabase.from('store').insert({ key: KEY, value: [{ id: 'n', n: 1 }], updated_at: null });
    if (ins.error) return { skip: ins.error.message };
    try { const r = await storeWriteMerged(KEY, [{ id: 'n', n: 2 }], undefined, undefined); return { ok: true, val: r.val }; } catch (e) { return { err: e.message }; }
  }, { KEY, mod, sbMod });
  if (nul.skip) console.log('   (null updated_at not insertable here:', nul.skip, ')');
  else ok('a row with NULL updated_at is written, not refused', nul.ok && nul.val && nul.val[0].n === 2, nul);
  // B's stale RLS-refusal path is not exercised here (owner may write); the
  // CAS refusal semantics are measured by audit-out/_cas-probe.mjs.
} finally {
  try { await A.evaluate(async ({ KEY }) => { const { supabase } = await import('/src/supabase.js'); await supabase.from('store').delete().eq('key', KEY); }, { KEY }); } catch { /* cleanup best effort */ }
  await A.close().catch(() => {}); await B.close().catch(() => {});
  browser.disconnect();
}
console.log(`STORE CAS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
