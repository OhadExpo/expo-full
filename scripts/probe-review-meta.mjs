// Three identical day-cards, stacked - do their meta COLUMNS line up?
//
// Ohad's standing complaint about the roster was "text and borders don't align
// from card to card". The workout-review day cards have the same shape: a meta
// row of week / date / sets / video icon, mobile-styled with
// `justify-content: space-between`, which spaces by the CONTENT of each card.
// "13TH OF SEPTEMBER 2026" and "7TH OF SEPTEMBER 2026" are different widths, so
// every card puts the same field at a different x. Measure the left edge of
// field N across all cards and report the spread.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [760, 700, 620, 470, 414, 390, 360];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1300);
  await pg.goto('http://127.0.0.1:5199/coach/review', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 11000));
  const r = await pg.evaluate(() => {
    const metas = [...document.querySelectorAll('.wr-day-card .wr-meta')];
    if (metas.length < 2) return { err: `${metas.length} day-card meta row(s) on screen - need at least 2 to compare` };
    const rows = metas.map((m) => {
      const base = m.getBoundingClientRect();
      return [...m.children]
        .filter((c) => c.getBoundingClientRect().width > 0)
        .map((c) => {
          const cb = c.getBoundingClientRect();
          return { t: (c.textContent || '').trim().slice(0, 22) || '[icon]', l: Math.round(cb.left - base.left), r: Math.round(base.right - cb.right) };
        });
    });
    const n = Math.min(...rows.map((x) => x.length));
    const cols = [];
    for (let i = 0; i < n; i++) {
      const ls = rows.map((x) => x[i].l);
      const rs = rows.map((x) => x[i].r);
      cols.push({ i, sample: rows[0][i].t, lefts: ls, leftSpread: Math.max(...ls) - Math.min(...ls), rightSpread: Math.max(...rs) - Math.min(...rs) });
    }
    return { cards: rows.length, fields: n, cols, uneven: rows.some((x) => x.length !== n) };
  });
  if (r.err) { console.log(`${W}: ${r.err}`); bad++; continue; }
  // A field is aligned if EITHER its left edges agree (a left-aligned column)
  // or its right edges do (a right-aligned one). Anything else drifts.
  const off = r.cols.filter((c) => c.leftSpread > 1 && c.rightSpread > 1);
  if (off.length) bad++;
  console.log(`${off.length ? 'FAIL ' : 'ok   '} ${W}px  ${r.cards} cards x ${r.fields} fields${r.uneven ? ' (uneven field counts - compared the first ' + r.fields + ')' : ''}`);
  for (const c of r.cols) console.log(`        field ${c.i} "${c.sample}": left spread ${c.leftSpread}px, right spread ${c.rightSpread}px${c.leftSpread > 1 && c.rightSpread > 1 ? '   <-- drifts' : ''}`);
}
console.log(bad ? `\n${bad} width(s) where the day cards' meta columns do not line up` : '\n0 widths - every day card puts the same field at the same x');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
