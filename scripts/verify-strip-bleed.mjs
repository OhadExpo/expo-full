// A header strip must not be wider than the box it lives in.
//
// RefinedHeaderStrip cancels its parent Card's padding with a negative margin
// so it reaches the card's border. Inside a container with NO padding that does
// the opposite - on /coach/sessions at 390 the floor bar's strip ran 28px wider
// than its own box (measured -1.2px to 391.6px). This catches the rest.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const ROUTES = ['/coach', '/coach/sessions', '/coach/sessions-single', '/coach/billing', '/coach/bugs',
  '/coach/challenges', '/coach/messages', '/coach/review-tools', '/coach/calendar', '/coach/bhbc',
  '/coach/tasks', '/coach/programs', '/coach/athletes', '/athlete'];
const WIDTHS = [1500, 390];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, BASE);
let bad = 0;
for (const W of WIDTHS) {
  for (const r of ROUTES) {
    await setWidth(pg, W, 950);
    await pg.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    await new Promise((x) => setTimeout(x, 5000));
    await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
    const hits = await pg.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('div')) {
        const cs = getComputedStyle(el);
        // A bleeding strip is the only thing in the app with a negative inline margin.
        const ml = parseFloat(cs.marginLeft), mr = parseFloat(cs.marginRight);
        if (!(ml < -0.5 || mr < -0.5)) continue;
        // The contract is "the strip reaches the CARD's border", so the box to
        // compare against is the nearest ancestor that actually draws one - not
        // the direct parent, which is often an unpadded wrapper INSIDE the card
        // and would make every legitimate bleed look like a defect.
        let card = el.parentElement;
        while (card && parseFloat(getComputedStyle(card).borderLeftWidth || 0) < 0.5 && card !== document.body) card = card.parentElement;
        if (!card || card === document.body) continue;
        const e = el.getBoundingClientRect(), c = card.getBoundingClientRect();
        const overL = c.left - e.left, overR = e.right - c.right;
        if (overL > 0.5 || overR > 0.5) {
          out.push({ txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34), overL: +overL.toFixed(1), overR: +overR.toFixed(1) });
        }
      }
      return out;
    });
    if (hits.length) { bad += hits.length; console.log(`FAIL ${W}px ${r}`); for (const h of hits) console.log(`       "${h.txt}" sticks out ${h.overL}/${h.overR}px past its card border`); }
    else console.log(`ok   ${W}px ${r}`);
  }
}
console.log(bad ? `\n${bad} strip(s) wider than the box they live in` : '\n0 strips bleed past their box');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
