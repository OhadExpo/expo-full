// THE DEMO'S NUMBERS MUST AGREE WITH EACH OTHER, ACROSS TABS.
//
// The run sheet tells Ohad to lead with billing because "every figure
// reconciles and you can prove it live" — he invites the buyer to add the
// column up. So a number that contradicts another number one tab away is not
// cosmetic; it is the demo's central claim failing in the room.
//
// It has already happened twice:
//   - the dashboard counted low-session athletes as `sessionsLeft <= 2` and
//     the athletes rail as `<= 1`, so one said 4 and the other said 3;
//   - the task board and the roster disagreed about who was dormant.
//
// Both were invisible to every other gate, because each screen was internally
// fine. Only a cross-screen comparison sees it.
//
// WHAT THIS DOES NOT DO: it does not re-derive the fixture. Re-deriving would
// just be a second copy of the same arithmetic, and a copy agrees with itself.
// It reads what is PAINTED on one tab and what is PAINTED on another, and
// requires them to match. The invariants below are the ones a buyer can check
// without being told how.
//
//   node scripts/verify-demo-numbers.mjs
import fs from 'node:fs';
import P from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = 'audit-out/demo-numbers';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const findings = [];
const add = (kind, detail) => { findings.push({ kind, detail }); console.log(`${kind.padEnd(9)} ${detail}`); };

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });

// Read one page and return every number we can anchor to a label.
async function read(route, lang) {
  const ctx = await b.createBrowserContext();
  const pg = await ctx.newPage();
  try {
    await pg.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
    await pg.evaluateOnNewDocument((L) => {
      try {
        localStorage.setItem('expo-lang', L);
        localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000));
      } catch (e) { /* private mode */ }
    }, lang);
    await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let prev = -1;
    for (let i = 0; i < 22; i++) {
      await wait(600);
      const len = await pg.evaluate(() => (document.body.innerText || '').length);
      if (len === prev && len > 0) break;
      prev = len;
    }
    return await pg.evaluate(() => document.body.innerText || '');
  } finally {
    await pg.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

// Pull the number that sits nearest a label in the flattened page text.
// Case-insensitive because innerText applies text-transform, so a label
// written "Low sessions" arrives as "LOW SESSIONS". Looks AFTER the label
// first and then BEFORE it, because the filter rail puts its count on the
// opposite side from the dashboard tile.
const near = (text, label, { window = 60 } = {}) => {
  const i = text.toUpperCase().indexOf(label.toUpperCase());
  if (i < 0) return null;
  const aft = text.slice(i + label.length, i + label.length + window).match(/-?[\d][\d,]*/);
  if (aft) return Number(aft[0].replace(/,/g, ''));
  const bef = text.slice(Math.max(0, i - window), i).match(/-?[\d][\d,]*(?!.*\d)/s);
  return bef ? Number(bef[0].replace(/,/g, '')) : null;
};

const LANGS = [['en', {
  lowTile: 'LOW SESSIONS', lowRail: 'Low sessions', all: 'All',
  collected: 'COLLECTED MTD', billCollected: 'COLLECTED', active: 'ACTIVE ATHLETES',
}], ['he', {
  lowTile: 'מעט אימונים בחבילה', lowRail: 'מעט אימונים בחבילה', all: 'הכל',
  collected: 'נכנס החודש', billCollected: 'נכנס החודש', active: 'מתאמנים פעילים',
}]];

let checks = 0;
for (const [lang, L] of LANGS) {
  const dash = await read('/demo/coach', lang);
  const trainees = await read('/demo/coach/trainees', lang);
  const billing = await read('/demo/coach/billing', lang);

  const cmp = (name, a, bv) => {
    checks++;
    if (a == null || bv == null) { add('UNREAD', `${lang}: ${name} — could not read one side (${a} / ${bv}); NOT judged as a pass`); return; }
    if (a !== bv) add('MISMATCH', `${lang}: ${name} — ${a} on one tab, ${bv} on the other`);
  };

  // 1. Low-session athletes: the dashboard tile vs the athletes rail.
  cmp('low-session count (dashboard tile vs athletes rail)',
    near(dash, L.lowTile), near(trainees, L.lowRail));

  // 2. Money collected this month: the dashboard tile vs the billing header.
  cmp('collected this month (dashboard vs billing)',
    near(dash, L.collected), near(billing, L.billCollected));

  // 3. Roster size: the dashboard's "5 / 8" total vs the rail's "All".
  const activeTile = (() => {
    const i = dash.indexOf(L.active);
    if (i < 0) return null;
    const m = dash.slice(i + L.active.length, i + L.active.length + 40).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? Number(m[2]) : null;
  })();
  cmp('roster size (dashboard total vs athletes rail "all")', activeTile, near(trainees, L.all));
}
b.disconnect();

fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 1));
const by = {};
for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
console.log(`\n${checks} cross-tab comparisons over 2 languages.`);
console.log(Object.keys(by).length ? Object.entries(by).map(([k, v]) => `  ${k.padEnd(9)} ${v}`).join('\n') : '  none');
console.log(`-> ${OUT}/findings.json`);
process.exit(findings.length ? 1 : 0);
