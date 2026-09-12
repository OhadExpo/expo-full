// Every button/control on the program editor's top area, with its box, so
// "all the same vertical height" is a number per control, not an opinion.
//   CDP=http://127.0.0.1:9223 MSYS_NO_PATHCONV=1 node audit-out/probe-editor-buttons.mjs [base] [lang]
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const LANG = process.argv[3] || 'en';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await pg.setViewport({ width: 1500, height: 1000 });
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, LANG);
await pg.goto(BASE + '/coach/programs?lang=' + LANG, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 300)) break; }
await wait(2000);
const hit = await pg.evaluate(() => { const el = [...document.querySelectorAll('div,span,button')].filter((e) => /^Block #\d+/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 500).sort((x, y) => x.textContent.length - y.textContent.length)[0]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: el.textContent.trim().slice(0, 20) }; });
if (!hit) throw new Error('no Block card');
await pg.mouse.click(hit.x, hit.y);
await wait(3500);
const rows = await pg.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button,select,[role="button"],[role="switch"],label')) {
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.top > 900 || r.top < 40) continue;
    const cs = getComputedStyle(el);
    out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 26), x: +r.left.toFixed(0), y: +r.top.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(1), pad: cs.padding, bw: cs.borderWidth, fs: cs.fontSize, lh: cs.lineHeight });
  }
  return out.sort((a, c) => a.y - c.y || a.x - c.x);
});
console.log('opened:', hit.t);
for (const r of rows) console.log(`y=${String(r.y).padStart(4)} h=${String(r.h).padStart(5)} x=${String(r.x).padStart(5)} w=${String(r.w).padStart(4)} pad=${r.pad.padEnd(14)} bw=${r.bw.padEnd(10)} fs=${r.fs.padEnd(5)} ${r.tag.padEnd(6)} ${r.text}`);
await pg.screenshot({ path: `audit-out/editor-buttons-${LANG}.png` });
await ctx.close(); b.disconnect();
