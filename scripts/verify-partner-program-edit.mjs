// verify-partner-program-edit.mjs - Elad edits a PROGRAM; it saves into his copy only (#478).
//
// As the partner: open the most recent program's editor, change the first editable
// number field (sets/reps/load), leave the field so it saves, and read the
// database as the owner - sbx_plans.updated_at moved, plans (real) did not.
// Every write request the page sends is recorded: each must target sbx_.
// The sandbox is re-made by sbx_reset() before handover, so the change goes away.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5271 node scripts/verify-partner-program-edit.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.env.EXPO_EMAIL = 'eladeluz24@gmail.com';
const { signIn, assertAuthed } = await import('./lib/authed-page.mjs');
const BASE = process.env.BASE || 'http://127.0.0.1:5271';
const src = fs.readFileSync('src/supabase.js', 'utf8');
const db = createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, w) => { if (c) { pass++; console.log('  ✓ ' + w); } else { fail++; console.log('  ✗ ' + w); } };
const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.setViewport({ width: 1366, height: 900 });
const writes = [];
let probePlan = null, probeBefore = null;
pg.on('request', (rq) => { if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(rq.method())) { const m = rq.url().match(/\/rest\/v1\/(rpc\/)?([a-z_0-9]+)/); if (m) writes.push(rq.method() + ' ' + (m[1] ? 'rpc:' : '') + m[2]); } });
try {
  await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  // the newest plan IN HIS COPY (4.10): the owner's newest real plan is, by design,
  // not in the sandbox once it was made after the copy - the gate opened a plan his
  // seat cannot see and failed on "no editable number"
  const { data: pl } = await db.from('sbx_plans').select('id,name,updated_at').order('updated_at', { ascending: false }).limit(1);
  const plan = pl && pl[0];
  probePlan = plan;
  if (!plan) throw new Error('no plan to edit');
  const { data: realBefore } = await db.from('plans').select('updated_at,data').eq('id', plan.id);
  const { data: sbxBefore } = await db.from('sbx_plans').select('updated_at,data').eq('id', plan.id);
  probeBefore = sbxBefore && sbxBefore[0];
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); } catch (e) {} });
  let authed = false; for (let k = 0; k < 3 && !authed; k++) { await signIn(pg, BASE); authed = await assertAuthed(pg, BASE); }
  if (!authed) throw new Error('could not sign in as the partner');
  ok(await pg.evaluate(() => window.__expoSandbox === true), 'the seat is the sandbox');
  await pg.goto(BASE + '/coach/programs/' + plan.id, { waitUntil: 'domcontentloaded' });
  let field = null;
  for (let k = 0; k < 30 && !field; k++) { await wait(700); field = await pg.$('input[type="number"]:not([disabled]), input[inputmode="numeric"]:not([disabled]), input[inputmode="decimal"]:not([disabled])'); }
  ok(!!field, `the editor of "${plan.name}" has an editable number`);
  if (field) {
    const before = await field.evaluate((e) => e.value);
    await field.click({ clickCount: 3 });
    const next = String((Number(before) || 0) + 1);
    await field.type(next);
    await pg.keyboard.press('Tab');
    let moved = false;
    for (let k = 0; k < 25 && !moved; k++) { await wait(1000); const { data } = await db.from('sbx_plans').select('updated_at,data').eq('id', plan.id); moved = !!(data && data[0] && JSON.stringify(data[0].data) !== JSON.stringify(sbxBefore[0].data)); }
    ok(moved, `his copy of the program saved the edit (${before} -> ${next})`);
    const { data: realAfter } = await db.from('plans').select('updated_at,data').eq('id', plan.id);
    ok(JSON.stringify(realAfter) === JSON.stringify(realBefore), 'your real program is unchanged');
  }
  const raw = writes.filter((w) => !/ (rpc:)?sbx_/.test(w));
  ok(writes.length > 0 && raw.length === 0, `every write went to his copy (${writes.length} writes${raw.length ? '; NOT sandboxed: ' + raw.join(', ') : ''})`);
  ok(!(await pg.evaluate(() => /SAVE FAILED|השמירה נכשלה/i.test(document.body.innerText))), 'no save error on screen');
} catch (e) { fail++; console.log('FAIL: ' + e.message); }
finally {
  // put HIS program back as it was BEFORE the probe (4.10 #542: the sandbox is his
  // to fill - copying the owner's real plan over it erased his own edits). Stamped
  // now, so an editor he has open reloads it instead of writing over it.
  try {
    if (probePlan && probeBefore) await db.from('sbx_plans').update({ data: probeBefore.data, updated_at: new Date().toISOString() }).eq('id', probePlan.id);
  } catch { /* reported by the next run's walk */ }
  await ctx.close(); b.disconnect(); await db.auth.signOut({ scope: 'local' });
}
console.log(`\nPARTNER PROGRAM EDIT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
