// PROVE THE DENSITY PATH, END TO END, AND PUT THE DATA BACK.
//
// Type contact minutes into a real fixture through the real editor, watch the
// percentage appear, then restore the fixtures key from the snapshot taken
// first. The dev server shares the production database, so a trial that writes
// has to clean up after itself.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import P from 'puppeteer-core';
import { setWidth } from '../scripts/lib/viewport.mjs';

const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sb = createClient('https://gtcbfglttoiyfsnfbhdy.supabase.co', 'sb_publishable_i_ifflCFMUF7rX2ABAY3vA_5JKTmFlv', { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: 'ohadyproductions@gmail.com', password: '1234' });
const read = async () => (await sb.from('store').select('value').eq('key', 'expo-bhbc-fixtures').maybeSingle()).data?.value ?? null;

const before = await read();
fs.mkdirSync('audit-out/bhbc-state', { recursive: true });
const snap = `audit-out/bhbc-state/fixtures-before-density-${Date.now()}.json`;
fs.writeFileSync(snap, JSON.stringify(before, null, 2));
console.log(`snapshot: ${snap} (${(before || []).length} fixtures)`);

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ } });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await wait(3500);
await pg.evaluate(() => {
  const ins = [...document.querySelectorAll('input')];
  const e = ins.find((i) => /email/i.test(i.type + i.placeholder + i.name));
  const p = ins.find((i) => i.type === 'password');
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  if (e) set(e, 'ohadyproductions@gmail.com'); if (p) set(p, '1234');
});
await wait(400);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => /^\s*sign\s*in\s*$/i.test(y.textContent || '')); if (x) x.click(); });
await wait(9000);
await setWidth(pg, 1500, 1100);
await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
await wait(14000);
await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
await wait(1000);

// Schedule tab, where the week is planned
const onTab = await pg.evaluate(() => {
  const el = [...document.querySelectorAll('[role="tab"], .bhbc-tab')].find((e) => /^schedule$/i.test((e.textContent || '').trim()));
  if (!el) return false; el.click(); return true;
});
console.log('schedule tab: ' + onTab);
await wait(5000);

// open the editor on an existing session chip
const opened = await pg.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((x) => /add session|\+ session/i.test((x.textContent || '').trim()));
  if (btns.length) { btns[0].click(); return 'add'; }
  return 'none';
});
console.log('editor: ' + opened);
await wait(2500);

// PRACTICE FIRST. The contact field only exists for a session that HAS
// contact in it, so on a lift there is no second number input to type into -
// which is what the first run of this test measured.
await pg.evaluate(() => { const t = [...document.querySelectorAll("button")].find((x) => /^practice$/i.test((x.textContent || "").trim())); if (t) t.click(); });
await wait(1500);
const typed = await pg.evaluate(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const time = document.querySelector('input[type="time"]');
  const nums = [...document.querySelectorAll('input[type="number"]')];
  if (!time || nums.length < 2) return { ok: false, time: !!time, nums: nums.length };
  set(time, '10:00');
  set(nums[0], '84');          // practice minutes
  set(nums[1], '13');          // contact minutes - the new field
  // make it a practice, not the default lift
  const t = [...document.querySelectorAll('button')].find((x) => /^practice$/i.test((x.textContent || '').trim()));
  if (t) t.click();
  return { ok: true, nums: nums.length };
});
console.log('typed: ' + JSON.stringify(typed));
await wait(800);
await pg.evaluate(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const nums = [...document.querySelectorAll('input[type="number"]')];
  if (nums[1]) set(nums[1], '13');
  const save = [...document.querySelectorAll('button')].find((x) => /^(add|save)$/i.test((x.textContent || '').trim()));
  if (save) save.click();
});
await wait(6000);

const shown = await pg.evaluate(() => {
  const t = document.body.innerText || '';
  const m = t.match(/[0-9]+\.[0-9]%[^\n]{0,30}/g) || [];
  return { pct: m.slice(0, 3), hasContact: /contact/i.test(t) };
});
console.log('on screen: ' + JSON.stringify(shown));
await pg.screenshot({ path: 'audit-out/density-live.png' });

const after = await read();
const withContact = (after || []).filter((x) => x && x.contactMin);
console.log(`fixtures with contactMin now: ${withContact.length}  ${JSON.stringify(withContact.slice(0, 2))}`);

// PUT IT BACK. The trial is over the moment it is proven.
const put = await sb.from('store').upsert({ key: 'expo-bhbc-fixtures', value: before }, { onConflict: 'key' });
console.log('restored: ' + (put.error ? 'FAILED ' + put.error.message : 'yes'));
const back = await read();
console.log(`fixtures after restore: ${(back || []).length}  with contactMin: ${(back || []).filter((x) => x && x.contactMin).length}`);
await pg.close();
b.disconnect();
