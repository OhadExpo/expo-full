// verify-no-text-clipping.mjs — no word gets cut off, anywhere.
//
// Ohad: "make sure no text overflows anywhere, full platform sweep", and his
// standing rule behind it - an ellipsis is the UI deciding he does not need the
// rest of the sentence. "i cant see some of the words... never do."
//
// Two distinct faults, both reported:
//   CLIPPED   the element hides its own overflow (overflow hidden / ellipsis)
//             and its content is wider than its box - a word is being eaten
//   SPILLING  the ink extends past the element's own right or bottom edge, so
//             it either overlaps a neighbour or runs under the card border
//
// Deliberately NOT flagged: containers that scroll on purpose (overflow auto or
// scroll), which are a choice, and elements whose overflow is visible and whose
// parent is wide enough to show it.
//
//   node scripts/verify-no-text-clipping.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn, assertAuthed } from './lib/authed-page.mjs';
import { listTabs, clickTab } from './lib/tabs.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1600', 10);

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))]
      .filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/coach/athletes', '/athlete']; }
};
// THE BARE PUBLIC ROUTES WERE MEASURING A BLANK PAGE.
//
// routesFromManifest's regex stops at the `<` in `/book/<slug>`, so the list it
// built contained `/book/`, `/p/` and `/sign/` - and every one of those
// components starts `if (!slug) return;`. Three PUBLIC pages rendered nothing,
// nothing was found wrong with nothing, and the sweep printed OK. Found 19.9.
//
// Real targets come from the database now, and a target that cannot be resolved
// is DROPPED and its reason printed, so the zero always says what it covered.
const asked = process.argv.length > 4 ? process.argv.slice(4).map(unmangleArg) : null;
let ROUTES = asked || routesFromManifest().map(unmangleArg);
let PUBLIC_SKIPPED = [];
if (!asked) {
  const { publicRouteTargets, BARE_PUBLIC } = await import('./lib/public-routes.mjs');
  const got = await publicRouteTargets();
  PUBLIC_SKIPPED = got.skipped;
  ROUTES = [...ROUTES.filter((r) => !BARE_PUBLIC.includes(r)), ...got.routes];
}

const MEASURE = () => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('*').forEach((el) => {
    if (/^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE|HEAD|HTML|BODY|OPTION)$/.test(el.tagName)) return;
    const txt = (el.textContent || '').trim();
    if (!txt) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return;
    const hidesX = cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis';
    // Only leaf-ish text: a wrapper's scrollWidth reflects its children.
    //
    // ...EXCEPT when the element itself declares the truncation. A composite
    // title - `BLOCK <b>#4</b> - HYPERTROPHY` - carries nowrap and ellipsis on
    // the PARENT, so the leaf-only rule skipped it and the sweep called the
    // page clean while the athlete read "BLOCK #4 - HYPE...". Measured on
    // /demo/athlete at 390: scrollWidth 202 against clientWidth 152, 50px of
    // the block name gone, and every gate reported zero. If an element sets
    // ellipsis on itself and overflows, that is a clip whoever owns the text.
    const declaresClip = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap';
    const leafish = el.children.length === 0 || declaresClip;
    if (leafish && hidesX && el.scrollWidth > el.clientWidth + 1) {
      const key = 'C' + txt.slice(0, 30);
      if (!seen.has(key)) { seen.add(key); out.push({ kind: 'CLIPPED', by: el.scrollWidth - el.clientWidth, t: txt.slice(0, 40) }); }
      return;
    }
    if (leafish && cs.overflowX === 'visible') {
      const rng = document.createRange();
      rng.selectNodeContents(el);
      // TRAILING WHITESPACE IS NOT INK, AND UNDER pre-wrap IT IS RENDERED.
      //
      // A Range over a `white-space: pre-wrap` block includes the space that
      // ends a wrapped line, and that space is painted past the content edge -
      // about 4px at 13px. Measured 19.9: the demo message bubble was reported
      // "SPILLING by 4px" on six routes, the gate's own excerpt ended in a
      // space, and the element's scrollWidth was exactly its box width. Nothing
      // was wrong; I changed two files before measuring it. Ending the range on
      // the last non-space character measures the letters instead.
      const last = el.lastChild;
      if (last && last.nodeType === 3) {
        const v = last.nodeValue || '';
        let end = v.length;
        while (end > 0 && /\s/.test(v[end - 1])) end--;
        if (end > 0) rng.setEnd(last, end);
      }
      const ink = rng.getBoundingClientRect();
      // Both edges: in a right-to-left layout the ink spills out of the LEFT side,
      // which a right-edge-only check reported as clean (17.9, Hebrew sweep).
      const over = Math.round(Math.max(ink.right - r.right, r.left - ink.left));
      // Under pre-wrap / pre-line / pre, the space AT A WRAP POINT is preserved
      // and painted past the content edge, and a Range includes it - so every
      // wrapped message bubble read as "SPILLING by 4px". Trimming the end of
      // the text node does not help: the space is mid-string, at the break.
      // For those three modes only, require the element's own scroll box to
      // actually overflow before believing the range. Everywhere else the rule
      // is unchanged, because glyph overhang is real ink that scrollWidth does
      // not see.
      const spacePainted = /^pre(-wrap|-line)?$/.test(cs.whiteSpace);
      const scrollAgrees = !spacePainted || el.scrollWidth > el.clientWidth + 1;
      if (over > 2 && ink.width > 0 && scrollAgrees) {
        const key = 'S' + txt.slice(0, 30);
        if (!seen.has(key)) { seen.add(key); out.push({ kind: 'SPILLING', by: over, t: txt.slice(0, 40) }); }
      }
    }
  });
  return out.sort((a, b) => b.by - a.by);
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
  // (page, base, route) - this used to pass the route AS the base and ignore the result,
  // so a signed-out browser measured the login page and still printed OK (17.9).
  if (!(await assertAuthed(page, BASE, '/coach/dashboard'))) { process.exitCode = 2; throw new Error('not signed in'); }
  // THE LANGUAGE IS SET IN BOTH DIRECTIONS, NOT ONLY INTO HEBREW.
  //
  // This used to write expo-lang only when HE=1, so a run WITHOUT it measured
  // whatever the debug profile happened to be left on. On 19.9 that produced a
  // sweep whose views were mostly English and one of which was labelled
  // "התאמהMatching" - and I could not say what language the zero covered,
  // which makes the zero worthless. Now the run states it and sets it.
  const LANG = process.env.HE === '1' ? 'he' : 'en';
  await page.evaluate((l) => {
    localStorage.setItem('expo-lang', l);
    localStorage.setItem('expo-collapse:bhbc-lang', JSON.stringify(l));
  }, LANG);
  console.log(`language: ${LANG}  ·  ${ROUTES.length} route(s)  ·  ${W}px`);
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));

    // Tabs hide most of a screen, and a page-load-only sweep reports the hidden
    // parts as clean. Same pattern the button-height gate already uses: walk
    // every tab on the route, not just the one it lands on.
    const tabs = await listTabs(page);
    for (const tab of (tabs.length ? tabs : [null])) {
      if (tab) {
        // A route link wearing a tab role (the Exercises sub-tabs) lands on a
        // DIFFERENT screen; measuring it and filing it under this route would
        // be a lie, and it is swept under its own SURFACES.md entry anyway.
        const how = await clickTab(page, tab, 2500);
        if (how !== 'ok') {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await new Promise((r) => setTimeout(r, 4000));
          if (how === 'navigated') continue;
        }
      }
      const where = route + (tab ? ' · ' + tab : '');
      const first = await page.evaluate(MEASURE);
      let bad = [];
      if (first.length) {
        await new Promise((r) => setTimeout(r, 1200));
        const second = await page.evaluate(MEASURE);
        const key = (f) => f.kind + f.t + f.by;
        const s2 = new Set(second.map(key));
        bad = first.filter((f) => s2.has(key(f)));
      }
      if (!bad.length) { console.log(`OK    ${where}`); continue; }
      total += bad.length;
      console.log(`FAIL  ${where}  (${bad.length})`);
      for (const f of bad.slice(0, 5)) console.log(`        ${f.kind.padEnd(8)} by ${String(f.by).padStart(4)}px  "${f.t}"`);
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally { await page.close().catch(() => {}); b.disconnect(); }
console.log(`\n${total} place(s) where text is cut off or spills its box at ${W}px — across ${ROUTES.length} route(s)`);
// A zero has to say what it could NOT reach, or it reads as coverage it does
// not have.
for (const why of PUBLIC_SKIPPED) console.log(`  NOT MEASURED  ${why}`);
process.exit(total ? 1 : 0);
