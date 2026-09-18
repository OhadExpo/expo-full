// verify-marketing-claims.mjs — the marketing site must not contradict itself.
//
// Ohad's #5, "marketing contradictions". The fit sweep
// (verify-marketing-site.mjs) proves nothing is clipped; it says nothing about
// whether the words are TRUE relative to each other. Three real faults found
// 2026-09-18, all of the same shape — a number typed into copy, and the data
// behind it moved:
//
//   1. the comparison table quoted "290-490 NIS one-time" while the catalog
//      one scroll below it listed a 540 program;
//   2. the entry chooser promised "Twelve-week phases" while the catalog sold
//      an 8-week and a 16-week program;
//   3. the hypertrophy card claimed "60->90% week-on-week" in English and
//      "60% to 90% ACROSS THE BLOCK" in Hebrew — two different promises, and
//      the English one is far outside the ~10%/week the programming uses.
//
// So this gate reads the SOURCE OF TRUTH (expo-il/src/programs.js) and checks
// the rendered copy against it, in both languages. It fails if it cannot find
// the thing it is supposed to check — a check that silently matches nothing is
// how the fit sweep reported "clean" while measuring the coach app.
//
//   node scripts/verify-marketing-claims.mjs
import P from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.IL_BASE || 'http://127.0.0.1:5174';
const SRC = readFileSync(new URL('../expo-il/src/programs.js', import.meta.url), 'utf8');

const prices = [...SRC.matchAll(/^\s{4}price:\s*(\d+)/gm)].map((m) => +m[1]);
const weeks = [...SRC.matchAll(/^\s{4}duration:\s*'(\d+)\s*weeks?/gmi)].map((m) => +m[1]);
if (prices.length < 3 || weeks.length < 3) {
  console.log(`FAILED: parsed only ${prices.length} prices and ${weeks.length} durations out of programs.js - the gate cannot verify anything.`);
  process.exit(1);
}
const LO = Math.min(...prices), HI = Math.max(...prices);
const WLO = Math.min(...weeks), WHI = Math.max(...weeks);
console.log(`source of truth: ${prices.length} programs, ${LO}-${HI} NIS, ${WLO}-${WHI} weeks`);

const b = await P.connect({ browserURL: (process.env.CDP || 'http://127.0.0.1:9222'), defaultViewport: null, protocolTimeout: 300000 });
const pg = await b.newPage();
await pg.setViewport({ width: 1280, height: 1100 });

const bad = [];
let checked = 0;

const read = async (route, lang) => {
  await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem('expo-il-lang', l); } catch (e) {} }, lang);
  await pg.goto('about:blank');
  await pg.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3500));
  return pg.evaluate(() => (document.body.innerText || '').replace(/ /g, ' ').replace(/\s+/g, ' '));
};

for (const lang of ['he', 'en']) {
  // ── 1. Every price range printed anywhere must contain the real range ──
  const catalog = await read('/#/online', lang);
  if (catalog.length < 400) { bad.push(`${lang} /#/online rendered only ${catalog.length} chars`); continue; }

  const ranges = [...catalog.matchAll(/(\d[\d,]*)\s*[–—-]\s*(\d[\d,]*)\s*(?:NIS|₪)/g)]
    .map((m) => [+m[1].replace(/,/g, ''), +m[2].replace(/,/g, '')]);
  if (!ranges.length) {
    bad.push(`${lang} /#/online: no price range found at all - the comparison table is what this checks, so a zero means the check is dead, not that the page is clean`);
  }
  for (const [lo, hi] of ranges) {
    checked++;
    // A quoted range is a promise about the catalog. It must not exclude a
    // program the same page is selling.
    if (lo > LO || hi < HI) {
      bad.push(`${lang} /#/online: copy quotes ${lo}-${hi} but the catalog sells ${LO}-${HI} (a visitor sees a price the range said would not exist)`);
    }
  }

  // Every price shown on a card must be one of the real prices.
  // (?<![\d,]) so "1,500 NIS / month" in the private-coaching column is not
  // read as a 500 NIS catalog price.
  const shown = [...new Set([...catalog.matchAll(/(?<![\d,])(\d{3,4})\s*(?:NIS|₪)/g)].map((m) => +m[1]))];
  for (const s of shown) {
    checked++;
    const inARange = ranges.some(([lo, hi]) => s === lo || s === hi);
    if (!prices.includes(s) && !inARange) {
      bad.push(`${lang} /#/online: shows ${s} NIS, which is not a catalog price (${prices.join(', ')})`);
    }
  }

  // ── 2. The entry chooser must not promise a span the catalog breaks ──
  const chooser = await read('/#/', lang);
  if (chooser.length < 120) bad.push(`${lang} /#/ rendered only ${chooser.length} chars`);
  const spans = [...chooser.matchAll(/(\d+)\s*(?:-to-|–|—|-|עד)\s*(\d+)\s*(?:week|שבוע)/gi)]
    .map((m) => [+m[1], +m[2]]);
  const single = [...chooser.matchAll(/(twelve|sixteen|eight|\d+)[- ](?:week|שבוע)/gi)].map((m) => m[0]);
  if (spans.length) {
    for (const [lo, hi] of spans) {
      checked++;
      if (lo > WLO || hi < WHI) bad.push(`${lang} /#/: chooser promises ${lo}-${hi} week programs, catalog has ${WLO}-${WHI}`);
    }
  } else if (single.length) {
    // A single duration on the chooser is a claim about ALL programs.
    for (const one of single) {
      const head = one.split(/[- ]/)[0].toLowerCase();
      const n = ({ twelve: 12, sixteen: 16, eight: 8 })[head] ?? +head;
      if (!Number.isFinite(n) || n === 4) continue; // "four-week blocks" = the block, not the program
      checked++;
      if (weeks.some((w) => w !== n)) {
        bad.push(`${lang} /#/: chooser says "${one}" programs, but the catalog runs ${WLO}-${WHI} weeks`);
      }
    }
  }
}

// ── 3. EN and HE must make the SAME claim on each program card ──
// Numbers are language-independent: a highlight that says 60->90 in one
// language and something else in the other means one of them is wrong.
const ids = [...SRC.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)'/gmi)].map((m) => m[1]);
for (const id of ids) {
  const blockStart = SRC.indexOf(`id: '${id}'`);
  const block = SRC.slice(blockStart, blockStart + 4000);
  const grab = (key) => {
    const at = block.indexOf(key + ': [');
    if (at < 0) return null;
    return block.slice(at, block.indexOf(']', at));
  };
  const en = grab('highlights'), he = grab('highlightsHe');
  if (!en || !he) { bad.push(`${id}: highlights/highlightsHe not both present`); continue; }
  // Comments carry explanations with their own numbers - strip them first.
  const nums = (s) => (s.replace(/\/\/[^\n]*/g, '').match(/\d+/g) || []).sort().join(',');
  checked++;
  if (nums(en) !== nums(he)) {
    bad.push(`${id}: EN highlights carry numbers [${nums(en)}] and HE [${nums(he)}] - the two languages promise different things`);
  }
}

console.log('');
if (!checked) {
  console.log('FAILED: 0 claims were actually checked.');
  await pg.close(); b.disconnect(); process.exit(1);
}
for (const x of bad) console.log('  ' + x);
console.log(bad.length
  ? `${bad.length} contradiction(s) across ${checked} claims checked`
  : `0 - no contradictions, ${checked} claims checked against programs.js`);
await pg.close();
b.disconnect();
process.exit(bad.length ? 1 : 0);
