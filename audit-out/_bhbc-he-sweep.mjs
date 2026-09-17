// The club zone in Hebrew (its own switch: localStorage expo-collapse:bhbc-lang).
// Walks the zone's tabs, lists visible Latin text + English attributes.
// Output is LOCAL ONLY (player names): audit-out/_bhbc-he-sweep.json
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
const page = await b.newPage(); await page.setViewport({ width: 1440, height: 1000 });
await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await w(1500);
await signIn(page, BASE);
await page.evaluate(() => { localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he')); });
await page.goto(`${BASE}/coach/bhbc?lang=he`, { waitUntil: 'domcontentloaded' }); await w(7000);
const collect = () => page.evaluate(() => {
  const text = new Set(); const attrs = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = walk.nextNode())) {
    const el = n.parentElement; const s = (n.nodeValue || '').trim();
    if (!el || !s || !el.offsetParent) continue;
    if (el.closest('[aria-hidden="true"]') || getComputedStyle(el).visibility === 'hidden') continue;
    if (/^(SCRIPT|STYLE)$/.test(el.tagName) || /[֐-׿]/.test(s) || !/[A-Za-z]{3}/.test(s)) continue;
    text.add(s.slice(0, 80));
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) for (const a of ['title', 'aria-label', 'placeholder']) {
    const v = el.getAttribute(a); if (v && !/[֐-׿]/.test(v) && /[A-Za-z]{3}/.test(v)) attrs.add(`${a}: ${v.slice(0, 80)}`);
  }
  return { text: [...text], attrs: [...attrs] };
});
const tabs = await page.evaluate(() => [...document.querySelectorAll('.bhbc-tab, [role="tab"]')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter(Boolean));
const out = { tabs, views: {} };
out.views['(start)'] = await collect();
for (const t of tabs) {
  const ok = await page.evaluate((label) => { const el = [...document.querySelectorAll('.bhbc-tab, [role="tab"]')].find((e) => (e.innerText || '').trim() === label); if (el && !/יציאה|Sign out/.test(label)) { el.click(); return true; } return false; }, t);
  if (!ok) continue;
  await w(2500);
  out.views[t] = await collect();
}
fs.writeFileSync('audit-out/_bhbc-he-sweep.json', JSON.stringify(out, null, 2));
console.log('tabs:', tabs.join(' | '));
for (const [v, r] of Object.entries(out.views)) console.log(`${v}: ${r.text.length} text, ${r.attrs.length} attrs`);
await page.close(); b.disconnect();
