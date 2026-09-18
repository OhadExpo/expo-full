// verify-rtl-no-flip.mjs — technical strings must render in the order they
// were authored, everywhere Hebrew is on screen.
//
// Ohad, 2026-09-18, from his phone on /#/programs/couples-12 in Hebrew:
// "don't flip the exercise name and sets and reps in hebrew (anywhere)".
// The RTL paragraph direction was reordering every prescription:
//   "4 × 8"        rendered as  "8 × 4"
//   "3 × 10/leg"   rendered as  "leg/10 × 3"
//   "3 × AMRAP"    rendered as  "AMRAP × 3"
// The × and / are bidi-neutral, so the two numbers around them swap sides.
//
// "(anywhere)" is the whole instruction, so this runs over BOTH the marketing
// site and the app's Hebrew surfaces.
//
// It measures ORDER, it does not eyeball it: a Range over the first character
// and a Range over the last character of the string must come out
// left-to-right on screen. True for every correctly isolated LTR run, false
// for every flipped one.
//
//   node scripts/verify-rtl-no-flip.mjs             # marketing + app
//   TARGET=il  node scripts/verify-rtl-no-flip.mjs  # marketing only
//   TARGET=app node scripts/verify-rtl-no-flip.mjs  # app only
import P from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { signIn, assertAuthed } from './lib/authed-page.mjs';

const IL_BASE = process.env.IL_BASE || 'http://127.0.0.1:5174';
const APP_BASE = process.env.BASE || 'http://127.0.0.1:5199';
const TARGET = (process.env.TARGET || 'both').toLowerCase();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The app routes that actually render Hebrew: the club zone is Hebrew-first,
// and the athlete portal follows the profile language.
const APP_ROUTES = (process.env.ROUTES || '/coach/bhbc,/athlete,/coach/programs,/coach/workouts,/demo/athlete')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Runs in the page. Returns one entry per technical string it could measure.
const SCAN = () => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue;
    const tag = el.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TITLE') continue;
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) continue;
    const txt = node.textContent;
    // A technical string: has a digit AND a bidi-neutral separator that the
    // RTL algorithm is free to reorder around. Plain "12" cannot flip.
    if (!/\d/.test(txt)) continue;
    if (!/[×x\/@·-]/.test(txt)) continue;
    // Only measure inside an RTL context - an LTR page cannot flip anything.
    const cs = getComputedStyle(el);
    if (cs.direction !== 'rtl' && getComputedStyle(el.parentElement || el).direction !== 'rtl') {
      // still measure if the document is RTL and this element inherits it
      if (getComputedStyle(document.documentElement).direction !== 'rtl') continue;
    }
    // A Hebrew SENTENCE containing a number is prose, not a spec - Hebrew
    // words there are supposed to run right to left.
    const heb = (txt.match(/[֐-׿]/g) || []).length;
    if (heb > 2) continue;
    const a = txt.search(/\S/);
    let z = txt.length - 1;
    while (z > a && /\s/.test(txt[z])) z--;
    if (z <= a) continue;
    const rectAt = (i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); return r.getBoundingClientRect(); };
    const ra = rectAt(a), rz = rectAt(z);
    if (!ra.width || !rz.width) continue;
    if (Math.abs(ra.y - rz.y) > 2) continue; // wrapped onto two lines
    out.push({ txt: txt.trim().slice(0, 40), first: Math.round(ra.x), last: Math.round(rz.x) });
  }
  return out;
};

const bad = [];
let checked = 0;
let pagesRead = 0;

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });

const measure = (where, rows) => {
  for (const r of rows) {
    checked++;
    if (r.first > r.last) bad.push(`${where}: "${r.txt}" renders right-to-left (first char x=${r.first}, last x=${r.last})`);
  }
};

try {
  if (TARGET !== 'app') {
    const SRC = readFileSync(new URL('../expo-il/src/programs.js', import.meta.url), 'utf8');
    const ids = [...SRC.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)'/gmi)].map((m) => m[1]);
    if (!ids.length) { console.log('FAILED: no programs parsed out of programs.js.'); await pg.close(); b.disconnect(); process.exit(1); }
    await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('expo-il-lang', 'he'); } catch (e) {} });
    for (const id of ids) {
      await pg.goto('about:blank');
      await pg.goto(`${IL_BASE}/#/programs/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3500);
      pagesRead++;
      measure('il ' + id, await pg.evaluate(SCAN));
    }
    if (checked < ids.length * 5) {
      console.log(`FAILED: only ${checked} technical strings measured across ${ids.length} marketing programs - the check is not reaching the sample week.`);
      await pg.close(); b.disconnect(); process.exit(1);
    }
    console.log(`marketing: ${checked} strings across ${ids.length} program pages`);
  }

  if (TARGET !== 'il') {
    const before = checked;
    await signIn(pg, APP_BASE);
    await assertAuthed(pg, APP_BASE);
    // The app follows the profile language and the owner's is English, so
    // running it as-is measures an LTR document and reports a meaningless
    // zero. Put it in Hebrew first - that is the state the complaint is about.
    await pg.evaluate(() => {
      try {
        localStorage.setItem('expo-lang', 'he');
        // The club zone has its OWN switch (usePersistentState prefixes keys
        // with expo-collapse:) and it defaults to English, so without this the
        // one dir="rtl" surface in the app renders LTR and the sweep measures
        // nothing while reporting a clean zero.
        localStorage.setItem('expo-collapse:bhbc-lang', '"he"');
      } catch (e) {}
    });
    let rtlPages = 0;
    let tabViews = 0;
    for (const r of APP_ROUTES) {
      await pg.goto(`${APP_BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await wait(5000);
      pagesRead++;
      const isRtl = await pg.evaluate(() => getComputedStyle(document.documentElement).direction === 'rtl'
        || [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).direction === 'rtl'));
      if (isRtl) rtlPages++;
      measure('app ' + r, await pg.evaluate(SCAN));
      // "(anywhere)" includes the views behind the tab strip. The club zone
      // lands on one tab out of seven, so measuring only the landing view
      // checked a seventh of the surface and reported a clean zero for it.
      let tabs = [];
      try {
        tabs = await pg.evaluate(() => [...document.querySelectorAll('button[role="tab"]')]
          .filter((b) => b.offsetParent && b.getAttribute('aria-selected') !== 'true')
          .map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8));
      } catch (e) { tabs = []; }
      for (const label of tabs) {
        try {
          const hit = await pg.evaluate((t) => {
            const b = [...document.querySelectorAll('button[role="tab"]')]
              .find((x) => x.offsetParent && (x.innerText || '').replace(/\s+/g, ' ').trim() === t);
            if (!b) return false; b.click(); return true;
          }, label);
          if (!hit) continue;
          await wait(2200);
          tabViews++;
          measure('app ' + r + ' \u00b7 ' + label.slice(0, 18), await pg.evaluate(SCAN));
        } catch (e) { /* a tab that will not open is not a flipped string */ }
      }
    }
    if (!rtlPages) {
      console.log(`FAILED: none of the ${APP_ROUTES.length} app routes rendered any RTL context, so nothing about Hebrew was tested. Set expo-lang=he and check the language switch still works.`);
      await pg.close(); b.disconnect(); process.exit(1);
    }
    console.log(`app: ${checked - before} strings across ${APP_ROUTES.length} routes and ${tabViews} tab views (${rtlPages} routes with RTL content)`);
  }
} catch (e) {
  console.log('FAILED: ' + String(e.message || e).slice(0, 160));
  await pg.close(); b.disconnect(); process.exit(1);
}

console.log('');
if (!pagesRead || !checked) {
  console.log(`FAILED: ${pagesRead} pages read, ${checked} strings measured - nothing was actually checked.`);
  await pg.close(); b.disconnect(); process.exit(1);
}
for (const x of [...new Set(bad)].slice(0, 40)) console.log('  ' + x);
console.log(bad.length
  ? `${bad.length} flipped string(s) of ${checked} measured across ${pagesRead} Hebrew pages`
  : `0 - nothing flipped, ${checked} technical strings measured across ${pagesRead} Hebrew pages`);
await pg.close();
b.disconnect();
process.exit(bad.length ? 1 : 0);
