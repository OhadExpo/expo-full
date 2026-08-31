// verify-ink-centring.mjs — the LETTERS sit on the row's centre, not the boxes.
//
// Ohad raised this four times, and my first three passes failed because they
// measured layout BOXES. The box is almost always right. What he sees is the
// ink: a 9px label and a 13px value in one row get different line boxes, and
// centring those boxes does not centre the glyphs inside them.
//
// So this measures a Range over each child's text - the actual glyph box - and
// reports rows whose ink centres disagree. It only judges SINGLE-LINE rows: a
// label beside a multi-line value is deliberately top-aligned and comparing
// centres there reports the design as a fault.
//
// Three root causes it has already caught, all of the same family - a wrapper
// with no font-size of its own inheriting 16px and building a line box around
// smaller text:
//   - the S&C brief's bold-text wrapper (0.8px below, siblings at -0.4)
//   - the + PLAN row, mixing 10px and 13px under a RELATIVE line-height
//   - the shared Card strip title, so every card in the app
//
//   node scripts/verify-ink-centring.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1600', 10);
// 1.0px. Calibrated, not guessed: every real defect this found measured 1.2px or
// more (the S&C brief's 16px-inheriting wrapper at 1.2, the label columns at
// 1.6, the greeting at 3.6), while a Hebrew name beside Latin text sits 0.8-0.9
// apart purely from script metrics - Hebrew ink spans differently and no layout
// change closes it. Flagging that band trains you to ignore the gate.
const TOL = 1.0;

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/bhbc', '/coach/athletes']; }
};
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

const MEASURE = (tol) => {
  const out = [];
  document.querySelectorAll('div').forEach((el) => {
    const cs = getComputedStyle(el);
    if (!/flex/.test(cs.display) || cs.flexDirection.startsWith('column')) return;
    // Respect the alignment the row DECLARES, the same way the button-height
    // gate respects flex-end. A price set on the baseline - 30px number beside
    // an 11px "/ month" - is aligned on purpose, and judging it against centre
    // reports the design as the fault.
    if (cs.alignItems === 'baseline' || cs.alignItems === 'flex-end') return;
    // LEAF text only. Comparing two GROUPS - each holding a stacked label and
    // its controls - is not ink centring, and it reported the portal's week
    // selector as 2px off because one group is 4px shorter than the other. What
    // this gate is about is two runs of TEXT sharing a line.
    // TEXT, ICONS AND NUMBERS. Ohad: "make sure everything is vertically center
    // alligned vs the row and borders and vs all the other text, icons and
    // numbers." An icon is judged on its box (that IS its ink); text is judged
    // on a Range over the glyphs.
    const ICON = /^(SVG|IMG|CANVAS|INPUT|SELECT|BUTTON)$/;
    const kids = [...el.children].filter((c) => {
      if (c.getBoundingClientRect().height <= 3) return false;
      if (ICON.test(c.tagName)) return true;
      return c.children.length === 0 && (c.textContent || '').trim();
    });
    if (kids.length < 2) return;
    const r = el.getBoundingClientRect();
    if (r.height > 60 || r.height < 10) return;
    // Single-line only. A wrapped value legitimately sits top-aligned.
    const oneLine = kids.every((c) => {
      const q = c.getBoundingClientRect();
      const cs2 = getComputedStyle(c);
      const lh = parseFloat(cs2.lineHeight) || parseFloat(cs2.fontSize) * 1.2 || q.height;
      // A wrapped run is more than one line box tall; comparing its centre to a
      // single-line sibling is meaningless. 1.25 leaves room for descenders
      // without letting a two-line run through.
      return q.height <= lh * 1.25 + 2;
    });
    if (!oneLine) return;
    const mids = kids.map((c) => {
      if (/^(SVG|IMG|CANVAS|INPUT|SELECT|BUTTON)$/.test(c.tagName)) {
        const q = c.getBoundingClientRect();
        return q.height > 0 ? q.top + q.height / 2 : null;
      }
      const rng = document.createRange();
      rng.selectNodeContents(c);
      const b = rng.getBoundingClientRect();
      // An element with no text (a dot, a rule) gives a collapsed Range that can
      // land anywhere - one reported an ink centre 319px outside its own row.
      return b.height > 0 && b.width > 0 ? b.top + b.height / 2 : null;
    }).filter((v) => v != null);
    if (mids.length < 2) return;
    // All on the SAME line. A flex row that WRAPS puts its children on separate
    // lines by design - the BHBC medical row wraps the diagnosis under the name -
    // and comparing centres across lines reports a 20px "misalignment" that is
    // simply two lines of text. Each child being one line is not enough; they
    // have to share one.
    const tallest = Math.max(...kids.map((c) => {
      const cs2 = getComputedStyle(c);
      const lh = parseFloat(cs2.lineHeight) || parseFloat(cs2.fontSize) * 1.2 || 0;
      return Math.max(lh, c.getBoundingClientRect().height);
    }));
    if (Math.max(...mids) - Math.min(...mids) > tallest * 0.9) return;
    const spread = Math.max(...mids) - Math.min(...mids);
    if (spread > tol) out.push({ spread: Math.round(spread * 100) / 100, h: Math.round(r.height), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 38) });
  });
  return out.sort((a, b) => b.spread - a.spread);
};

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
const page = await b.newPage();
await page.setViewport({ width: W, height: 1000 });
let total = 0;
try {
  await signIn(page, BASE);
  await assertAuthed(page, '/coach/dashboard');
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    // Twice: a row caught mid-render invents a spread that a re-read cannot
    // reproduce, and a gate that cries wolf gets ignored.
    const first = await page.evaluate(MEASURE, TOL);
    let bad = [];
    if (first.length) {
      await new Promise((r) => setTimeout(r, 1200));
      const second = await page.evaluate(MEASURE, TOL);
      const key = (f) => f.txt + '|' + f.spread;
      const s2 = new Set(second.map(key));
      bad = first.filter((f) => s2.has(key(f)));
    }
    if (!bad.length) { console.log(`OK    ${route}`); continue; }
    total += bad.length;
    console.log(`FAIL  ${route}`);
    for (const f of bad.slice(0, 5)) console.log(`        ${String(f.spread).padStart(6)}px  h${String(f.h).padStart(3)}  ${f.txt}`);
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally { await page.close().catch(() => {}); b.disconnect(); }
console.log(`\n${total} single-line row(s) whose INK is off centre by more than ${TOL}px`);
process.exit(total ? 1 : 0);
