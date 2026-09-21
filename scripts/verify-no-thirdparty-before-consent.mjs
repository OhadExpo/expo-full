// #116 / #127 — NOTHING FROM GOOGLE UNTIL THE VISITOR ASKS FOR IT.
//
// From Ohad's checklist: "is cookie consent needed" and "check third-party
// embeds". The site's own storage needs no consent anywhere — a chunk-reload
// guard and an exit-prompt flag in sessionStorage, the chosen language in
// localStorage, and Vercel Analytics, which is cookieless. The two Google
// Calendar iframes were the exception: they loaded on sight and dropped
// Google's cookies before the visitor had agreed to anything.
//
// This asserts the fix from the network up: zero google.com requests on load,
// and the embed appearing only after the click.
//
//   URL=http://127.0.0.1:5188 node scripts/verify-no-thirdparty-before-consent.mjs
import P from 'puppeteer-core';

const BASE = process.env.URL || 'http://127.0.0.1:5188';
const ROUTES = ['/#/gym', '/#/online'];
const b = await P.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
let fail = 0, checked = 0;

for (const route of ROUTES) {
  const page = await b.newPage();
  const google = [];
  page.on('request', (r) => { if (/google|gstatic|googleusercontent/i.test(r.url())) google.push(r.url()); });
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));
    // Scroll the whole page: an embed below the fold that loads on scroll is
    // still an embed that loads without being asked.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 2500));

    const before = google.length;
    const placeholder = await page.evaluate(() => {
      const e = [...document.querySelectorAll('button')].find((q) => /show the calendar|הצגת היומן/i.test(q.textContent || ''));
      return e ? (e.textContent || '').trim() : null;
    });
    checked++;

    if (before > 0) { fail++; console.log(`  FAIL ${route}: ${before} Google request(s) BEFORE any consent — e.g. ${google[0].slice(0, 70)}`); }
    else console.log(`  ok   ${route}: 0 Google requests on load`);

    if (!placeholder) { fail++; console.log(`  FAIL ${route}: no click-to-load placeholder found`); }
    else {
      // Scroll it into view first, then click. Clicking before the element has
      // settled reports a false "the embed never loaded".
      await page.evaluate(() => {
        const e = [...document.querySelectorAll('button')].find((q) => /show the calendar|הצגת היומן/i.test(q.textContent || ''));
        if (e) { e.scrollIntoView({ block: 'center' }); e.click(); }
      });
      await new Promise((r) => setTimeout(r, 6000));
      const loaded = await page.evaluate(() => [...document.querySelectorAll('iframe')].some((f) => /calendar\.google\.com/.test(f.src)));
      if (loaded && google.length > before) console.log(`  ok   ${route}: loads on click — ${google.length - before} Google request(s) after`);
      else { fail++; console.log(`  FAIL ${route}: clicked and the calendar did not load (iframe=${loaded}, requests=${google.length - before})`); }
    }
  } catch (e) { fail++; console.log(`  ERROR ${route}: ${e.message}`); }
  finally { await page.close().catch(() => {}); }
}
b.disconnect();
console.log(`\n${checked} of ${ROUTES.length} embed pages checked, ${fail} problem(s)`);
if (fail || checked !== ROUTES.length) process.exitCode = 1;
