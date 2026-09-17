// Rendered Hebrew of the ATHLETE PORTAL, every tab, from the athlete's own seat (read-only).
// LOCAL output (athlete data): C:/Users/ADMINI~1/AppData/Local/Temp/claude/portal_he.txt
import P from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const W = Number(process.env.W || 390);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage(); await pg.setBypassServiceWorker(true);
await pg.emulate({ viewport: { width: W, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
await pg.goto(`${BASE}/demo/athlete?lang=he`, { waitUntil: 'domcontentloaded' }); await wait(6000);
const tabs = await pg.evaluate(() => [...document.querySelectorAll('button')].filter((e) => e.offsetParent && /תוכנית|משקל|יומן אוכל|היסטוריה|שיאים|הודעות/.test(e.innerText || '')).map((e) => e.innerText.trim()));
let out = '';
for (const t of tabs) {
  await pg.evaluate((l) => { const el = [...document.querySelectorAll('button')].find((e) => e.offsetParent && e.innerText.trim() === l); if (el) el.click(); }, t);
  await wait(2500);
  const lines = await pg.evaluate(() => {
    const seen = new Set();
    const txt = document.body.innerText.split('\n').map((s) => s.trim()).filter((s) => s && /[\u0590-\u05FF]/.test(s) && !seen.has(s) && seen.add(s));
    const attrs = [...document.querySelectorAll('[title],[placeholder],[aria-label]')].flatMap((e) => ['title', 'placeholder', 'aria-label'].map((a) => e.getAttribute(a))).filter((v) => v && /[\u0590-\u05FF]/.test(v));
    return [...txt, ...new Set(attrs).values()].join('\n');
  });
  out += `\n### ${t}\n${lines}\n`;
}
fs.writeFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/claude/portal_he.txt', out);
console.log('tabs', tabs.length, 'chars', out.length);
await pg.close(); b.disconnect();
