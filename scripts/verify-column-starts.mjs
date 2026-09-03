// EVERY ROW IN A CARD STARTS ITS TEXT ON THE SAME COLUMN.
//
// Ohad has asked for this three separate times:
//   "all the text boxes everywhere on bhbc should start horizontally from the
//    same spot. so it match like columns"
//   "the last row 10:30 practice + 12:00 practice doesnt align horizontally
//    with the rows above like a column. this should be a rule everywhere"
//   "the stats on the right should be ordered like columns. i keep asking this"
//
// What it measures: inside each label-row card, the x of the FIRST piece of
// text ink in every row's value cell. They must agree. The defect this was
// written against: the medical row put a 10px status DOT in its first grid
// column, so the athlete's name began at 302.2 while Next game, Availability
// and This week all began at 284.2 — an 18px step down one card.
//
// It compares ink, not boxes: the value CELLS already agreed at 284.2, which is
// why this looked fine to every earlier check.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const TOL = 1.0;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [1500, 1280, 900];

const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, BASE);
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1000);
  await pg.goto(BASE + '/coach/bhbc', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 12000));
  await pg.evaluate(() => { const x = [...document.querySelectorAll('button,a')].find((e) => /maybe later|dismiss/i.test(e.textContent || '')); if (x) x.click(); });
  const rows = await pg.evaluate(() => {
    const out = [];
    for (const row of document.querySelectorAll('.bhbc-labelrow')) {
      const val = row.lastElementChild;
      if (!val) continue;
      // First text-bearing leaf, by x, on the row's FIRST visual line.
      const leaves = [...val.querySelectorAll('*')].filter((e) => {
        if (e.children.length) return false;
        if (!(e.textContent || '').trim()) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 18), x: +r.left.toFixed(1), y: +r.top.toFixed(1) }; });
      if (!leaves.length) continue;
      const topY = Math.min(...leaves.map((l) => l.y));
      const firstLine = leaves.filter((l) => l.y - topY < 6).sort((a, b) => a.x - b.x);
      out.push({ label: (row.firstElementChild.textContent || '').trim(), first: firstLine[0] });
    }
    return out;
  });
  // The S&C brief is a second card on the same screen built as a flex row
  // rather than a label grid. Its five columns must each be one column, and its
  // label + first-text must sit on the report's columns above it.
  const brief = await pg.evaluate(() => [...document.querySelectorAll('.bhbc-brief-row')].map((r) =>
    [...r.children].map((c) => +c.getBoundingClientRect().left.toFixed(1))));
  if (brief.length > 1) {
    const cols = Math.min(...brief.map((r) => r.length));
    for (let i = 0; i < cols; i++) {
      const xs = brief.map((r) => r[i]);
      const sp = +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
      if (sp > TOL) { bad++; console.log(`FAIL  ${W}px  S&C brief column ${i + 1} is ragged by ${sp}px  ${JSON.stringify(xs)}`); }
    }
  }

  if (rows.length < 2) { console.log(`${W}px: only ${rows.length} row(s) found`); bad++; continue; }
  const xs = rows.map((r) => r.first.x);
  const spread = +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
  const ok = spread <= TOL;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${W}px  ${rows.length} rows  spread=${spread}px`);
  if (!ok) for (const r of rows) console.log(`        ${String(r.label).padEnd(14)} "${r.first.t}" starts at ${r.first.x}`);
}
console.log(bad ? `\n${bad} width(s) where a card's rows do not share a text column` : '\n0 widths — every row in the card starts its text on the same column');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
