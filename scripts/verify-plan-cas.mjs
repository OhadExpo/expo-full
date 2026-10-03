// verify-plan-cas.mjs - two editors on one plan, neither erases the other
// (2.10 #510-B7). The app's real savePlan (src/usePlansStore.js) in two browser
// pages signed in as the owner, on a throwaway plan with no athlete (invisible
// to every portal). Deleted afterwards. Needs the dev server (BASE, :5311).
//
//   A creates it, then saves TWICE in a row      -> both true (never conflicts with itself)
//   B saves the version it loaded before A did   -> false, A's edit still on the server
//   B, having reloaded, saves                    -> true
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5311';
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
const ID = 'pl___cas_gate_510__';
const j = await (await fetch(`${CDP}/json/version`)).json();
const browser = await puppeteer.connect({ browserWSEndpoint: j.webSocketDebuggerUrl, defaultViewport: null, protocolTimeout: 90000 });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, JSON.stringify(got)); } };
const A = await browser.newPage();
const B = await browser.newPage();
const plan = (name, updatedAt) => ({ id: ID, name, traineeId: '', phase: '', notes: '', active: false, createdAt: '2026-10-02T00:00:00Z', days: [{ id: 'd1', name: 'Day A', exercises: [{ eid: 'x', s: 3, r: '5' }] }], warmup: [], weeks: 4, ...(updatedAt ? { updatedAt } : {}) });
const call = (page, fn, arg) => page.evaluate(fn, arg);
try {
  await signIn(A, BASE);
  if (!(await assertAuthed(A, BASE, '/coach/dashboard'))) throw new Error('not signed in');
  await B.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2500));
  await call(A, async ({ ID }) => { const { supabase } = await import('/src/supabase.js'); await supabase.from('plans').delete().eq('id', ID); }, { ID });
  const created = await call(A, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v0') });
  ok('A creates the plan', created === true, created);
  const loadedAt = await call(B, async ({ ID }) => { const { supabase } = await import('/src/supabase.js'); const { data } = await supabase.from('plans').select('updated_at').eq('id', ID).single(); return data.updated_at; }, { ID });
  const a1 = await call(A, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v1-by-A', loadedAt) });
  const a2 = await call(A, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v2-by-A', loadedAt) });
  ok('A saves an edit', a1 === true, a1);
  ok('A saves again from the same editor - no self-conflict', a2 === true, a2);
  const b = await call(B, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('STALE-by-B', loadedAt) });
  ok("B's stale save is refused", b === false, b);
  const name = await call(A, async ({ ID }) => { const { supabase } = await import('/src/supabase.js'); const { data } = await supabase.from('plans').select('name, updated_at').eq('id', ID).single(); return data; }, { ID });
  ok("A's edit is still on the server", name && name.name === 'v2-by-A', name);
  const b2 = await call(B, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v3-by-B-after-reload', name.updated_at) });
  ok('B, reloaded, saves', b2 === true, b2);
  // THE CASE THE FIRST VERSION GOT WRONG (review of #510, HIGH): A saved earlier
  // in this tab, B has saved since, A presses Reload in the editor and saves -
  // A's remembered old version must not beat the one it just reloaded
  const fresh = await call(A, async ({ ID }) => { const { supabase } = await import('/src/supabase.js'); const { data } = await supabase.from('plans').select('updated_at').eq('id', ID).single(); return data.updated_at; }, { ID });
  const a3 = await call(A, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v4-by-A-after-reload', fresh) });
  ok('A, after reloading what B saved, saves (its old map entry does not win)', a3 === true, a3);
  const a4 = await call(A, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v5-by-A', fresh) });
  ok('...and keeps saving from that editor', a4 === true, a4);
  // THE EDITOR'S OWN LOADER (4.10 #524 audit, HIGH): every case above hands savePlan
  // a version by hand. The editor builds its plan with planFromRow - which had no
  // updatedAt, so its first save was a blind overwrite. C opens the plan exactly as
  // the editor does, A saves on top, C's stale save must be refused.
  const C = await browser.newPage();
  try {
    await C.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    const opened = await call(C, async ({ ID }) => { const { supabase } = await import('/src/supabase.js'); const { planFromRow } = await import('/src/usePlansStore.js'); const { data } = await supabase.from('plans').select('*').eq('id', ID).single(); return planFromRow(data); }, { ID });
    ok("the editor's loader carries the version it opened", !!(opened && opened.updatedAt), opened && opened.updatedAt);
    const a5 = await call(A, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan(p); }, { p: plan('v6-by-A', fresh) });
    ok('A saves after C opened it', a5 === true, a5);
    const c1 = await call(C, async ({ p }) => { const { savePlan } = await import('/src/usePlansStore.js'); return savePlan({ ...p, name: 'STALE-by-C' }); }, { p: opened });
    ok("C's save from the loader-built plan is refused (not a blind overwrite)", c1 === false, c1);
  } finally { await C.close().catch(() => {}); }
} finally {
  try { await A.evaluate(async ({ ID }) => { const { supabase } = await import('/src/supabase.js'); await supabase.from('plans').delete().eq('id', ID); }, { ID }); } catch { /* best effort */ }
  await A.close().catch(() => {}); await B.close().catch(() => {});
  browser.disconnect();
}
console.log(`PLAN CAS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
