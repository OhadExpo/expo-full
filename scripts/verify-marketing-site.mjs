// verify-marketing-site.mjs - the marketing site fits, in both languages.
//
// expo-il is a SEPARATE Vite project on its own port with hash routing, so the
// app's route sweep never touches it - and it is the surface a prospect meets
// first. Ohad's rules apply to it exactly as to the app: no clipped words, no
// sideways scroll, every width including a phone, both languages.
//
// START IT FROM INSIDE expo-il:
//     cd expo-il && npm run dev -- --port 5174 --host 127.0.0.1
// Running `vite --config expo-il/vite.config.js` from the repo root serves
// EXPO-FULL instead, because that config sets a port and no root - the first
// run of this sweep reported "marketing site clean" while measuring the coach
// app twice. This refuses to run if what answers is not the marketing site.
//
//   node scripts/verify-marketing-site.mjs
import P from 'puppeteer-core';
import { setWidth } from './lib/viewport.mjs';
import { readFileSync } from 'node:fs';

const BASE = process.env.IL_BASE || 'http://127.0.0.1:5174';
// 19.9: the triple mobile audit needs 360 and 414 as well, and hard-coding the
// three meant the sweep could not be pointed at a phone width it had never
// tried. Default unchanged so every existing invocation measures what it did.
const WIDTHS = (process.env.WIDTHS || '1500,900,390').split(',').map(Number);

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();

// WHAT THIS GATE MUST NEVER DO IS PASS WITHOUT MEASURING ANYTHING.
// 2026-09-18: it reported "0 - marketing site clean, 18 combinations visited"
// twice - once against a DEAD port, once against port 5174 while that port was
// serving EXPO-FULL, not expo-il (`npx vite` picked up the repo-root config).
// The old identity check accepted either "a program link exists" OR
// /expo-il/i in the HTML - and the coach app LINKS to expo-il.co.il, so the
// wrong site satisfied it. So: the truth about which programs exist comes from
// the SOURCE, the site must link every one of them, and every page visited
// must actually have content.
const SRC = readFileSync(new URL('../expo-il/src/programs.js', import.meta.url), 'utf8');
const WANT = [...SRC.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)'/gmi)].map((m) => m[1]);
if (!WANT.length) {
  console.log('FAILED: no program ids parsed out of expo-il/src/programs.js - the gate cannot verify anything.');
  await pg.close(); b.disconnect(); process.exit(1);
}

try {
  await pg.goto(BASE + '/#/online', { waitUntil: 'domcontentloaded', timeout: 45000 });
} catch (e) {
  // A dead port used to be the QUIETEST way for this gate to report clean:
  // it visited nothing and printed "0 findings". Nothing answering is a FAIL.
  console.log('FAILED: nothing is answering at ' + BASE + ' (' + String(e.message || e).slice(0, 80) + ').');
  await pg.close(); b.disconnect(); process.exit(1);
}
await new Promise((r) => setTimeout(r, 6000));
const id = await pg.evaluate(() => ({
  title: document.title || '',
  progs: [...new Set([...document.querySelectorAll('a[href*="#/programs/"]')]
    .map((a) => (a.getAttribute('href') || '').split('#/programs/')[1]).filter(Boolean))],
  appOnly: !!document.querySelector('a[href="/coach"], a[href="/demo/coach"], a[href="/login"]'),
}));
// An identity check the coach app CANNOT satisfy: the catalog links programs.
if (!id.progs.length || id.appOnly) {
  console.log('FAILED: ' + BASE + ' is not serving the marketing site (title "' + id.title + '", '
    + id.progs.length + ' program links' + (id.appOnly ? ", and it has the app's /login|/coach links" : '') + ').');
  console.log('Start it from inside expo-il:');
  console.log('    cd expo-il && node ../node_modules/vite/bin/vite.js . --port 5174 --strictPort --host 127.0.0.1');
  console.log('`npx vite` from the repo root serves EXPO-FULL on 5174 and this gate then measures the wrong site.');
  await pg.close(); b.disconnect(); process.exit(1);
}
// Every program in the source must be reachable from the catalog. A program
// that exists but is not linked is a marketing fault in its own right.
const missing = WANT.filter((w) => !id.progs.includes(w));
if (missing.length) {
  console.log('FAILED: ' + missing.length + ' program(s) in programs.js are not linked from the catalog: ' + missing.join(', '));
  await pg.close(); b.disconnect(); process.exit(1);
}
const progs = WANT;
// EVERY program, not the first two, and BOTH languages. Hebrew is the default
// and the one that breaks - it is the longer text and the RTL one - but the
// English pages are what a foreign prospect sees and had never been measured.
const ROUTES = ['/#/', '/#/online', '/#/gym', ...progs.map((p) => '/#/programs/' + p)];
const LANGS = (process.env.IL_LANGS || 'he,en').split(',');
console.log(`routes: ${ROUTES.length} x langs: ${LANGS.join('/')} = ${ROUTES.length * LANGS.length} pages`);
console.log('programs found: ' + progs.join(', '));

const hits = [];
const skipped = [];
let visited = 0;
let measured = 0;
for (const W of WIDTHS) {
 for (const lang of LANGS) {
  for (const r of ROUTES) {
    try {
      await setWidth(pg, W, 950);
      await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-il-lang', l); } catch (e) {} }, lang);
      // Hash routes do not reload; go to about:blank first so each is a fresh
      // paint and a stale view cannot be measured as the next one.
      await pg.goto('about:blank');
      await pg.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 30000 });
      visited++;
      await new Promise((x) => setTimeout(x, 6000));
      const res = await pg.evaluate((VW) => {
        const out = { clip: [], docW: document.documentElement.scrollWidth,
                      // A page with nothing on it has nothing to clip, so a
                      // blank render used to read as "clean". Count the ink.
                      textLen: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length };
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          let hasText = false;
          for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
          if (!hasText) continue;
          const over = el.scrollWidth - el.clientWidth;
          if (over > 1 && !['auto', 'scroll'].includes(cs.overflowX) && cs.textOverflow !== 'ellipsis') {
            out.clip.push({ t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34), over });
          }
        }
        return out;
      }, W);
      if (res.textLen < 400) {
        hits.push({ r, W, lang });
        console.log(`EMPTY ${String(W).padEnd(5)} ${lang} ${r}  only ${res.textLen} chars of text rendered`);
      } else if (res.clip.length || res.docW > W + 1) {
        hits.push({ r, W, lang });
        console.log(`HIT ${String(W).padEnd(5)} ${lang} ${r}  docW=${res.docW} clipped=${res.clip.length}`);
        for (const c of res.clip.slice(0, 3)) console.log(`      +${c.over}px "${c.t}"`);
      }
      measured += res.textLen;
    } catch (e) { skipped.push(W + ' ' + lang + ' ' + r + ' (' + String(e.message || e).slice(0, 40) + ')'); }
  }
 }
}
console.log('');
if (skipped.length) console.log('NOT VISITED: ' + skipped.join(', '));
// The last hole: "visited" counts navigations, not measurements. If the sweep
// never actually read a page, a zero here is meaningless - say so and fail.
if (visited < ROUTES.length * LANGS.length * WIDTHS.length) {
  console.log(`INCOMPLETE: ${visited} of ${ROUTES.length * LANGS.length * WIDTHS.length} pages were reached.`);
  hits.push({ r: 'incomplete' });
}
console.log(hits.length
  ? `${hits.length} of ${visited} route/width combinations with clipped text, sideways scroll or no content`
  : `0 - marketing site clean, ${visited} route/width combinations visited, ${measured} chars of text measured`);
await pg.close();
b.disconnect();
process.exit(hits.length ? 1 : 0);
