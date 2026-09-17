// Rendered Hebrew of one athlete's page in the coach app (overload chart, CRM, evaluations,
// next-block report entry). LOCAL ONLY output (names).
import P from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setViewport({ width: 1400, height: 1000 });
await pg.goto(BASE, { waitUntil: 'domcontentloaded' }); await wait(1200);
await signIn(pg, BASE);
await pg.evaluate(() => localStorage.setItem('expo-lang', 'he'));
const id = await pg.evaluate(async () => { try { const raw = localStorage.getItem('expo-trainees') || ''; const m = raw.match(/"id":"([^"]+)","name":"Diego Day"/); return m ? m[1] : null; } catch { return null; } });
await pg.goto(`${BASE}/coach/athletes?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(8000);
const tid = id || await pg.evaluate(() => { const k = Object.keys(localStorage).find((x) => /trainees/.test(x)); const raw = k ? localStorage.getItem(k) : ''; const m = raw && raw.match(/"id":"([^"]+)"[^}]*?"name":"Diego Day"/); return m ? m[1] : null; });
console.log('tid', tid);
if (tid) { await pg.goto(`${BASE}/coach/athletes/${tid}?lang=he`, { waitUntil: 'domcontentloaded' }); }
const opened = !!tid;
await wait(7000);
// expand every collapsed section
for (let i = 0; i < 3; i++) { await pg.evaluate(() => document.querySelectorAll('[aria-expanded="false"]').forEach((h) => { try { h.click(); } catch {} })); await wait(1200); }
const lines = await pg.evaluate(() => document.body.innerText.split(String.fromCharCode(10)).map((s) => s.trim()).filter((s) => /[\u0590-\u05FF]/.test(s) && s.split(/\s+/).length >= 2));
fs.writeFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/claude/athlete_page_he.txt', [...new Set(lines)].join(String.fromCharCode(10)));
console.log('opened', opened, 'url', pg.url(), 'lines', new Set(lines).size);
await pg.close(); b.disconnect();
