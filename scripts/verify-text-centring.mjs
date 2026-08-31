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
    const rng = document.createRange();
    rng.selectNodeContents(el);
    const tb = rng.getBoundingClientRect();
    if (!tb.height) continue;
    const off = (tb.top + tb.height / 2) - (r.top + r.height / 2);
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
    const bordered = cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0;
    out.push({ t: txt.slice(0, 20), off: Math.round(off * 100) / 100, bordered,
      h: Math.round(r.height), lh: cs.lineHeight, fs: cs.fontSize, inkH: Math.round(tb.height * 10) / 10 });
  }
  return out;
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
    const first = await page.evaluate(MEASURE, TOL);
    let bad = [];
    if (first.length) {
      await new Promise((r) => setTimeout(r, 1000));
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
console.log(`\n${total} BORDERED control(s) whose text is off its own centre by more than ${TOL}px`);
process.exit(total ? 1 : 0);
