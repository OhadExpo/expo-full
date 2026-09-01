// BHBC ON A REAL PHONE.
//
// Every BHBC tab, on an emulated iPhone (isMobile, touch, DPR 2, iPhone UA) -
// NOT a narrow desktop viewport. That distinction is the whole point: a plain
// setViewport keeps the desktop UA, DPR 1 and isMobile false, so hover styles
// apply and mobile-only CSS may not. Every mobile pass that used one reported
// clean while Ohad's actual screen was a mess.
//
// Three checks, and two of them cost me a correction before they could be
// trusted:
//   1. does the PAGE scroll sideways (it must not)
//   2. how many contained regions scroll sideways (a dense numeric table you
//      READ may; the row you OPERATE may not)
//   3. rows whose children do not share a vertical centre - compared against
//      the CONTENT box, because a row with padding-top centres its children
//      below that padding and comparing to the border box reports every such
//      row as off by half the padding; and skipping WRAPPED rows and rows that
//      DECLARE flex-start/baseline/flex-end, which are choices, not faults.
//
//   node scripts/audit-bhbc-mobile.mjs
import P from 'puppeteer-core';
import * as A from '../scripts/lib/authed-page.mjs';
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const pg = await b.newPage();
await pg.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.goto('http://127.0.0.1:5199/coach/bhbc', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 13000));
await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /maybe later|later/i.test(e.textContent || '')); if (x) x.click(); });
await new Promise((r) => setTimeout(r, 1200));
const out = [];
for (const tab of ['Overview', 'Roster', 'Schedule', 'Medical', 'Sessions', 'Games']) {
  await pg.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().toLowerCase() === t.toLowerCase()); if (x) x.click(); }, tab);
  await new Promise((r) => setTimeout(r, 2600));
  out.push(await pg.evaluate((t) => {
    const scrollers = [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).overflowX === 'auto'
      && d.scrollWidth > d.clientWidth + 1 && !d.className.toString().includes('header'));
    // rows whose children do not share a vertical centre
    let offCentre = 0;
    document.querySelectorAll('div').forEach((d) => {
      if (getComputedStyle(d).display !== 'flex') return;
      const kids = [...d.children].filter((c) => c.getBoundingClientRect().height > 4);
      if (kids.length < 2) return;
      const r = d.getBoundingClientRect();
      if (r.height > 60 || r.height < 8) return;
      const cs2 = getComputedStyle(d);
      const padT = parseFloat(cs2.paddingTop) || 0, padB = parseFloat(cs2.paddingBottom) || 0;
      const bT = parseFloat(cs2.borderTopWidth) || 0, bB = parseFloat(cs2.borderBottomWidth) || 0;
      const mid = r.top + bT + padT + (r.height - bT - bB - padT - padB) / 2;
      const tops = new Set(kids.map((c) => Math.round(c.getBoundingClientRect().top / 4)));
      if (tops.size > 1) return;
      if (cs2.alignItems === 'flex-start' || cs2.alignItems === 'baseline' || cs2.alignItems === 'flex-end') return;
      if (kids.some((c) => { const k = c.getBoundingClientRect(); return Math.abs((k.top + k.height / 2) - mid) > 1.5; })) offCentre++;
    });
    return { tab: t, pageSideways: document.documentElement.scrollWidth > innerWidth + 1,
      sidewaysRegions: scrollers.length,
      worst: scrollers.slice(0, 2).map((d) => d.scrollWidth + '/' + d.clientWidth + ' ' + (d.innerText || '').replace(/\s+/g, ' ').slice(0, 22)),
      offCentreRows: offCentre };
  }, tab));
}
console.log(JSON.stringify(out, null, 0));
await pg.close();
b.disconnect();
