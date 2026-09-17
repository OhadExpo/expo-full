// Dump the RENDERED Hebrew text of coach screens so a native reader can check
// COMPOSED sentences (dictionary pieces + data), which no dictionary review sees.
// LOCAL ONLY output (athlete names): C:/Users/ADMINI~1/AppData/Local/Temp/claude/rendered_*.txt
import P from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1500);
await signIn(pg, BASE);
await pg.evaluate(() => { localStorage.setItem('expo-lang', 'he'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('he')); });
const text = () => pg.evaluate(() => document.body.innerText.split('\n').map((s) => s.trim()).filter((s) => /[\u0590-\u05FF]/.test(s) && s.split(/\s+/).length >= 3).join('\n'));
const routes = ['/coach/dashboard', '/coach/athletes', '/coach/workouts', '/coach/review', '/coach/billing', '/coach/intake', '/coach/calendar'];
let all = '';
for (const r of routes) {
  await pg.goto(`${BASE}${r}?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(7000);
  const t = await text(); all += `\n### ${r}\n${t}\n`;
}
// club zone, every tab
await pg.goto(`${BASE}/coach/bhbc?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(8000);
const tabs = await pg.evaluate(() => [...document.querySelectorAll('.bhbc-tab, [role="tab"]')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim()).filter(Boolean));
for (const tb of tabs) {
  if (/יציאה|Sign out|תצוגת מאמן/.test(tb)) continue;
  await pg.evaluate((label) => { const el = [...document.querySelectorAll('.bhbc-tab, [role="tab"]')].find((e) => (e.innerText || '').trim() === label); if (el) el.click(); }, tb);
  await wait(2500);
  all += `\n### club: ${tb}\n${await text()}\n`;
}
// dedupe lines across the whole dump
const seen = new Set();
const lines = all.split('\n').filter((l) => l.startsWith('###') || (!seen.has(l) && seen.add(l)));
fs.writeFileSync(OUT + 'rendered_he.txt', lines.join('\n'));
console.log('lines', lines.length);
await pg.close(); b.disconnect();
