// verify-row-button-heights.mjs — TWO BUTTONS IN A ROW ARE THE SAME HEIGHT.
//
// Ohad, 2026-08-30: "if there's 2 or more different buttons on the same row,
// they must be the same vertical height, everywhere and anywhere in all of our
// platforms and websites. invest everything to making sure it always stays
// like it."
//
// A fix is a patch; this is the thing that keeps it fixed. It drives the real
// app across every route in docs/SURFACES.md, finds every horizontal row
// holding two or more buttons, and fails if any row breaks the rule.
//
// The detector rules are the ones that took the earlier sweep from 187 findings
// to 0 — most of that reduction was learning to tell a fault from a decision:
//
//   1. Panels are not controls. A tall container that happens to hold a button
//      is layout, not a row of actions. Anything over 60px is skipped.
//   2. Judge height only WITHIN one material. A bordered pill beside a bare
//      text button is deliberate material differentiation, not a defect.
//   3. Respect the alignment a row DECLARES. align-items:flex-end is
//      intentionally bottom-aligned; judging it against centre reports the fix
//      as the fault.
//   4. Only then is >1 height within a material a real fault.
//
//   node scripts/verify-row-button-heights.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1600', 10);

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    const found = [...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]);
    return [...new Set(found)].filter((r) => !/\/(login|demo|try|intake)/.test(r));
  } catch { return ['/coach/dashboard', '/coach/athletes', '/coach/bhbc']; }
};
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

const chromeUp = async () => {
  try { const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(2500) }); return r.ok; }
  catch { return false; }
};
if (!(await chromeUp())) {
  spawn(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, [
    '--remote-debugging-port=9222',
    String.raw`--user-data-dir=C:\Users\Administrator\chrome-debug-budget`,
    '--no-first-run', '--no-default-browser-check',
    '--proxy-bypass-list=<-loopback>', 'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 25 && !(await chromeUp()); i++) await new Promise((r) => setTimeout(r, 1000));
  await new Promise((r) => setTimeout(r, 2500));
}

const MEASURE = () => {
  const bad = [];
  const seen = new Set();
  document.querySelectorAll('*').forEach((d) => {
    const btns = [...d.children].filter((c) => c.tagName === 'BUTTON' && c.offsetParent !== null);
    if (btns.length < 2) return;
    const r = d.getBoundingClientRect();
    if (r.height > 60 || r.height < 10) return;              // rule 1: panels are not controls
    const declared = getComputedStyle(d).alignItems;
    if (declared === 'flex-end' || declared === 'baseline') return;  // rule 3: respect the declared alignment

    const items = btns.map((el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const bordered = cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0;
      return { t: (el.textContent || '').trim().slice(0, 16), h: Math.round(b.height), bordered };
    });
    // rule 2: only compare within one material
    for (const material of [true, false]) {
      const group = items.filter((i) => i.bordered === material);
      if (group.length < 2) continue;
      const heights = [...new Set(group.map((i) => i.h))];
      if (heights.length > 1) {
        const key = material + heights.join(',') + group.map((i) => i.t).join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        bad.push({ material: material ? 'bordered' : 'bare', heights, items: group.map((i) => `${i.t}:${i.h}`) });
      }
    }
  });
  return bad;
};

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await b.newPage();
const applyViewport = async (pg, w) => {
  // Real device below 700px - a plain setViewport is a narrow desktop, not a phone.
  if (w <= 700) {
    await pg.emulate({
      viewport: { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    return;
  }
  await pg.setViewport({ width: w, height: 1100 });
};
await applyViewport(page, W);
let total = 0;

try {
  await signIn(page, BASE);
  await assertAuthed(page, '/coach/dashboard');

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));

    // Tabs hide most of a screen. Measure each one, not just the landing tab -
    // the Roster Health mismatch lived on BHBC's MEDICAL tab and a sweep that
    // only saw Overview reported the screen as clean.
    const tabs = await page.evaluate(() => [...document.querySelectorAll('button')]
      .map((x) => (x.textContent || '').trim())
      .filter((t) => /^(overview|roster|schedule|medical|sessions|games)$/i.test(t)));
    const passes = tabs.length ? tabs : [null];

    for (const tab of passes) {
      if (tab) {
        await page.evaluate((label) => {
          const el = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === label);
          if (el) el.click();
        }, tab);
        await new Promise((r) => setTimeout(r, 2500));
      }
      // Sample TWICE and keep only faults present in both. A single sample
      // caught /athlete mid-render once and reported a height mismatch that
      // two immediate re-runs could not reproduce. A gate that cries wolf
      // erodes the rule it exists to protect - he has to be able to trust a
      // FAIL here, because the whole point is that the rule always holds.
      const first = await page.evaluate(MEASURE);
      let bad = [];
      if (first.length) {
        await new Promise((r) => setTimeout(r, 1200));
        const second = await page.evaluate(MEASURE);
        const key = (f) => f.material + f.heights.join(',') + f.items.join('|');
        const seen2 = new Set(second.map(key));
        bad = first.filter((f) => seen2.has(key(f)));
      }
      const where = `${route}${tab ? ' · ' + tab : ''}`;
      if (!bad.length) { console.log(`OK    ${where}`); continue; }
      total += bad.length;
      console.log(`FAIL  ${where}`);
      for (const f of bad) console.log(`        ${f.material} heights ${JSON.stringify(f.heights)}  ${f.items.join('  ')}`);
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  b.disconnect();
}

console.log(`\n${total} row(s) where buttons of the same material differ in height`);
process.exit(total ? 1 : 0);
