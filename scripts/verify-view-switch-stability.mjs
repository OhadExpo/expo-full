// Switching a view TAB must not change the page height.
//
// Ohad 2026-09-02: "month/week/list are differnt vetrical sizes and the website
// jumps and glitches from switching them". Measured at 1500 before the fix:
// 2125 / 1752 / 2181, a 429px swing, so everything below the card moved and a
// scrolled reader was thrown on every switch.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const TOL = 1;
const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [1500, 1280, 900, 700, 620, 470, 390, 360];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
const click = (label) => pg.evaluate((l) => {
  const t = [...document.querySelectorAll('button')].find((e) => new RegExp('^' + l + '$', 'i').test((e.textContent || '').trim()));
  if (!t) return false; t.click(); return true;
}, label);
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1000);
  await pg.goto('http://127.0.0.1:5199/coach/bhbc', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 12000));
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  if (!(await click('Schedule'))) { console.log(`${W}: no Schedule tab`); bad++; continue; }
  await new Promise((r) => setTimeout(r, 2500));
  const h = {};
  for (const v of ['Month', 'Week', 'List']) {
    if (!(await click(v))) { h[v] = null; continue; }
    await new Promise((r) => setTimeout(r, 900));
    h[v] = await pg.evaluate(() => document.documentElement.scrollHeight);
  }
  const vals = Object.values(h).filter((v) => v != null);
  const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : -1;
  const ok = vals.length === 3 && spread <= TOL;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${W}px  month=${h.Month} week=${h.Week} list=${h.List}  spread=${spread}px`);
}
console.log(bad ? `\n${bad} width(s) where switching the schedule view moves the page` : '\n0 widths — the schedule view switch never moves the page');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
