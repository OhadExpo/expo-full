// Open the review's COMPARE modal from the owner seat and photograph it:
// expand the first workout, click ⇄ COMPARE, pick the first candidate.
//   CDP=http://127.0.0.1:9224 MSYS_NO_PATHCONV=1 node audit-out/probe-compare-modal.mjs [base] [lang]
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
import { setWidth } from '../scripts/lib/viewport.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const LANG = process.argv[3] || 'en';
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9224', defaultViewport: null, protocolTimeout: 240000 });
const ctx = await b.createBrowserContext();
const pg = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A real mouse click at the element's centre (after scrolling it into view):
// el.click() reached the REVIEW link but never opened the compare picker.
const click = async (re) => {
  const hit = await pg.evaluate((rx) => {
    const r = new RegExp(rx);
    const el = [...document.querySelectorAll('button,[role="button"],a,div,span')].filter((e) => r.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 600).sort((a, c) => a.textContent.length - c.textContent.length)[0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, t: (el.textContent || '').trim().slice(0, 50), tag: el.tagName };
  }, re);
  if (!hit) return null;
  await pg.mouse.click(hit.x, hit.y);
  return `${hit.t} <${hit.tag}>`;
};
await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await A.signIn(pg, BASE);
await pg.evaluate((l) => { try { localStorage.setItem('expo-lang', l); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} }, LANG);
await setWidth(pg, 1500, 1000);
await pg.goto(BASE + '/coach/review', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let k = 0; k < 40; k++) { await wait(500); if (await pg.evaluate(() => document.body.innerText.length > 400)) break; }
await wait(2500);
// The compare lives inside an expanded workout → expanded exercise. Walk the
// first workout that has a COMPARE.
const steps = [];
steps.push('review: ' + await click('^(REVIEW →|VIEW →|בדיקה ←|הצג ←)$'));
await wait(2500);
for (let i = 0; i < 12 && !(await pg.evaluate(() => /⇄ COMPARE/.test(document.body.innerText))); i++) {
  // expand exercise rows until a compare button shows
  const opened = await pg.evaluate((n) => { const rows = [...document.querySelectorAll('div')].filter((d) => /▼/.test((d.textContent || '').trim().slice(-2))); const r = rows[n]; if (r) { r.click(); return true; } return false; }, i);
  await wait(900);
  if (!opened) break;
}
steps.push('compare: ' + await click('^⇄ COMPARE$'));
await wait(1500);
steps.push('dialogs: ' + await pg.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute('aria-label')).join(',') + ' | text: ' + (document.body.innerText.match(/Compare with…[\s\S]{0,80}/) || [''])[0].replace(/\s+/g, ' ')));
const picked = await pg.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"][aria-label="Pick a video to compare"]') || document.querySelector('[role="dialog"]'); if (!dlg) return null;
  // The picker's candidates are DIVs (label "W2 · Day A · date"), not buttons.
  const cands = [...dlg.querySelectorAll('div')].filter((e) => /^W\d+ · /.test((e.textContent || '').trim())).sort((x, y) => x.textContent.length - y.textContent.length);
  if (cands[0]) { cands[0].click(); return (cands[0].textContent || '').trim().slice(0, 40); } return 'no candidate';
});
steps.push('candidate: ' + picked);
await wait(3500);
await pg.screenshot({ path: `audit-out/compare-${LANG}.png` });
console.log(steps.join(' | '));
console.log('shot: audit-out/compare-' + LANG + '.png');
await ctx.close(); b.disconnect();
