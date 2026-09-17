// Open the editor's CHANGE EXERCISE drawer and report every element inside it
// that sticks out of the drawer box (left or right), plus whether the page
// became horizontally scrollable — "should not be scrollable left and right".
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 node audit-out/probe-drawer-overflow.mjs [base] [width]
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const W = Number(process.argv[3] || 1920);
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await pg.setViewport({ width: W, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate(() => { try { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
await pg.goto(BASE + '/coach/programs?lang=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
await wait(2000);
const clickText = async (re, sel = 'div,span,button') => {
  const hit = await pg.evaluate((r, s) => { const rx = new RegExp(r); const el = [...document.querySelectorAll(s)].filter((e) => rx.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 700).sort((x, y) => x.textContent.length - y.textContent.length)[0]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: el.textContent.trim().slice(0, 30) }; }, re, sel);
  if (!hit) return null; await pg.mouse.click(hit.x, hit.y); await wait(2500); return hit.t;
};
console.log('block:', await clickText('^Block #\\d+'));
// Expand the first exercise row (the ▾ row), then click the ExPicker trigger:
// a full-width baseInput-styled button carrying the exercise title.
const row = await pg.evaluate(() => { const el = [...document.querySelectorAll('div')].find((e) => /▾/.test((e.textContent || '').trim().slice(0, 2)) && e.getBoundingClientRect().width > 300 && e.getBoundingClientRect().width < 700 && e.getBoundingClientRect().top > 380 && e.textContent.length < 80); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: el.textContent.trim().slice(0, 40) }; });
if (!row) throw new Error('no exercise row');
await pg.mouse.click(row.x, row.y); await wait(2000);
const opened = await pg.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => { const b = e.getBoundingClientRect(); return b.width > 300 && b.height >= 30 && b.height <= 40 && !/▾|▼/.test(e.textContent) && /[A-Za-z]/.test(e.textContent) && e.textContent.length < 60 && b.top > 380; }); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: el.textContent.trim().slice(0, 40) }; });
if (!opened) throw new Error('no picker trigger');
await pg.mouse.click(opened.x, opened.y); await wait(3000);
console.log('exercise:', opened.t);
// Type into the drawer search so the results list is populated.
await pg.keyboard.type('bb back squat', { delay: 20 }); await wait(2500);
const rep = await pg.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]'); if (!dlg) return { error: 'no drawer' };
  const panel = dlg.firstElementChild?.tagName === 'STYLE' ? dlg.children[1] : dlg.firstElementChild;
  const box = panel.getBoundingClientRect();
  const out = [];
  for (const el of panel.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); if (r.width === 0) continue;
    if (r.left < box.left - 1 || r.right > box.right + 1) out.push({ tag: el.tagName, cls: el.className && String(el.className).slice(0, 30), l: +(r.left - box.left).toFixed(1), rgt: +(r.right - box.right).toFixed(1), w: +r.width.toFixed(0), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) });
  }
  const root = document.querySelector('.app-root') || document.body;
  return { drawer: { left: +box.left.toFixed(0), width: +box.width.toFixed(0) }, pageScrollable: root.scrollWidth > root.clientWidth + 1, rootScroll: [root.scrollWidth, root.clientWidth], docScroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth], overflowing: out.slice(0, 25), count: out.length };
});
console.log(JSON.stringify({ drawer: rep.drawer, pageScrollable: rep.pageScrollable, rootScroll: rep.rootScroll, docScroll: rep.docScroll, count: rep.count }));
for (const o of rep.overflowing || []) console.log(`  ${o.tag.padEnd(6)} l=${String(o.l).padStart(7)} r=${String(o.rgt).padStart(7)} w=${String(o.w).padStart(5)} ${o.text}`);
await pg.screenshot({ path: 'audit-out/drawer-overflow.png' });
await ctx.close(); b.disconnect();
