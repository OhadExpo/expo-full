// verify-partner-sandbox-actions.mjs - Elad PRESSES things; nothing real moves (#476).
//
// As the partner, in a throwaway headless context:
//   1. the dashboard's WhatsApp button opens NO window (it would message a real
//      athlete) and says why;
//   2. a task typed into /coach/tasks is saved - into HIS copy (sbx_coach_notes),
//      and the real coach_notes never sees it. The probe row is then removed.
// The row check reads the database as the owner (supabase-js, local sign-out).
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5268 node scripts/verify-partner-sandbox-actions.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE || 'http://127.0.0.1:5268';
process.env.EXPO_EMAIL = 'eladeluz24@gmail.com';
const { signIn, assertAuthed } = await import('./lib/authed-page.mjs');
const src = fs.readFileSync('src/supabase.js', 'utf8');
const db = createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
const PROBE = 'SANDBOX PROBE ' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, w) => { if (c) { pass++; console.log('  ✓ ' + w); } else { fail++; console.log('  ✗ ' + w); } };

const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.setViewport({ width: 1366, height: 900 });
let popups = 0;
ctx.on('targetcreated', (t) => { if (t.type() === 'page') popups++; });
try {
  const { error: oe } = await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (oe) throw new Error('owner check seat: ' + oe.message);
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
  let authed = false; for (let k = 0; k < 3 && !authed; k++) { await signIn(pg, BASE); authed = await assertAuthed(pg, BASE); }
  if (!authed) throw new Error('could not sign in as the partner');
  ok(await pg.evaluate(() => window.__expoSandbox === true), 'the seat is the sandbox');

  console.log('1. WhatsApp from the sandbox reaches nobody');
  await pg.goto(BASE + '/coach/dashboard', { waitUntil: 'domcontentloaded' });
  for (let k = 0; k < 30; k++) { await wait(700); if (await pg.evaluate(() => !!document.querySelector('button[title*="WhatsApp"], button[title*="וואטסאפ"]'))) break; }
  const before = popups;
  const clicked = await pg.evaluate(() => { const x = document.querySelector('button[title*="WhatsApp"], button[title*="וואטסאפ"]'); if (x) { x.click(); return true; } return false; });
  await wait(1500);
  ok(clicked, 'a WhatsApp button was found and pressed');
  ok(popups === before, `no window opened (${popups - before} new)`);
  ok(await pg.evaluate(() => /SANDBOX · this would contact|סביבת ניסוי · זה היה פונה/.test(document.body.innerText)), 'it says why');

  console.log('2. a task he adds lands in HIS copy only');
  await pg.goto(BASE + '/coach/tasks', { waitUntil: 'domcontentloaded' });
  let input = null;
  for (let k = 0; k < 30 && !input; k++) { await wait(700); input = await pg.$('input[data-hotkey="add"]'); }
  ok(!!input, 'the add-task field is there');
  if (input) {
    await input.click(); await input.type(PROBE); await pg.keyboard.press('Enter');
    let mine = [], real = [];
    for (let k = 0; k < 20; k++) {
      await wait(1000);
      [{ data: mine }, { data: real }] = await Promise.all([
        db.from('sbx_coach_notes').select('id').ilike('body', `%${PROBE}%`),
        db.from('coach_notes').select('id').ilike('body', `%${PROBE}%`)]);
      if ((mine || []).length) break;
    }
    ok((mine || []).length === 1, `saved in his copy (sbx_coach_notes: ${(mine || []).length})`);
    ok((real || []).length === 0, `the real coach_notes never saw it (${(real || []).length})`);
    if ((mine || []).length) await db.from('sbx_coach_notes').delete().ilike('body', `%${PROBE}%`);
  }
} catch (e) { fail++; console.log('FAIL: ' + e.message); }
finally { await ctx.close(); b.disconnect(); await db.auth.signOut({ scope: 'local' }); }
console.log(`\nPARTNER SANDBOX ACTIONS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
