// #129 — WHAT FAILS WCAG AA, REPORTED NOT CHANGED.
//
// His checklist: "תבדוק צבע וקונטרסט". The regression gates run at 2.2:1,
// which is the "can a human see this at all" line and only fires on something
// genuinely broken. AA is 4.5:1 for body text and 3:1 for large text.
//
// This REPORTS against AA. It does not change anything, because the palette is
// a decision he has already ruled on ("never re-propose palette redesigns") —
// the useful thing is the number and the list, not a unilateral redesign.
//
//   node scripts/report-contrast-aa.mjs            # both apps
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { CONTRAST_FN } from './lib/contrast.mjs';

const APP = process.env.BASE || 'http://127.0.0.1:5199';
const IL = process.env.IL_BASE || 'http://127.0.0.1:5188';
const APP_ROUTES = ['/coach/dashboard', '/coach/athletes', '/coach/bhbc', '/coach/tasks', '/coach/billing'];
const IL_ROUTES = ['/#/', '/#/online', '/#/gym', '/#/privacy'];

const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const worst = new Map();
let pages = 0;

const sweep = async (page, base, routes, label, themed) => {
  for (const r of routes) {
    for (const theme of (themed ? ['dark', 'light'] : [null])) {
      const url = base + r + (theme ? (r.includes('?') ? '&' : '?') + 'theme=' + theme : '');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise((res) => setTimeout(res, 4200));
      await page.evaluate(() => { window.__CONTRAST_MIN = 'aa'; });
      let hits = [];
      try { hits = await page.evaluate(CONTRAST_FN); } catch (e) { console.log(`  ! ${label}${r} ${theme || ''}: ${String(e.message).slice(0, 60)}`); continue; }
      pages++;
      for (const h of hits) {
        const k = `${h.color} on ${h.bg}`;
        const cur = worst.get(k);
        if (!cur || h.ratio < cur.ratio) worst.set(k, { ...h, where: `${label}${r}${theme ? ' ' + theme : ''}` });
      }
    }
  }
};

const page = await b.newPage();
try {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await sweep(page, IL, IL_ROUTES, 'expo-il ', false);
  await signIn(page, APP);
  await page.evaluate(() => { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en')); });
  await sweep(page, APP, APP_ROUTES, 'app ', true);
} catch (e) { console.log('ERROR', e.message); }
finally { await page.close().catch(() => {}); b.disconnect(); }

const rows = [...worst.values()].sort((a, c) => a.ratio - c.ratio);
console.log(`\n${pages} page render(s) measured against WCAG AA (4.5:1 body, 3:1 large)\n`);
if (!rows.length) console.log('  nothing below AA');
for (const r of rows.slice(0, 25)) {
  console.log(`  ${String(r.ratio).padStart(5)}:1  needs ${r.need}  ${r.big ? 'large' : 'body '}  ${r.where.padEnd(30)} "${r.text.trim().slice(0, 30)}"`);
  console.log(`         ${r.color} on ${r.bg}`);
}
console.log(`\n${rows.length} distinct colour pairing(s) below AA. Reported only — the palette is his call.`);
