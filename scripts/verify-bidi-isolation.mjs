// A HEBREW NAME INSIDE AN ENGLISH LINE MUST BE ISOLATED.
//
// The athlete portal's bodyweight strip is `{clientName} · {n} ENTRIES`. With a
// Latin name it reads correctly. With a Hebrew one it rendered
//
//     4 · אוהד ENTRIES        instead of        אוהד · 4 ENTRIES
//
// because the Hebrew opens an RTL run and the Unicode bidi algorithm pulls the
// neutral " · " and the following NUMBER into it, reversing them. Nothing is
// clipped, nothing overflows, no other gate here can see it - the text is
// simply in the wrong order, and only in Hebrew, which is the half of the
// product his athletes actually read. Same fault as BHBC's "+N", which
// rendered "3+ מנחם".
//
// THE RULE: an element whose direction is ltr, whose text is PART Hebrew and
// part Latin/digits, must isolate the Hebrew - <bdi>, dir="auto"/"rtl", or
// unicode-bidi: isolate/plaintext on the element carrying it.
//
// A fully-Hebrew line is fine (one RTL run, ordered correctly), which is why
// this only fires on genuinely mixed content.
//
//   node scripts/verify-bidi-isolation.mjs [base] [width] [route...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { signIn } from './lib/authed-page.mjs';
import { listTabs, clickTab } from './lib/tabs.mjs';
import { unmangleArg } from './lib/unmangle.mjs';

const routesFromManifest = () => {
  try {
    const md = fs.readFileSync('docs/SURFACES.md', 'utf8');
    return [...new Set([...md.matchAll(/`(\/[a-z0-9/-]*)`/gi)].map((m) => m[1]))].filter((r) => !/\/(login|intake)/.test(r));
  } catch { return ['/athlete', '/coach/bhbc', '/coach/dashboard']; }
};

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const W = parseInt(process.argv[3] || '1500', 10);
const ROUTES = (process.argv.length > 4 ? process.argv.slice(4) : routesFromManifest()).map(unmangleArg);

const MEASURE = () => {
  const HE = /[֐-׿]/;
  // Digits and Latin letters are what get dragged across a Hebrew run.
  const LAT = /[A-Za-z0-9]/;
  const isBoundary = (el) => {
    if (el.tagName === 'BDI') return true;
    const d = el.getAttribute && el.getAttribute('dir');
    if (d === 'auto' || d === 'rtl' || d === 'ltr') return true;
    const ub = getComputedStyle(el).unicodeBidi;
    return ub === 'isolate' || ub === 'plaintext' || ub === 'isolate-override';
  };
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!HE.test(t.nodeValue || '')) continue;
    const parent = t.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    // THE LINE is the nearest ancestor whose text mixes Hebrew with Latin or
    // digits - that is the run the bidi algorithm reorders. Above it there is
    // nothing left to scramble.
    // Walk up only as far as the shared INLINE context. A flex or grid
    // container lays each child out as its own box, and each box is its own
    // bidi paragraph - a bare text node among them becomes an anonymous item
    // and is isolated too. So Hebrew in one cell and Latin in the next cell of
    // the same row is NOT a bidi problem, which is why the billing roster
    // renders correctly at 390 despite reading "NO REQUEST<name>-" in the DOM.
    let line = parent;
    while (line && line !== document.body) {
      if (LAT.test(line.textContent || '')) break;
      const par = line.parentElement;
      if (!par || /flex|grid/.test(getComputedStyle(par).display)) { line = null; break; }
      line = par;
    }
    if (!line || line === document.body) continue;
    if (/flex|grid/.test(getComputedStyle(line).display)) continue;
    if (getComputedStyle(line).direction !== 'ltr') continue;
    // Isolation can also be done in the STRING, with U+2066..U+2069
    // (FSI/LRI/RLI/PDI). The dashboard's task lines already do exactly that,
    // and they are correct - flagging them would be the gate crying wolf.
    if (/[⁦-⁩]/.test(line.textContent || '')) continue;

    // Isolation only helps if it sits BETWEEN the Hebrew and that line. An
    // isolate on the line itself wraps the whole mixed string and reorders it
    // exactly the same way - which is why walking to the root and accepting
    // any isolate found nothing: Chrome computes unicode-bidi: isolate on
    // every flex ITEM, so that test passed on a page that was visibly wrong.
    let ok = false;
    for (let n = parent; n && n !== line; n = n.parentElement) { if (isBoundary(n)) { ok = true; break; } }
    if (ok) continue;

    // THE SIGNATURE, derived from UAX#9 rather than guessed. A number after
    // Hebrew is the case that actually breaks: rule N1 treats an EN adjacent
    // to an R run as R, so the separator AND the digits join the Hebrew run
    // and reverse with it - "אוהד · 4 ENTRIES" renders "4 · אוהד ENTRIES".
    //
    // Latin AFTER Hebrew does not break (N2 gives the neutral the paragraph's
    // own direction), and a trailing bracket or full stop after Hebrew lands
    // at the visual end correctly. Flagging those made the sweep report 132
    // lines, most of which render perfectly - a gate nobody can trust.
    // ...and only when the number does NOT go back into Hebrew. A number
    // written INSIDE a Hebrew phrase sits in the RTL run where it belongs
    // and reads correctly; the broken case is a count that belongs to the
    // LATIN side but trails a Hebrew name.
    if (!/[֐-׿][^\p{L}\p{N}]*[0-9][^֐-׿]*$/u.test((line.textContent || '').trim())) continue;

    const r = line.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    out.push({ text: (line.textContent || '').trim().slice(0, 70), tag: line.tagName.toLowerCase() });
  }
  const seen = new Set();
  return out.filter((o) => (seen.has(o.text) ? false : (seen.add(o.text), true))).slice(0, 12);
};

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 600000 });
const page = await browser.newPage();
if (W < 700) {
  await page.emulate({
    viewport: { width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
} else {
  await page.setViewport({ width: W, height: 1100 });
}

let total = 0;
try {
  await signIn(page, BASE);
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4500));
    const tabs = await listTabs(page);
    for (const tab of (tabs.length ? tabs : [null])) {
      if (tab) {
        const how = await clickTab(page, tab, 2500);
        if (how !== 'ok') {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await new Promise((r) => setTimeout(r, 4000));
          if (how === 'navigated') continue;
        }
      }
      const where = route + (tab ? ' · ' + tab : '');
      const hits = await page.evaluate(MEASURE);
      if (!hits.length) { console.log('OK    ' + where); continue; }
      total += hits.length;
      console.log('FAIL  ' + where + '  (' + hits.length + ' mixed Hebrew/Latin line(s) with no isolation)');
      for (const h of hits) console.log('        <' + h.tag + '>  ' + h.text);
    }
  }
} catch (e) {
  console.log('SWEEP ERROR:', String(e.message || e).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  browser.disconnect();
}
console.log('\n' + total + ' unisolated mixed-direction line(s) at ' + W + 'px');
process.exit(total ? 1 : 0);
