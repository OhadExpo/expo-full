// EVERY TABLE ROW REACHES ITS TABLE'S EDGE.
//
// index.html turns every <table> into display:block under 769px (so wide
// tables scroll on a phone). A table that is meant to FIT must opt back out
// with display:table — otherwise an anonymous table box sized to its content
// sits inside a full-width block, and every row stops short of the edge with a
// void beside it. On 26.9 that was the demo exercises list at 390 (rows 306-342
// of 357, four "fixes" measured before the computed style showed the cause)
// and the real /coach/exercises at 768 (640 of 742).
//
// Sweep: the demo's routes, and every /coach route in docs/SURFACES.md signed
// in as the owner, at 390 and 768. A row is SHORT when it is narrower than its
// table by more than 2px and the table does not scroll (a scrolling table is
// allowed to be wider than its rows' box). Prints numbers and header labels
// only — the real app shows client data.
//
//   node scripts/verify-table-rows.mjs [--demo-only]
import fs from 'node:fs';
import P from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const DEMO_ONLY = process.argv.includes('--demo-only');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEMO = ['/demo/coach', '/demo/coach/trainees', '/demo/coach/programs', '/demo/coach/exercises', '/demo/coach/sessions', '/demo/coach/review', '/demo/coach/tasks', '/demo/coach/billing', '/demo/athlete', '/demo'];
const REAL = [...new Set((fs.readFileSync('docs/SURFACES.md', 'utf8').match(/`\/coach\/[a-z/-]+`/g) || []).map((s) => s.slice(1, -1)))];
const WIDTHS = [390, 768];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let loads = 0, tables = 0;
const short = [];
const sweep = async (routes, authed) => {
  for (const w of WIDTHS) {
    const ctx = await b.createBrowserContext();
    const pg = await ctx.newPage();
    try {
      await setWidth(pg, w, 900);
      await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) { /* private mode */ } });
      if (authed) {
        const who = await signIn(pg, BASE);
        if (!who || !who.signedIn) throw new Error('could not sign in as the owner — the real app was NOT measured');
      }
      for (const r of routes) {
        await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' });
        await setWidth(pg, w, 900);
        await wait(3500);
        loads++;
        const res = await pg.evaluate(() => [...document.querySelectorAll('table')].filter((t) => t.getBoundingClientRect().width > 0 && t.querySelector('tr')).map((t) => {
          const tr = t.querySelector('tbody tr') || t.querySelector('tr');
          const tb = t.getBoundingClientRect(), rb = tr.getBoundingClientRect();
          return { disp: getComputedStyle(t).display, tableW: Math.round(tb.width), rowW: Math.round(rb.width), scrollW: t.scrollWidth, head: [...t.querySelectorAll('th')].slice(0, 3).map((h) => h.innerText.trim().slice(0, 14)).join('|') };
        }));
        for (const x of res) {
          tables++;
          if (x.rowW < x.tableW - 2 && x.scrollW <= x.tableW + 1) short.push(`${w} ${r}  "${x.head}"  row ${x.rowW}px in a ${x.tableW}px table (${x.disp})`);
        }
      }
    } finally { await ctx.close(); }
  }
};
await sweep(DEMO, false);
if (!DEMO_ONLY) await sweep(REAL, true);
await b.disconnect();

for (const s of short) console.log(`SHORT  ${s}`);
console.log(`\nTABLE-ROWS GATE — ${loads} page loads (${DEMO.length} demo${DEMO_ONLY ? '' : ` + ${REAL.length} coach`} routes x ${WIDTHS.length} widths), ${tables} tables measured, ${short.length} with rows short of the edge`);
// A zero over nothing is not a pass.
if (!tables) { console.log('FAIL  no tables were measured — the sweep saw nothing'); process.exit(1); }
process.exit(short.length ? 1 : 0);
