// verify-card-trailing.mjs — no dead air under the last row of a card.
//
// Ohad: "too much space at the bottom of each card (empty space after the last
// exercise)" and "sweep any card anywhere and get rid of those type of empty
// spaces on cards. do it full-wide-all-platforms".
//
// The measure is SYMMETRY, not an absolute number. A card's ink should sit the
// same distance from its bottom edge as from its top: if the top gap is 14px
// and the bottom gap is 40px, that difference is the dead air he is pointing
// at, and it is almost always the last row's own bottom padding landing on top
// of the card's.
//
//   node scripts/verify-card-trailing.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1600', 10);
const SLACK = 6;   // px of asymmetry we do not care about

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/athlete', '/coach/bhbc']; }
};
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

const MEASURE = (slack) => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('div,section,article').forEach((el) => {
    const cs = getComputedStyle(el);
    const bordered = (cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0)
      || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none';
    if (!bordered) return;
    const r = el.getBoundingClientRect();
    if (r.height < 60 || r.width < 160) return;
    // A container that holds a <style> tag is a layout shell, not a card.
    if (el.querySelector('style')) return;
    // Page-level containers are not cards.
    if (r.width > window.innerWidth * 0.94 && r.height > window.innerHeight * 0.9) return;
    // Ignore containers that merely hold other cards.
    // Exclude only a true pass-through wrapper - one child filling BOTH axes.
    // The earlier 92%-height test also threw away real cards whose body nearly
    // fills them, which is most of them, and the sweep saw almost nothing.
    const inner = el.querySelector('div,section');
    if (inner) {
      const q = inner.getBoundingClientRect();
      if (q.height >= r.height * 0.98 && q.width >= r.width * 0.98) return;
    }
    // STYLE and SCRIPT tags are childless and full of text, so they counted as
    // ink and put the "last line" hundreds of pixels off. That is what produced
    // entries like "extra 811" against a page wrapper.
    // INK is not only text. A card ending in a row of selects, an input, an
    // image or a chart has no text at the bottom, and counting only text made
    // those read as 70px of dead air - /coach/review-tools measured 76px of
    // "empty" space that is actually the athlete/block/week/day pickers.
    // Trimming to that would have squashed real controls against the edge.
    const CONTROL = /^(INPUT|SELECT|TEXTAREA|BUTTON|IMG|SVG|CANVAS|VIDEO|PROGRESS|METER)$/;
    const leaves = [...el.querySelectorAll('*')].filter((k) => {
      if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE)$/.test(k.tagName)) return false;
      if (k.getBoundingClientRect().height <= 0) return false;
      if (CONTROL.test(k.tagName)) return true;
      return k.children.length === 0 && (k.textContent || '').trim();
    });
    if (leaves.length < 2) return;
    let top = Infinity, bot = -Infinity;
    for (const k of leaves) {
      let b;
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON|IMG|SVG|CANVAS|VIDEO|PROGRESS|METER)$/.test(k.tagName)) {
        b = k.getBoundingClientRect();     // a control's box IS its ink
      } else {
        const rng = document.createRange();
        rng.selectNodeContents(k);
        b = rng.getBoundingClientRect();
      }
      if (!b.height) continue;
      if (b.top < top) top = b.top;
      if (b.bottom > bot) bot = b.bottom;
    }
    if (!isFinite(top) || !isFinite(bot)) return;
    const gapTop = Math.round(top - r.top);
    const gapBot = Math.round(r.bottom - bot);
    // DEAD AIR = space below the last ink BEYOND what the card itself declares.
    //
    // Comparing bottom against top looked principled and was wrong: a card whose
    // header strip bleeds to the edge has a tiny top gap BY DESIGN, so every one
    // of them read as broken - 25 athlete cards whose padding is already
    // 24/24/20 and whose bottom gap is 21. Measuring against the card's own
    // padding-bottom finds what is genuinely unaccounted for: a stray margin, an
    // empty element, a list reserving a row it never fills.
    const padBot = parseFloat(cs.paddingBottom) || 0;
    if (gapBot - padBot <= slack) return;
    // ...AND beyond the card's OWN rhythm. At 390px most cards declare zero
    // padding and let their rows carry the spacing, so a fixed 6px threshold
    // called 148 cards broken when their bottom gap simply equalled the gap
    // between their rows - which is correct design, not dead air. Dead air is
    // a bottom gap LARGER than the spacing the card uses internally.
    const kids = [...el.children].map((k) => k.getBoundingClientRect()).filter((q) => q.height > 0);
    const gaps = [];
    for (let n = 1; n < kids.length; n++) gaps.push(kids[n].top - kids[n - 1].bottom);
    if (gaps.length) {
      const sorted = gaps.slice().sort((x, y) => x - y);
      const rhythm = sorted[Math.floor(sorted.length / 2)];
      if (gapBot <= rhythm + slack) return;
    }
    const label = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34);
    const key = label + '|' + gapTop + '|' + gapBot;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ gapTop, gapBot, padBot: Math.round(padBot), extra: Math.round(gapBot - padBot), h: Math.round(r.height), label });
  });
  return out.sort((a, b) => b.extra - a.extra);
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
    const bad = await page.evaluate(MEASURE, SLACK);
    if (!bad.length) { console.log(`OK    ${route}`); continue; }
    total += bad.length;
    console.log(`FAIL  ${route}  (${bad.length})`);
    for (const f of bad.slice(0, 4)) console.log(`        bottom ${String(f.gapBot).padStart(3)}  declared pad ${String(f.padBot).padStart(3)}  unaccounted ${String(f.extra).padStart(3)}  ${f.label}`);
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally { await page.close().catch(() => {}); b.disconnect(); }
console.log(`\n${total} card(s) with space under the last row (more than ${SLACK}px beyond their own padding)`);
process.exit(total ? 1 : 0);
