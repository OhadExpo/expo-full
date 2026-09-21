// Does the "Show" / "Filter by" label actually give the filter rail a SPINE?
//
// ExercisesView says it does: "a fixed-width spine so the two rows' controls
// start at the same x". That is true on ONE line. The row is a single
// flex-wrap container with the label as its first child, so the moment the
// chips wrap - which they do on every phone - line 2 starts at the CONTAINER's
// left edge, i.e. under the label, and the spine is gone. Measure the left edge
// of every chip line per row and report the spread.
import P from 'puppeteer-core';
import * as A from './lib/authed-page.mjs';
import { setWidth } from './lib/viewport.mjs';

const WIDTHS = process.argv.slice(2).map(Number).filter(Boolean);
const RUN = WIDTHS.length ? WIDTHS : [1500, 1100, 900, 700, 620, 470, 414, 390, 360];
const b = await P.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await A.signIn(pg, 'http://127.0.0.1:5199');
await pg.evaluateOnNewDocument(() => { try { sessionStorage.setItem('expo-portal-choice', 'trainer'); localStorage.setItem('expo-lang', 'en'); localStorage.setItem('expo-install-snooze-until', String(Date.now() + 86400000)); } catch (e) {} });
let bad = 0;
for (const W of RUN) {
  await setWidth(pg, W, 1100);
  await pg.goto('http://127.0.0.1:5199/coach/exercises', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 9000));
  const r = await pg.evaluate(() => {
    const lab = [...document.querySelectorAll('span')].filter((s) => /^(show|filter by|filter by)$/i.test((s.textContent || '').trim()));
    if (lab.length < 2) return { err: `found ${lab.length} rail labels, expected 2` };
    return lab.map((s) => {
      const row = s.parentElement;
      const label = s.textContent.trim();
      // MEASURE THE CONTROLS, NOT THE BOX AROUND THEM.
      //
      // The fix put the controls in their own `.ex-filtrow-c` wrapper. Reading
      // `row.children` then returns the label plus ONE div, which trivially has
      // one left edge, and this gate reported "1 line" at every width - green
      // by construction. Descend into the wrapper when it is there.
      // The controls are direct children again (the wrapper the first fix added
      // fought the hanging indent and was removed). Measure them, never the
      // label - the label is deliberately OUTSIDE the indent.
      const kids = [...row.children].filter((e) => e !== s);
      if (kids.length < 2) return { label, err: `only ${kids.length} control(s) found - nothing to align` };
      // Group the controls into visual LINES by their top, then take each
      // line's leftmost x. A spine means every line shares one x.
      const lines = new Map();
      for (const k of kids) {
        const r2 = k.getBoundingClientRect();
        if (!r2.width) continue;
        const key = Math.round(r2.top);
        lines.set(key, Math.min(lines.get(key) ?? Infinity, Math.round(r2.left)));
      }
      const xs = [...lines.values()];
      return { label, lines: xs.length, xs, spread: Math.max(...xs) - Math.min(...xs), labelLeft: Math.round(s.getBoundingClientRect().left) };
    });
  });
  if (r.err) { console.log(`${W}: ${r.err}`); bad++; continue; }
  const worst = Math.max(...r.map((x) => x.spread || 0));
  const ok = worst === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${W}px  ` + r.map((x) => `${x.label}: ${x.lines} line(s) starting at x=[${(x.xs || []).join(',')}]`).join('   |   '));
}
console.log(bad ? `\n${bad} width(s) where a wrapped filter line does not share the spine` : '\n0 widths - every filter line starts at the same x');
await pg.close(); b.disconnect();
process.exit(bad ? 1 : 0);
