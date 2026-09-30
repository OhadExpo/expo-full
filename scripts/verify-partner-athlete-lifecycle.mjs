// verify-partner-athlete-lifecycle.mjs - Elad adds, edits, archives and DELETES an
// athlete in his sandbox, through the real screens (#478).
//
// Each step is checked in the database as the owner: the change is in his copy
// (sbx_store / sbx_ purge) and the real roster never moved. The permanent delete
// ticks "erase history" so it runs the purge RPC - which supabase.js maps to the
// sandbox purge. Leaves the sandbox as it found it (the probe athlete is gone
// at the end); sbx_reset() re-makes the copy before handover anyway.
//
//   CDP=http://[::1]:9444 BASE=http://127.0.0.1:5270 node scripts/verify-partner-athlete-lifecycle.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

process.env.EXPO_EMAIL = 'eladeluz24@gmail.com';
const { signIn, assertAuthed } = await import('./lib/authed-page.mjs');
const BASE = process.env.BASE || 'http://127.0.0.1:5270';
const src = fs.readFileSync('src/supabase.js', 'utf8');
const db = createClient(src.match(/SUPA_URL = '([^']+)'/)[1], src.match(/SUPA_PUBLISHABLE_KEY = '([^']+)'/)[1], { auth: { persistSession: false } });
const NAME = 'Sandbox Probe ' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, w) => { if (c) { pass++; console.log('  ✓ ' + w); } else { fail++; console.log('  ✗ ' + w); } };
const roster = async (table) => { const { data } = await db.from(table).select('value').eq('key', 'expo-trainees'); return (data && data[0] && data[0].value) || []; };
const find = async (table) => (await roster(table)).find((t) => t && t.name && String(t.name).startsWith(NAME.slice(0, 20)));

const b = await P.connect({ browserURL: process.env.CDP || 'http://[::1]:9444', defaultViewport: null, protocolTimeout: 300000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
await pg.setViewport({ width: 1366, height: 900 });
const toasts = [];
pg.on('console', (m) => { const t = m.text(); if (/blocked|RLS|42501|permission denied/i.test(t)) toasts.push(t.slice(0, 120)); });
// click the smallest visible element whose text matches
const click = (re) => pg.evaluate((src) => {
  const r = new RegExp(src, 'i');
  const els = [...document.querySelectorAll('button, [role="button"], a, label')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && r.test((e.innerText || e.textContent || '').trim()); });
  els.sort((a, b2) => (a.innerText || '').length - (b2.innerText || '').length);
  if (!els[0]) return false; els[0].click(); return (els[0].innerText || '').trim().slice(0, 30);
}, re.source);
const saveErr = () => pg.evaluate(() => /SAVE FAILED|not saved|failed|נכשל/i.test(document.body.innerText));
try {
  const { error: oe } = await db.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
  if (oe) throw new Error('owner seat: ' + oe.message);
  const realBefore = JSON.stringify(await roster('store'));
  await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); localStorage.setItem('expo-lang', 'en'); } catch (e) {} });
  let authed = false; for (let k = 0; k < 3 && !authed; k++) { await signIn(pg, BASE); authed = await assertAuthed(pg, BASE); }
  if (!authed) throw new Error('could not sign in as the partner');
  ok(await pg.evaluate(() => window.__expoSandbox === true), 'the seat is the sandbox');

  console.log('1. ADD an athlete');
  await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' });
  for (let k = 0; k < 30; k++) { await wait(700); if (await pg.$('[data-add-athlete] button')) break; }
  await pg.click('[data-add-athlete] button'); await wait(600);
  ok(!!(await click(/^Online Athlete$/)), 'the add menu offers Online Athlete');
  await wait(1200);
  const nameInput = await pg.evaluateHandle(() => { const d = [...document.querySelectorAll('[role="dialog"], .modal, body')].reverse().find((x) => /New Athlete/i.test(x.innerText || '')) || document.body; return d.querySelector('input[type="text"], input:not([type])'); });
  const ni = nameInput.asElement();
  ok(!!ni, 'the New Athlete form is open');
  if (ni) { await ni.click({ clickCount: 3 }); await ni.type(NAME); }
  await wait(300);
  ok(!!(await click(/^Create$/)), 'Create pressed');
  let mine = null; for (let k = 0; k < 20 && !mine; k++) { await wait(1000); mine = await find('sbx_store'); }
  ok(!!mine, `the athlete is in HIS roster (${mine ? mine.id : 'missing'})`);
  ok(!(await find('store')), 'your real roster does not have it');
  ok(!(await saveErr()), 'no save error on screen');

  console.log('2. EDIT it');
  if (mine) {
    await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' }); await wait(5000);
    const opened = await pg.evaluate((n) => { const card = [...document.querySelectorAll('.tv-cards-grid > *')].find((c) => (c.innerText || '').toLowerCase().includes(n.toLowerCase())); if (!card) return false; const e = [...card.querySelectorAll('button')].find((x) => /edit/i.test(x.innerText || x.title || '')); if (!e) return 'no edit'; e.click(); return true; }, NAME);
    ok(opened === true, 'its card has an Edit button' + (opened !== true ? ` (${opened})` : ''));
    await wait(1200);
    const notes = await pg.$('textarea');
    if (notes) { await notes.click(); await notes.type(' edited-by-elad'); }
    ok(!!(await click(/^Update$/)), 'Update pressed');
    let edited = false; for (let k = 0; k < 20 && !edited; k++) { await wait(1000); const t = await find('sbx_store'); edited = !!(t && JSON.stringify(t).includes('edited-by-elad')); }
    ok(edited, 'the edit is in HIS roster');

    console.log('3. ARCHIVE it');
    await pg.evaluate((n) => { const card = [...document.querySelectorAll('.tv-cards-grid > *')].find((c) => (c.innerText || '').toLowerCase().includes(n.toLowerCase())); const e = card && [...card.querySelectorAll('button')].find((x) => /edit/i.test(x.innerText || x.title || '')); if (e) e.click(); }, NAME);
    await wait(1200);
    ok(!!(await click(/Archive Athlete/)), 'Archive Athlete pressed');
    await wait(800);
    const conf = await pg.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].find((x) => /Archive This Athlete/i.test(x.innerText || '')); const btn = d && [...d.querySelectorAll('button')].find((x) => /^(archive|confirm|yes|ok)/i.test((x.innerText || '').trim())); if (!btn) return d ? 'dialog, no button: ' + [...d.querySelectorAll('button')].map((x) => x.innerText.trim()).join('|') : 'no dialog'; btn.click(); return true; });
    ok(conf === true, 'archive confirmed in its dialog' + (conf !== true ? ` (${conf})` : ''));
    let archived = false; for (let k = 0; k < 20 && !archived; k++) { await wait(1000); const t = await find('sbx_store'); archived = !!(t && t.status === 'Archived'); }
    ok(archived, 'archived in HIS roster');

    console.log('4. DELETE it permanently, history erased');
    await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' }); await wait(5000);
    const toggled = await click(/^(Show )?Archived|ARCHIVE \(|ARCHIVED/);
    ok(!!toggled, 'the archived list opens (' + toggled + ')');
    await wait(1500);
    const del = await pg.evaluate((n) => { const card = [...document.querySelectorAll('.tv-cards-grid > *, [data-archived-row], div')].filter((c) => (c.innerText || '').toLowerCase().includes(n.toLowerCase()) && c.querySelector('button')).sort((a, b2) => a.innerText.length - b2.innerText.length)[0]; const d = card && [...card.querySelectorAll('button')].find((x) => /Permanent/i.test(x.innerText || '')); if (!d) return false; d.click(); return true; }, NAME);
    ok(del, 'Delete Permanently pressed');
    await wait(1000);
    await pg.evaluate(() => { const box = document.querySelector('[role="dialog"] input[type="checkbox"]'); if (box && !box.checked) box.click(); });
    const typed = await pg.$('[role="dialog"] input:not([type="checkbox"])');
    if (typed) await typed.type('DELETE');
    await wait(300);
    ok(!!(await click(/Delete \+ Erase History|Delete Permanently/)), 'the final delete pressed');
    let gone = false; for (let k = 0; k < 20 && !gone; k++) { await wait(1000); gone = !(await find('sbx_store')); }
    ok(gone, 'gone from HIS roster');
    ok(!(await pg.evaluate(() => /purge failed|nothing was deleted/i.test(document.body.innerText))), 'the history erase ran (no "purge failed")');
  }
  ok(JSON.stringify(await roster('store')) === realBefore, 'your real roster is byte-for-byte what it was');
  ok(!toasts.length, 'no refused/blocked write in the console' + (toasts.length ? ': ' + toasts[0] : ''));
} catch (e) { fail++; console.log('FAIL: ' + e.message); }
finally { await ctx.close(); b.disconnect(); await db.auth.signOut({ scope: 'local' }); }
console.log(`\nPARTNER ATHLETE LIFECYCLE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
