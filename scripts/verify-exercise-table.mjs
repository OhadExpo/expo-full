// THE EXERCISE TABLE READS AT EVERY WIDTH.
//
// Ohad's standing complaint is "i cant see some of the words". Measured at 900,
// the header row read "SECONDAR MEDIA": the 7 taxonomy columns were shown down
// to 700px but were far too narrow for their own labels. Letting the words
// break was worse - POSITI/N, PRIMAR/Y MUSCLE/S - breaking mid-syllable, which
// he rejects. Below 1200 the taxonomy columns (91% empty anyway) now go, and
// the exercise NAME takes the room.
//
// This asserts three things at once, because fixing one exposed the next:
//   - no header or cell clips its own box
//   - the table FILLS its container (hiding the cells alone left the <col>
//     holding its percentage, so content crowded into 374px of a 900px table)
//   - the page never scrolls sideways
//
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, BASE);
let bad = 0;
for (const W of [1600, 1400, 1202, 1198, 900, 750, 702, 390]) {
  await setWidth(pg, W, 950);
  await pg.goto(BASE + '/coach/exercises', { waitUntil: 'domcontentloaded' });
  // POLL, do not guess. A fixed 7s wait passed at 750 and 900 and reported
  // "no table" at 1198 and above - not a regression, just more columns and
  // 1,476 rows taking longer to paint. A gate that fails on its own impatience
  // is worse than no gate: it cries wolf and gets ignored.
  for (let k = 0; k < 60; k++) {
    await new Promise(r => setTimeout(r, 500));
    if (await pg.evaluate(() => !!document.querySelector('.ex-table tbody tr'))) break;
  }
  await new Promise(r => setTimeout(r, 1200));
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find(e => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  const r = await pg.evaluate(() => {
    const clipped = [];
    for (const el of document.querySelectorAll('.ex-table th, .ex-table td')) {
      const over = el.scrollWidth - el.clientWidth;
      if (over > 1 && !['auto','scroll'].includes(getComputedStyle(el).overflowX)) clipped.push(((el.textContent||'').trim().slice(0,18)) + ' +' + over);
    }
    const t = document.querySelector('.ex-table');
    const heads = [...document.querySelectorAll('.ex-table thead th')].filter(h => getComputedStyle(h).display !== 'none').map(h => (h.textContent||'').trim());
    return { cols: heads.length, heads: heads.join('|'),
      tableW: t ? Math.round(t.getBoundingClientRect().width) : null,
      hostW: t && t.parentElement ? Math.round(t.parentElement.getBoundingClientRect().width) : null,
      docOver: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), clipped };
  });
  const fills = r.hostW && Math.abs(r.tableW - r.hostW) <= 2;
  const ok = r.clipped.length === 0 && r.docOver === 0 && fills;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(W).padStart(4)}  cols=${r.cols} table=${r.tableW}/${r.hostW}${fills ? '' : ' NOT FILLED'} docOver=${r.docOver} clipped=${r.clipped.length}${r.clipped.length ? ' ' + r.clipped.join(', ') : ''}\n       ${r.heads}`);
}
console.log(bad ? `\n${bad} width(s) with a clipped or unfilled exercises table` : '\n0 — the exercises table reads clean at every width');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
