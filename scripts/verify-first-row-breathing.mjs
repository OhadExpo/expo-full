// THE FIRST ROW UNDER A CARD'S HEADER STRIP GETS THE SAME AIR ABOVE ITS TEXT
// AS BELOW IT.
//
// Ohad reported this SIX times ("i asked for a fix 5 times already", "still not
// fix to the next game box"). Every earlier attempt measured the row's own
// padding, which was a symmetric 12/12 and therefore looked correct. The row
// also carried marginTop:-25 to pull it up under the strip, so what he was
// actually looking at was:
//
//     navy strip ends   158.6
//     text ink starts   159.2   ->  0.6px of air above
//     text ink ends     174.4
//     divider           189.9   -> 15.5px of air below
//
// The text was flush against the strip. Padding was never the thing to measure:
// the gap above is between the STRIP and the INK, and it lives outside the row.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const TOL = 1.5;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [1500, 1280, 900, 470];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, BASE);
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1000);
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 12000));
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  const r = await pg.evaluate(() => {
    const row = document.querySelector('.bhbc-labelrow');
    if (!row) return { err: 'no label row' };
    // The strip is the nearest ancestor of the card title that actually PAINTS.
    // Matching on a colour string is brittle — this card renders navy as
    // `color(srgb ...)`, not `rgb(...)` — so match on "has a non-transparent
    // background and sits directly above the row".
    const cards = [...document.querySelectorAll('*')].filter((e) => {
      const bg = getComputedStyle(e).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false;
      const rc = e.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      return rc.height > 20 && rc.height < 70 && Math.abs(rc.bottom - rr.top) < 40 && rc.bottom <= rr.bottom;
    });
    if (!cards.length) return { err: 'no strip above the first row' };
    const strip = cards.sort((a, c) => c.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    const sb = strip.getBoundingClientRect().bottom;
    const rr = row.getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(row.lastElementChild);
    const ink = rg.getBoundingClientRect();
    return { stripBottom: +sb.toFixed(1), inkTop: +ink.top.toFixed(1), inkBottom: +ink.bottom.toFixed(1), rowBottom: +rr.bottom.toFixed(1),
      above: +(ink.top - sb).toFixed(1), below: +(rr.bottom - ink.bottom).toFixed(1) };
  });
  if (r.err) { console.log(`${W}px: ${r.err}`); bad++; continue; }
  const diff = +Math.abs(r.above - r.below).toFixed(1);
  const ok = diff <= TOL;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${W}px  above=${r.above}px  below=${r.below}px  diff=${diff}px`);
}
console.log(bad ? `\n${bad} width(s) where the first row's air is lopsided` : "\n0 widths — the first row breathes evenly above and below");
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
