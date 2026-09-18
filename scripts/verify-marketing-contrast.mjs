// verify-marketing-contrast.mjs — can a stranger read the site he lands on?
//
// The app's theme-parity sweep has checked contrast on /coach/* and /athlete
// for months. expo-il — the page a prospect meets FIRST, in two languages —
// had never been checked at all. Same measuring code (scripts/lib/contrast.mjs),
// because two copies of a contrast rule drift the first time one of them learns
// something, and every exclusion in that file was paid for by a false positive.
//
//   node scripts/verify-marketing-contrast.mjs
import P from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CONTRAST_FN } from './lib/contrast.mjs';
import { assertMarketingSite, IL_START } from './lib/il-site.mjs';

const BASE = process.env.IL_BASE || 'http://127.0.0.1:5174';
const WIDTHS = (process.env.WIDTHS || '390,1280').split(',').map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SRC = readFileSync(new URL('../expo-il/src/programs.js', import.meta.url), 'utf8');
const ids = [...SRC.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)'/gmi)].map((m) => m[1]);
if (!ids.length) { console.log('FAILED: no programs parsed out of programs.js.'); process.exit(1); }
const ROUTES = ['/#/', '/#/online', '/#/gym', ...ids.map((p) => '/#/programs/' + p)];

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

// Prove it is the marketing site answering before measuring a single claim -
// the fit gate reported clean twice against the wrong thing.
const site = await assertMarketingSite(pg, BASE);
if (!site.ok) {
  console.log('FAILED: ' + site.why);
  console.log(IL_START);
  await pg.close(); b.disconnect(); process.exit(1);
}

const bad = [];
let measured = 0;
for (const lang of ['he', 'en']) {
  await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-il-lang', l); } catch (e) {} }, lang);
  for (const w of WIDTHS) {
    await pg.setViewport({ width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    for (const r of ROUTES) {
      await pg.goto('about:blank');
      await pg.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);
      const len = await pg.evaluate(() => (document.body.innerText || '').trim().length);
      if (len < 200) { bad.push(`${lang} ${w} ${r}: rendered only ${len} chars — nothing was checked here`); continue; }
      measured++;
      let hits = [];
      try { hits = await pg.evaluate(CONTRAST_FN); } catch (e) { bad.push(`${lang} ${w} ${r}: the check threw — ${String(e.message || e).slice(0, 80)}`); continue; }
      for (const h of hits) bad.push(`${lang} ${w} ${r}: "${h.text}" at ${h.ratio}:1 (${h.color} on ${h.bg})`);
    }
  }
}
await pg.close();
b.disconnect();

console.log('');
const expected = ROUTES.length * WIDTHS.length * 2;
if (measured < expected) {
  console.log(`FAILED: measured ${measured} of ${expected} pages.`);
  process.exit(1);
}
for (const x of [...new Set(bad)].slice(0, 40)) console.log('  ' + x);
console.log(bad.length
  ? `${bad.length} low-contrast finding(s) across ${measured} pages`
  : `0 - nothing under 2.2:1, ${measured} pages checked (${ROUTES.length} routes x ${WIDTHS.join('/')} x he/en)`);
process.exit(bad.length ? 1 : 0);
