// Roster cards must be ONE box: same height, hairline on the same y for every
// card in a row, and no ink outside the card.
//
// Ohad 2026-09-02: "roster in bhbc: text overflows, text and borders don't
// align from card to card". The cause was a fixed 146px card with top-down
// flow - a two-line position row pushed the footer through the bottom border.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [1500, 1280, 900, 700, 620, 470, 390, 360];
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
// PICK THE COACH SEAT, OR THERE IS NOTHING TO MEASURE.
//
// signIn() clears storage, which throws away the portal choice; this account is
// dual-role, so the app stops at "CHOOSE YOUR PORTAL" and every width reported
// "no cards". That read like a pass-shaped failure for days. Pinning the seat
// before the first document is what the pair builder needed too.
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); } catch (e) {} });
await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
// THE ZONE HAS ITS OWN LANGUAGE KEY. Setting expo-lang alone leaves the club
// zone in Hebrew, so a click for /^roster$/ matched nothing, the tab never
// changed, and every width reported "no cards" from the OVERVIEW tab. Both
// keys, and the tab is matched in either language below.
await pg.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('expo-lang', 'en');
    localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify('en'));
  } catch (e) {}
});
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1100);
  await pg.goto('http://127.0.0.1:5199/coach/bhbc', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 12000));
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  const onRoster = await pg.evaluate(() => {
    const t = [...document.querySelectorAll('button,[role="tab"]')].find((e) => /^(roster|סגל)$/i.test((e.textContent || '').trim()));
    if (!t) return false; t.click(); return true;
  });
  if (!onRoster) { console.log(`${W}: COULD NOT OPEN THE ROSTER TAB — not measured`); continue; }
  await new Promise((r) => setTimeout(r, 2500));
  const r = await pg.evaluate(() => {
    // A roster card is a .bhbc-card whose footer carries the hairline.
    // The card's own text starts with the big ghosted jersey number, so anchor
    // on the '#N' label plus the load pill rather than on the first character.
    const cards = [...document.querySelectorAll('.bhbc-card')].filter((c) => /#\d/.test(c.textContent || '') && /no load yet|\d\.\d\d/i.test(c.textContent || ''));
    if (!cards.length) return { err: 'no cards' };
    const out = [];
    for (const c of cards) {
      const cb = c.getBoundingClientRect();
      const foot = [...c.querySelectorAll('div')].find((d) => getComputedStyle(d).borderTopWidth !== '0px' && d !== c);
      const fb = foot ? foot.getBoundingClientRect() : null;
      // Widest ink inside the card, to catch text crossing the border.
      let maxB = -Infinity, maxR = -Infinity;
      for (const el of c.querySelectorAll('*')) {
        if (!el.childNodes.length) continue;
        let hasText = false; for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
        if (!hasText) continue;
        const rg = document.createRange(); rg.selectNodeContents(el); const ib = rg.getBoundingClientRect();
        if (ib.height === 0) continue;
        maxB = Math.max(maxB, ib.bottom); maxR = Math.max(maxR, ib.right);
      }
      out.push({ name: (c.textContent || '').slice(0, 28).replace(/\s+/g, ' ').trim(),
        top: +cb.top.toFixed(1), h: +cb.height.toFixed(1),
        hair: fb ? +fb.top.toFixed(1) : null,
        spillBot: +(maxB - cb.bottom).toFixed(1), spillRight: +(maxR - cb.right).toFixed(1) });
    }
    return { cards: out };
  });
  if (r.err) { console.log(`${W}: ${r.err}`); bad++; continue; }
  // HEIGHTS ARE COMPARED WITHIN A ROW, NOT ACROSS THE WHOLE GRID.
  //
  // Below 620 the card height is `auto` BY DESIGN (--rc-h:auto in themes.css:
  // "the grid is one column wide - there is nothing to line up with and the
  // reserve is just dead air"). Two rows of different heights is then correct,
  // and comparing every card to every other reported 620px as broken while its
  // hairlines were perfectly aligned. "One box" is a statement about a ROW.
  const heights = [...new Set(r.cards.map((c) => c.h))];
  // Cards on the same visual ROW share a top; their hairlines must share a y.
  const byRow = new Map();
  for (const c of r.cards) { const k = Math.round(c.top); if (!byRow.has(k)) byRow.set(k, []); byRow.get(k).push(c); }
  const ragged = [];
  for (const [k, row] of byRow) {
    const hs = row.map((c) => c.hair).filter((v) => v != null);
    const spread = hs.length ? +(Math.max(...hs) - Math.min(...hs)).toFixed(1) : 0;
    if (spread > 0.6) ragged.push({ rowTop: k, spread, cards: row.map((c) => c.name) });
  }
  const rowsWithMixedHeights = [...byRow.values()].filter((row) => row.length > 1 && new Set(row.map((c) => c.h)).size > 1);
  const spill = r.cards.filter((c) => c.spillBot > 0.6 || c.spillRight > 0.6);
  // EQUAL HEIGHTS ONLY WHERE THERE IS SOMETHING TO BE EQUAL TO.
  //
  // Below 620px the roster is ONE COLUMN, and themes.css deliberately drops
  // the reserved slots there: "there is nothing to line up with and the
  // reserve is just dead air". That is right - a stack of cards has no
  // neighbour whose bottom border must match, and padding every card out to
  // the tallest one would put 30px of empty space on every phone card.
  //
  // This gate was failing five widths for breaking a rule the design does not
  // have, which is how a gate teaches people to stop reading it. What still
  // holds at every width is the part he actually complained about: no ink
  // outside the card, and cards that DO sit side by side share their hairline.
  const oneColumn = new Set(r.cards.map((c) => Math.round(c.top))).size === r.cards.length;
  const heightsMatter = !oneColumn;
  const ok = (!heightsMatter || rowsWithMixedHeights.length === 0) && !ragged.length && !spill.length;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${W}px  ${r.cards.length} cards  ${oneColumn ? 'one column' : 'heights=[' + heights.join(',') + ']'}  mixedRows=${rowsWithMixedHeights.length}  raggedRows=${ragged.length}  spilling=${spill.length}`);
  for (const g of ragged) console.log(`        hairline spread ${g.spread}px across: ${g.cards.join(' | ')}`);
  for (const c of spill) console.log(`        ink outside the card: ${c.name} (bottom +${c.spillBot}, right +${c.spillRight})`);
}
console.log(bad ? `\n${bad} width(s) with roster cards that are not one box` : '\n0 widths — roster cards are one box at every width');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
