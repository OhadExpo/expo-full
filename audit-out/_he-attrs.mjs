// Rendered sweep, signed in, Hebrew: every title / aria-label / placeholder
// on each coach route that is Latin with no Hebrew in it. Attributes built
// from templates or ternaries are invisible to the source gate.
// Output stays local (it can contain athlete names): audit-out/_he-attrs.json
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { signIn } from '../scripts/lib/authed-page.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
const ROUTES = [...new Set([...md.matchAll(/`(\/coach[a-z0-9/-]*)`/g)].map((m) => m[1]))].filter((r) => !/:|exercise-(matching|classify|cleanup)/.test(r));
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
const page = await b.newPage(); await page.setViewport({ width: 1440, height: 1000 });
await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await w(1500);
await signIn(page, BASE);
await page.goto(`${BASE}/coach/dashboard?lang=he`, { waitUntil: 'domcontentloaded' }); await w(4000);
const KEEP = /^(EXPO|WhatsApp|YouTube|Google Calendar|Esc|RPE|ACWR|VBT|PDF|CSV|עברית|Switch to English|EN|HE)$/;
const all = {};
for (const r of ROUTES) {
  try {
    await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await w(4500);
    const found = await page.evaluate(() => {
      const out = new Map();
      for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
        for (const a of ['title', 'aria-label', 'placeholder']) {
          const v = el.getAttribute(a); if (!v) continue;
          if (/[֐-׿]/.test(v) || !/[A-Za-z]{3}/.test(v)) continue;
          out.set(`${a}: ${v.slice(0, 90)}`, el.tagName);
        }
      }
      return [...out.keys()];
    });
    const f = found.filter((x) => !KEEP.test(x.replace(/^[a-z-]+: /, '')));
    all[r] = f;
    console.log(`${String(f.length).padStart(3)} ${r}`);
  } catch (e) { console.log(`ERR ${r} ${String(e).slice(0, 60)}`); }
}
fs.writeFileSync('audit-out/_he-attrs.json', JSON.stringify(all, null, 2));
await page.close(); b.disconnect();
