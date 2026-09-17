// Open each review tool in Hebrew and list the visible Latin runs (signed in).
import P from 'puppeteer-core';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-lang', 'he'));
await pg.goto(`${BASE}/coach/review-tools?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(7000);
const buttons = await pg.evaluate(() => [...document.querySelectorAll('button, [role="tab"]')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean));
console.log('controls:', buttons.slice(0, 40).join(' | '));
console.log('text:', (await pg.evaluate(() => document.body.innerText)).slice(0, 700).split(String.fromCharCode(10)).join(' / '));
const latin = () => pg.evaluate(() => {
  const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; const s = (n.nodeValue || '').trim(); if (!el || !s || !el.offsetParent) continue; if (el.closest('[aria-hidden="true"]') || getComputedStyle(el).visibility === 'hidden') continue; if (/[֐-׿]/.test(s) || !/[A-Za-z]{3}/.test(s)) continue; out.add(s.slice(0, 70)); }
  return [...out];
});
for (const needle of (process.argv[2] || 'חיישנים').split(',')) {
  const ok = await pg.evaluate((nd) => { const cards = [...document.querySelectorAll('div')].filter((d) => d.offsetParent && (d.innerText || '').includes(nd) && d.querySelector('button')).sort((a, b) => a.innerText.length - b.innerText.length); const btn = cards[0] && cards[0].querySelector('button'); if (btn) { btn.click(); return (cards[0].innerText || '').slice(0, 40); } return false; }, needle);
  await wait(3500);
  console.log(`== ${needle} opened=${ok}:`, JSON.stringify(await latin()));
}
await pg.close(); b.disconnect();
