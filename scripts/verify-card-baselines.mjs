// CARDS SITTING SIDE BY SIDE SHARE THEIR HORIZONTAL LINES.
//
// Ohad 2026-09-03: "make all the rows have the same spacing between each other
// in each of the cards (all of them) but keep the symmetrical rules we have" and
// "the borders need to align to remember!" — the "to remember" is why this is a
// gate and not a one-time fix.
//
// The design already reserves a fixed slot per section so every card's dividers
// land on the same lines. What broke it was a SECOND card variant — the couple
// card — that never got the slot: 4 of 25 cards had none, and 6 of 13 rows put
// FINANCIALS on two baselines up to 16.6px apart.
//
// This measures the thing he actually looks at: for every row of cards, the y of
// each section label, and the y of the action row's top border. A new card
// variant that forgets the slot fails here immediately.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

// TWO TOLERANCES, because two different things are being measured.
//
// The ACTION BORDER is structural: it is pinned to the foot of a fixed-height
// card, so any drift means a card has overflowed and it is a real defect. 1px.
//
// A SECTION LABEL rides on the text above it, and that text legitimately
// differs between athletes — "Online Client" against "Gym, Single · 8 sessions
// left" makes the TRAINING block 67.2px in one card and 69.2 in another, which
// walks the label below it 1.8px. Reserving the worst case would eat the card's
// entire 2px of slack (content 410 in 412) and put every longer line one word
// from clipping, and "i cant see some of the words" is the thing that must
// never happen. So labels get 2px, and anything beyond that is a real break.
const TOL_ACTION = 1.0;
const TOL_LABEL = 2.0;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [1500, 1280];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, BASE);
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1000);
  await pg.goto(BASE + '/coach/athletes', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 11000));
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });

  const res = await pg.evaluate(() => {
    const cards = [...document.querySelectorAll('.tv-athlete-card')];
    if (!cards.length) return { err: 'no athlete cards' };
    const LABELS = ['financials', 'training', 'bodyweight'];
    const rows = new Map();
    for (const c of cards) {
      const k = Math.round(c.getBoundingClientRect().top);
      if (!rows.has(k)) rows.set(k, []);
      const base = c.getBoundingClientRect();
      const at = {};
      for (const el of c.querySelectorAll('*')) {
        if (el.children.length) continue;
        const t = (el.textContent || '').trim().toLowerCase();
        const hit = LABELS.find((l) => t === l || t.startsWith(l + ' '));
        if (hit && at[hit] === undefined) at[hit] = +el.getBoundingClientRect().top.toFixed(1);
      }
      // The action row is the pair of buttons at the foot of the card.
      const act = [...c.querySelectorAll('div')].find((d) => {
        const bb = [...d.querySelectorAll('button')];
        return bb.length === 2 && /portal/i.test(d.textContent || '');
      });
      rows.get(k).push({
        name: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16),
        h: +base.height.toFixed(1),
        slot: !!c.querySelector('.tv-contact-slot'),
        at, actionTop: act ? +act.getBoundingClientRect().top.toFixed(1) : null,
      });
    }
    return { cards: cards.length, noSlot: cards.filter((c) => !c.querySelector('.tv-contact-slot')).length,
      rows: [...rows.entries()].map(([top, cs]) => ({ top, cs })) };
  });

  if (res.err) { console.log(`${W}px: ${res.err}`); bad++; continue; }
  let issues = 0;
  if (res.noSlot) { issues++; console.log(`FAIL ${W}px  ${res.noSlot} of ${res.cards} cards have no reserved contact slot`); }
  for (const { top, cs } of res.rows) {
    if (cs.length < 2) continue;
    for (const key of ['financials', 'training', 'bodyweight', 'actionTop']) {
      const vals = cs.map((c) => (key === 'actionTop' ? c.actionTop : c.at[key])).filter((v) => v != null);
      if (vals.length < 2) continue;
      const spread = +(Math.max(...vals) - Math.min(...vals)).toFixed(1);
      const tol = key === 'actionTop' ? TOL_ACTION : TOL_LABEL;
      if (spread > tol) {
        issues++;
        console.log(`FAIL ${W}px  row@${top}  ${key.toUpperCase()} sits on ${new Set(vals).size} baselines, ${spread}px apart  ${JSON.stringify(vals)}`);
      }
    }
    const hs = [...new Set(cs.map((c) => c.h))];
    if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > TOL_ACTION) {
      issues++; console.log(`FAIL ${W}px  row@${top}  card heights differ: ${hs.join(' / ')}`);
    }
  }
  bad += issues;
  if (!issues) console.log(`ok   ${W}px  ${res.cards} cards, ${res.rows.length} rows — every section and every action border on one line`);
}
console.log(bad ? `\n${bad} alignment problem(s) across the athlete cards` : '\n0 — cards side by side share every horizontal line');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
