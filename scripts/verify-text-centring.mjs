// verify-text-centring.mjs — the LETTERS must sit on the control's centre.
//
// Ohad reported the roster ACTIVE pill as "not center vertically aligned" three
// times. Two passes failed because they measured the BOX, which was already
// centred to 0.00px. The defect was the ink: line-height 10px on a 10px Nord
// label whose glyph box measures 12px, so flex centred the LINE box and the
// letters rode 0.60px high, right beside a border that made it obvious.
//
// That mechanism is not specific to one pill, so this looks for it everywhere:
// any control with centred content where a Range over the text disagrees with
// the element's own centre.
//
// Sub-pixel rendering means small offsets are unavoidable; the threshold is set
// at 0.5px, comfortably below what he spotted by eye and above the noise.
//
//   node scripts/verify-text-centring.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';
import { setWidth } from './lib/viewport.mjs';
import { INK_FN } from './lib/ink.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1600', 10);
const TOL = 0.5;

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/athletes', '/coach/bhbc']; }
};
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

const MEASURE = (tol) => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('button, a, [role="button"]')) {
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 12 || r.height > 60 || r.width < 12) continue;
    const cs = getComputedStyle(el);
    // Only controls that CLAIM to centre their content vertically.
    if (!/flex/.test(cs.display) || cs.alignItems !== 'center') continue;
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length > 24) continue;
    // THE LETTERS, not the font's content box. See the note below: this gate
    // used the Range rect, which is the font's box - 12px tall on a 10px Nord
    // label because of the ascent/descent overrides - and reported 0.6px on
    // 207 controls whose actual glyphs are centred to a quarter of a pixel.
    // window.__ink takes the baseline from the Range LINE BOX (so flex
    // centring is respected) and the ascent/descent from canvas
    // actualBoundingBox (so it is the ink), which is exactly the combination
    // the 09-04 note asked for and did not have.
    // __ink(el) returns a BOX for an element that has children, and most of
    // these controls wrap their label in a span. Requiring kind === 'text'
    // would have skipped nearly all of them and printed a clean zero, which is
    // the failure mode this whole evening has been about. Fall back to the
    // union of the leaf text inside.
    window.__tcScanned = (window.__tcScanned || 0) + 1;
    let ink = window.__ink(el);
    if (!ink || ink.kind !== 'text') {
      const leaves = [];
      for (const d of el.querySelectorAll('*')) {
        if (d.children.length) continue;
        const k = window.__ink(d);
        if (k && k.kind === 'text') leaves.push(k);
      }
      if (!leaves.length) continue;
      const top = Math.min(...leaves.map((k) => k.top));
      const bot = Math.max(...leaves.map((k) => k.bot));
      ink = { top, bot, mid: (top + bot) / 2, kind: 'text' };
    }
    const tb = { top: ink.top, height: ink.bot - ink.top };
    if (!(tb.height > 0)) continue;
    const off = ink.mid - (r.top + r.height / 2);
    if (Math.abs(off) <= tol) continue;
    const key = txt + '|' + Math.round(off * 10);
    if (seen.has(key)) continue;
    seen.add(key);
    // A BORDER is what makes this visible.
    //
    // The mechanism is app-wide and UNIFORM: 213 controls share it, the whole
    // top nav included, every one off by the same 0.6px. Being uniform, it
    // creates no relative misalignment between controls - which is why he
    // reported the bordered ACTIVE pill three times and never mentioned the
    // nav. A border gives the eye a reference edge; bare text on a bare
    // surface has none.
    //
    // So bordered controls FAIL and borderless ones are counted for
    // information only. Changing line-height at 128 call sites to chase a
    // sub-pixel offset nobody can see would risk real layout for no gain.
    //
    // WHAT THIS USED TO MEASURE, AND WHY IT WAS WRONG (2026-09-04 -> 2026-09-18).
    //
    // It took the Range rect, which is the font's CONTENT BOX, not the letters.
    // On the nav's "Dashboard" at 10px Nord the range is 12px tall -
    // ascent-override 93.5% plus descent-override 26.5% - and sits 0.6px high in
    // a 32px control, while canvas TextMetrics puts the real ink at 8px (cap
    // ascent 7, descent 1), centred to 0.25px. So it reported 207 controls as
    // off centre when the GLYPHS were fine, and the note here said so.
    //
    // Two dead ends were recorded, and they still stand:
    //   - Rebalancing the faces to 99.5%/20.5% changed NOTHING. Tried twice,
    //     the second time with the browser cache cleared. Reverted.
    //   - Deriving the ink from canvas metrics INSIDE this gate made it worse
    //     (199 -> 236), because locating the baseline from fontBoundingBox
    //     fractions does not agree with the overridden metrics.
    //
    // The fix was the second dead end done properly, and it needed a tool that
    // did not exist on 09-04: scripts/lib/ink.mjs takes the BASELINE from the
    // Range line box - which respects flex centring - and the ascent/descent
    // from canvas actualBoundingBox. That is the ink, and it is the same
    // measurer the whole-app sweep uses, so the two gates can no longer
    // disagree about where a letter is.
    const bordered = cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0;
    out.push({ t: txt.slice(0, 20), off: Math.round(off * 100) / 100, bordered,
      h: Math.round(r.height), lh: cs.lineHeight, fs: cs.fontSize, inkH: Math.round(tb.height * 10) / 10 });
  }
  return out;
};

const b = await puppeteer.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null });
const page = await b.newPage();
await setWidth(page, W, 1000);
let total = 0;
// A zero has to say how many controls it looked at. The new measurement
// skips anything __ink cannot read as text, and without this a filter that
// quietly matched nothing would print a clean zero.
let scanned = 0;
try {
  await signIn(page, BASE);
  if (!(await assertAuthed(page, BASE, '/coach/dashboard'))) { process.exitCode = 2; throw new Error('not signed in - see above'); }
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    await page.evaluate(INK_FN);
    await page.evaluate(() => { window.__tcScanned = 0; });
    const first = await page.evaluate(MEASURE, TOL);
    scanned += await page.evaluate(() => window.__tcScanned || 0);
    let bad = [];
    if (first.length) {
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate(INK_FN);
      const second = await page.evaluate(MEASURE, TOL);
      const key = (f) => f.t + '|' + f.off;
      const s2 = new Set(second.map(key));
      bad = first.filter((f) => s2.has(key(f)));
    }
    const hard = bad.filter((f) => f.bordered);
    const soft = bad.filter((f) => !f.bordered);
    if (!hard.length) { console.log(`OK    ${route}${soft.length ? `   (${soft.length} borderless, informational)` : ''}`); continue; }
    total += hard.length;
    console.log(`FAIL  ${route}`);
    for (const f of hard.slice(0, 6)) console.log(`        "${f.t}" off ${f.off}px  (h ${f.h}, line-height ${f.lh}, font ${f.fs}, ink ${f.inkH})`);
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally { await page.close().catch(() => {}); b.disconnect(); }
console.log(`\n${total} BORDERED control(s) whose text is off its own centre by more than ${TOL}px — ${scanned} control(s) measured`);
if (!scanned) { console.log('FAILED: nothing was measured, so the zero means nothing.'); process.exit(1); }
process.exit(total ? 1 : 0);
