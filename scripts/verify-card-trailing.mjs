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
    // A LINK STYLED AS A BUTTON IS A CONTROL. The landing pricing cards end in
    // an <a class=button> with 11px of its own padding, and because A was not
    // in the list above the gate measured its GLYPHS and called that padding
    // dead air - 12 rows across /demo, /demo/he and their aliases, on cards
    // whose spacing is correct. A plain inline link inside a sentence is still
    // treated as text: this only applies when the anchor paints itself like a
    // control, with a border or a background or a block display.
    const isCtrl = (k) => {
      if (CONTROL.test(k.tagName)) return true;
      if (k.tagName !== 'A') return false;
      const s2 = getComputedStyle(k);
      return s2.display !== 'inline'
        || (s2.borderStyle !== 'none' && parseFloat(s2.borderWidth) > 0)
        || s2.backgroundColor !== 'rgba(0, 0, 0, 0)';
    };
    // THE CARD ITSELF CAN HOLD INK. querySelectorAll('*') returns descendants
    // only, so text sitting directly in the card was invisible to this scan.
    // The chat bubble ends in a bare text node - "— ₪399/mo (limited slots)." -
    // with the last <strong> 104px higher up, so the bubble read as 98px of
    // dead air when it is completely full. That was the largest number in the
    // sweep and it was measurement, not design.
    const leaves = [el, ...el.querySelectorAll('*')].filter((k) => {
      if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE)$/.test(k.tagName)) return false;
      if (k.getBoundingClientRect().height <= 0) return false;
      if (k !== el && isCtrl(k)) return true;
      // TEXT SITTING DIRECTLY IN AN ELEMENT COUNTS, even when that element also
      // has element children. Requiring children.length === 0 missed every
      // mixed-content node: a chat bubble is
      //   <div><span>BOT</span>the reply…</div>
      // so the only "leaf" was the SPAN at the top, the reply itself was never
      // measured, and the bubble read as 98px of dead air - the single largest
      // number in this sweep, and entirely the gate's own doing.
      return [...k.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    });
    if (leaves.length < 2) return;
    let top = Infinity, bot = -Infinity;
    for (const k of leaves) {
      let b;
      if (k !== el && isCtrl(k)) {
        b = k.getBoundingClientRect();     // a control's box IS its ink
      } else {
        // Range over this element's OWN text nodes only. selectNodeContents
        // would swallow child elements too and re-introduce their boxes.
        let first = null, last = null;
        for (const n of k.childNodes) {
          if (n.nodeType === 3 && n.textContent.trim()) { if (!first) first = n; last = n; }
        }
        if (!first) continue;
        const rng = document.createRange();
        rng.setStartBefore(first);
        rng.setEndAfter(last);
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
    // PADDING DECLARED ONE LEVEL IN IS STILL DECLARED. Many cards here set
    // padding 0 and let a body wrapper carry it - the demo's "INCOMING · 30D"
    // card is padding-bottom 0 with a full-width body at 14px, ending flush
    // with the card - so reading only the card's own padding called 14px of
    // deliberate spacing "unaccounted". Walk the chain of full-width children
    // and credit each one's bottom padding, but ONLY while the wrapper actually
    // reaches the bottom it is meant to explain; otherwise a nested card's
    // padding would be counted for its parent.
    let padBot = parseFloat(cs.paddingBottom) || 0;
    {
      let node = el;
      for (let d = 0; d < 3; d++) {
        const nb = node.getBoundingClientRect();
        const kids = [...node.children].filter((k) => k.getBoundingClientRect().height > 0);
        const wides = kids.filter((k) => k.getBoundingClientRect().width >= nb.width * 0.9);
        const wide = wides[wides.length - 1];
        if (!wide) break;
        const wr = wide.getBoundingClientRect();
        if (r.bottom - wr.bottom > padBot + 3) break;
        padBot += parseFloat(getComputedStyle(wide).paddingBottom) || 0;
        node = wide;
      }
    }
    // A TABLE'S LAST ROW CARRIES ITS OWN PADDING. When a card ends in a table,
    // the ink is inside a <td> whose padding-bottom is the space under it.
    // Measured on the demo's "All Athletes" card: the table ends 1px above the
    // card, the last cell declares 12px, and that plus line-box slack was the
    // whole 17px the gate called dead air. Credit the SMALLEST padding in the
    // last row - the one every cell in it has.
    {
      const tbl = el.querySelector('table');
      if (tbl) {
        const tr = tbl.getBoundingClientRect();
        if (r.bottom - tr.bottom <= padBot + 3) {
          const rows = [...tbl.querySelectorAll('tr')].filter((x) => x.getBoundingClientRect().height > 0);
          const lastRow = rows[rows.length - 1];
          const cells = lastRow ? [...lastRow.children].filter((c2) => c2.getBoundingClientRect().height > 0) : [];
          if (cells.length) padBot += Math.min(...cells.map((c2) => parseFloat(getComputedStyle(c2).paddingBottom) || 0));
        }
      }
    }
    // A ROW OF CELLS CARRIES ITS OWN PADDING TOO. The walk above follows a
    // single full-width body; the landing hero's stat band is instead three
    // flex cells at 1/3 width each, every one declaring 22px bottom padding
    // while the band itself declares 0. That is the same deliberate spacing,
    // arranged sideways. Credit the SMALLEST padding in the bottom row - the
    // one every cell in it actually has.
    {
      const kidsAll = [...el.children].filter((k) => k.getBoundingClientRect().height > 0);
      if (kidsAll.length > 1) {
        const maxBottom = Math.max(...kidsAll.map((k) => k.getBoundingClientRect().bottom));
        const lastRow = kidsAll.filter((k) => Math.abs(k.getBoundingClientRect().bottom - maxBottom) <= 2);
        if (lastRow.length > 1 && r.bottom - maxBottom <= padBot + 3) {
          padBot += Math.min(...lastRow.map((k) => parseFloat(getComputedStyle(k).paddingBottom) || 0));
        }
      }
    }
    if (gapBot - padBot <= slack) return;
    // ...AND NOT SPACE THE CARD DID NOT CHOOSE. A card in a grid or flex row is
    // stretched to its row's height, so the one with the least text carries the
    // slack - and that is correct design: a feature grid with ragged card
    // heights looks worse than one with a little air. Measured on /demo, the
    // landing feature cards run [201,201,201,222,222,222] - equal within each
    // row - and the flagged card's paragraph simply ends 44px up because a
    // row-mate's does not.
    //
    // So: if a same-row sibling of the same height uses the space this card is
    // being blamed for, the height is the row's decision, not this card's.
    const par = el.parentElement;
    if (par) {
      const pcs = getComputedStyle(par);
      if (/grid|flex/.test(pcs.display) && /stretch|normal/.test(pcs.alignItems)) {
        const mates = [...par.children].filter((k) => {
          if (k === el) return false;
          const q = k.getBoundingClientRect();
          return q.height > 0 && Math.abs(q.top - r.top) <= 2 && Math.abs(q.height - r.height) <= 1;
        });
        const inkBottomOf = (node) => {
          let b = -Infinity;
          for (const k of node.querySelectorAll('*')) {
            if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE)$/.test(k.tagName)) continue;
            const kb = k.getBoundingClientRect();
            if (kb.height <= 0) continue;
            if (isCtrl(k)) { if (kb.bottom > b) b = kb.bottom; continue; }
            if (k.children.length || !(k.textContent || '').trim()) continue;
            const rg = document.createRange();
            rg.selectNodeContents(k);
            const gb = rg.getBoundingClientRect();
            if (gb.height && gb.bottom > b) b = gb.bottom;
          }
          return b;
        };
        if (mates.some((m) => isFinite(inkBottomOf(m)) && inkBottomOf(m) - bot > slack)) return;
      }
    }
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

const b = await puppeteer.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null });
const page = await b.newPage();
// A phone is not a narrow desktop. `setViewport` alone leaves the desktop UA,
// DPR 1 and isMobile false, so hover styles apply, mobile-only CSS may not, and
// text metrics differ - which is how every mobile pass here read clean while
// Ohad's actual phone screen was a mess. Below 700px this emulates a real
// device; above it, a plain viewport is correct.
const applyViewport = async (pg, w) => {
  if (w <= 700) {
    await pg.emulate({
      viewport: { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    return;
  }
  await pg.setViewport({ width: w, height: 1000 });
};
await applyViewport(page, W);
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
